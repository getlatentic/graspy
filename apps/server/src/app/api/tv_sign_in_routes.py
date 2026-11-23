"""Signing a TV in from a phone: the OAuth device authorization grant (RFC 8628), with the phone's
confirmation showing what it approves. docs/TV_SIGN_IN.md has the flow and the threat model.

The TV asks for a request and polls it with its device code. A parent's phone (a session made from
a Google sign-in just now) looks the short code up, which holds the request for that account,
sees the device, types the last four characters of the code as the TV shows them, and approves it
for one of the account's learners or denies it. The TV then shows whom it is to be linked to, and
takes its session, once, when the person at the TV continues. Nothing here is open to a TV except
starting, polling, continuing, cancelling, renewing and signing out, each by a secret only it
holds."""

from __future__ import annotations

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from pydantic import Field

from ..account import tv_links, tv_sessions
from ..account.directory import Learner, LearnerId, account_key, learner_key
from ..account.learners import NoSuchLearner, learner_of
from ..account.tv_codes import (
    UNKNOWN_COUNTRY,
    confirmation_matches,
    country_bucket,
    country_of,
    device_label,
    normalised_user_code,
)
from ..learner.time import now_ms
from ..security.guard import Session, require_session
from ..security.rate_limit import client_key, prefix_of, source_of
from ..wire import Wire
from .account_parent_routes import ParentUid
from .budget import spend, too_many
from .consent_proof import refusal
from .routes import SessionResponse, learner_session
from .service_consent import service_consent_refusal


async def _no_store(response: Response) -> None:
    """Every answer here may carry a session or a credential: nothing keeps a copy."""
    response.headers["Cache-Control"] = "no-store"


logger = logging.getLogger(__name__)

tv_sign_in_router = APIRouter(
    prefix="/tv-sign-in", tags=["tv-sign-in"], dependencies=[Depends(_no_store)]
)

DEV_WEB_ORIGIN = "http://localhost:5173"
# Where the web app answers on a phone; the code rides in the fragment, which no server is sent.
LINK_PATH = "/link"
NOT_VALID = ("code_not_found", "That code is not valid. Check the TV and try again")


def _database(request: Request):
    return request.app.state.tv_db


def _source(request: Request) -> str:
    """The network a request counts against: its address, or an IPv6 address's /64."""
    return source_of(client_key(request.scope))


def _prefix(request: Request) -> str:
    """The wider network around the source: an IPv4 /24, an IPv6 /48."""
    return prefix_of(client_key(request.scope))


async def _spend(request: Request, key: str) -> None:
    """One of the pairing budget, kept per key."""
    await spend(request.app.state.pairing_limiter, key)


def _web_origin(request: Request) -> str:
    """Where the phone is sent: the origin that asked if it is one of those configured by name,
    else the first of them. A wildcard rule (preview deployments) allows an origin to call the
    API, but is not trusted to say where a person is sent."""
    exact = [o for o in request.app.state.framing_hosts if "*" not in o]
    asked = request.headers.get("origin")
    if asked and asked in exact:
        return asked
    return exact[0] if exact else DEV_WEB_ORIGIN


def _not_valid() -> HTTPException:
    return refusal(404, *NOT_VALID)


class Requested(Wire):
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    expires_in: int
    interval: int


@tv_sign_in_router.post("", response_model=Requested, status_code=201)
async def request_link(request: Request) -> Requested:
    """A TV asks to be signed in. The device code is for the TV alone; the short code is what
    the person reads off its screen. One source holds a few requests open at a time, and is told
    to slow down (429) before everyone is told the service is full (503)."""
    await _spend(request, f"tv-start:{_source(request)}")
    await _spend(request, f"tv-start-prefix:{_prefix(request)}")
    try:
        started = await tv_links.start(
            _database(request),
            request.app.state.session_secret,
            device_label(request.headers.get("user-agent")),
            country_bucket(request.headers.get("cf-ipcountry")),
            _source(request),
            _prefix(request),
            now_ms(),
        )
    except tv_links.TooManyFromSource:
        raise too_many() from None
    except tv_links.TooManyOpenLinks:
        raise refusal(
            503, "tv_sign_in_busy", "Signing in a TV is busy. Try again in a minute"
        ) from None
    uri = _web_origin(request) + LINK_PATH
    return Requested(
        device_code=started.device_code,
        user_code=started.user_code,
        verification_uri=uri,
        verification_uri_complete=f"{uri}#code={started.user_code}",
        expires_in=started.expires_in,
        interval=started.interval,
    )


class Polling(Wire):
    device_code: str = Field(min_length=20, max_length=128)


class Approver(Wire):
    """Who approved, for the person at the TV to recognise or not."""

    account: str | None = None
    label: str | None = None
    country: str | None = None


class Polled(Wire):
    status: Literal[
        "pending", "slow_down", "expired", "denied", "linking", "full", "approved"
    ]
    interval: int | None = None
    # With `linking`, whom the TV is to be linked to, for the person at the TV to confirm. With
    # `approved` (answering a continue): the TV's session, the credential that renews it, and
    # who it learns as.
    token: str | None = None
    expires_in: int | None = None
    refresh_token: str | None = None
    account: str | None = None
    learner: Learner | None = None
    approver: Approver | None = None


async def _approved_learner(request: Request, uid: str, learner_id: str) -> Learner:
    """The learner an approved request is for, if the account still holds them and their parent's
    agreement stands. Raises the refusal otherwise: 404 or 403 for what will not change, and
    whatever else went wrong (503) for what may."""
    try:
        learner = await learner_of(request.app.state.keeping, uid, learner_id)
    except NoSuchLearner:
        raise refusal(404, "no_such_learner", "No such learner") from None
    refused = await service_consent_refusal(request.app, learner_key(uid, learner.id))
    if refused is not None:
        raise refused
    return learner


# What will not come right by asking again: the learner is gone or the parent's agreement is.
GONE = (403, 404)


@tv_sign_in_router.post(
    "/token", response_model=Polled, response_model_exclude_none=True
)
async def poll_link(request: Request, body: Polling) -> Polled:
    """The TV's poll. `slow_down` asks for a longer interval; `expired` also answers a code that
    is unknown or whose session was already taken; `linking` says the phone approved, and names
    the learner for the person at the TV to confirm (no session is given yet)."""
    polled = await tv_links.poll(_database(request), body.device_code, now_ms())
    if polled.status != tv_links.LINKING:
        return Polled(status=polled.status, interval=polled.interval)
    try:
        learner = await _approved_learner(
            request, polled.account_uid, polled.learner_id
        )
    except HTTPException as refused:
        if refused.status_code not in GONE:
            raise
        await tv_links.cancel(_database(request), body.device_code)
        return Polled(status=tv_links.DENIED)
    return Polled(
        status=tv_links.LINKING,
        interval=polled.interval,
        learner=learner,
        approver=Approver(
            account=polled.approver_hint,
            label=polled.approver_label,
            country=polled.approver_country,
        ),
    )


@tv_sign_in_router.post(
    "/continue", response_model=Polled, response_model_exclude_none=True
)
async def continue_link(request: Request, body: Polling) -> Polled:
    """The person at the TV confirms the learner it is to be linked to: the TV takes its session,
    once, and the credential that renews it."""
    now = now_ms()
    approved = await tv_links.approved_for(_database(request), body.device_code, now)
    if approved is None:
        return Polled(status=tv_links.EXPIRED)
    try:
        learner = await _approved_learner(
            request, approved["account_uid"], approved["learner_id"]
        )
    except HTTPException as refused:
        if refused.status_code not in GONE:
            raise
        await tv_links.cancel(_database(request), body.device_code)
        return Polled(status=tv_links.DENIED)
    taken = await tv_sessions.take(_database(request), body.device_code, now)
    if taken is None:
        # Still approved: the account holds the most TVs. It is not used up; the person removes
        # one on their phone and continues.
        if await tv_links.approved_for(_database(request), body.device_code, now):
            return Polled(status="full")
        return Polled(status=tv_links.EXPIRED)
    session = learner_session(request, taken.account_uid, learner, tv=taken.id)
    return Polled(
        status=tv_links.APPROVED,
        token=session.token,
        expires_in=session.expires_in,
        refresh_token=taken.refresh_token,
        account=taken.account_uid,
        learner=learner,
    )


@tv_sign_in_router.post("/cancel", status_code=204)
async def cancel_link(request: Request, body: Polling) -> Response:
    """The TV gives up its request, or the person at the TV declines the link. A session not yet
    taken is never made."""
    await tv_links.cancel(_database(request), body.device_code)
    return Response(status_code=204)


class Renewing(Wire):
    refresh_token: str = Field(min_length=20, max_length=128)


class TvSessionResponse(SessionResponse):
    """A renewed session, with the credential that replaces the one presented."""

    refresh_token: str = Field(serialization_alias="refreshToken")


async def _renewable_learner(request: Request, held: dict, now: int) -> Learner:
    """The learner a TV's credential is for; the credential is revoked when they are gone."""
    try:
        return await _approved_learner(request, held["account_uid"], held["learner_id"])
    except HTTPException as refused:
        if refused.status_code in GONE:
            await tv_sessions.revoke(
                _database(request), held["account_uid"], held["id"], now
            )
        raise


@tv_sign_in_router.post("/session", response_model=TvSessionResponse)
async def renew_session(request: Request, body: Renewing) -> TvSessionResponse:
    """The TV's next session, while its credential stands, and the next credential. A credential
    whose learner or consent is gone is revoked, and one presented again after it was replaced
    revokes the TV."""
    now = now_ms()
    database = _database(request)
    # The learner and the parent's agreement are checked before the credential changes: a
    # failure after it would leave the TV without the new one, and its retry would look like a copy.
    known = await tv_sessions.peek(database, body.refresh_token, now)
    learner = await _renewable_learner(request, known, now) if known else None
    renewed = await tv_sessions.renew(
        database, request.app.state.session_secret, body.refresh_token, now
    )
    if renewed is None:
        raise refusal(401, "tv_revoked", "This TV is signed out")
    if learner is None:
        learner = await _renewable_learner(
            request,
            {
                "id": renewed.id,
                "account_uid": renewed.account_uid,
                "learner_id": renewed.learner_id,
            },
            now,
        )
    session = learner_session(request, renewed.account_uid, learner, tv=renewed.id)
    return TvSessionResponse(
        token=session.token,
        expires_in=session.expires_in,
        signed_in=True,
        learner=learner,
        refresh_token=renewed.refresh_token,
    )


@tv_sign_in_router.post("/sign-out", status_code=204)
async def sign_out_tv(request: Request, body: Renewing) -> Response:
    """The TV signing itself out: its credential is the proof, and signing out is always allowed."""
    await tv_sessions.revoke_own(_database(request), body.refresh_token, now_ms())
    return Response(status_code=204)


class Coded(Wire):
    user_code: str = Field(max_length=32)


class Asked(Wire):
    """What the phone shows the person before they approve."""

    label: str
    country: str | None
    created_at: int
    expires_at: int


async def _spend_lookup(request: Request, uid: str) -> None:
    """Every call that names a code spends the account's budget and the source's."""
    await _spend(request, f"tv-look:{uid}")
    await _spend(request, f"tv-look-ip:{_source(request)}")


async def _missed(request: Request, uid: str) -> HTTPException:
    """A code that names no open request. Wrong guesses have their own budgets, per account and
    per source, apart from the lookups that find one; once spent, the answer is 429."""
    await _spend(request, f"tv-miss:{uid}")
    await _spend(request, f"tv-miss-ip:{_source(request)}")
    return _not_valid()


@tv_sign_in_router.post("/lookup", response_model=Asked)
async def look_up(request: Request, uid: ParentUid, body: Coded) -> Asked:
    """What the phone is asked to approve. The account that looks first holds the request for two
    minutes: another account's lookup is turned away (409), so nobody else can approve it."""
    await _spend_lookup(request, uid)
    code = normalised_user_code(body.user_code)
    try:
        link = (
            await tv_links.look_up(
                _database(request),
                request.app.state.session_secret,
                code,
                uid,
                now_ms(),
            )
            if code
            else None
        )
    except tv_links.HeldByAnother:
        raise refusal(
            409, "code_in_use", "That code is being used by another account"
        ) from None
    if link is None:
        raise await _missed(request, uid)
    return Asked(
        label=link["label"],
        country=None if link["country"] == UNKNOWN_COUNTRY else link["country"],
        created_at=link["created_at"],
        expires_at=link["expires_at"],
    )


async def _held_request(request: Request, uid: str, typed: str) -> tuple[str, dict]:
    """The request this account looked up and still holds, with the attempt counted; 404 for
    anything else, so a code another account holds reads as no code."""
    await _spend_lookup(request, uid)
    code = normalised_user_code(typed)
    link = (
        await tv_links.held(
            _database(request), request.app.state.session_secret, code, uid, now_ms()
        )
        if code
        else None
    )
    if link is None:
        raise await _missed(request, uid)
    return code, link


class Approval(Wire):
    user_code: str = Field(max_length=32)
    learner_id: LearnerId
    # The last four characters of the code as the TV shows them: that the person can see the TV.
    confirm: str = Field(max_length=16)


@tv_sign_in_router.post("/approve", status_code=204)
async def approve_link(
    request: Request,
    uid: ParentUid,
    session: Annotated[Session, Depends(require_session)],
    body: Approval,
) -> Response:
    """The parent signs the TV in as one of the account's learners. Only the account that looked
    the code up, and only with the last four characters of it as typed from the TV's screen. The
    TV is then asked to confirm the learner before it receives anything."""
    code, link = await _held_request(request, uid, body.user_code)
    if not confirmation_matches(code, body.confirm):
        raise refusal(
            403, "confirm_mismatch", "Those are not the last characters shown on the TV"
        )
    await _approved_learner(request, uid, body.learner_id)
    now = now_ms()
    if (
        await tv_sessions.active_count(_database(request), uid, now)
        >= tv_sessions.MAX_TVS_PER_ACCOUNT
    ):
        raise refusal(409, "too_many_tvs", "Remove a TV before signing in another")
    if not await tv_links.approve(
        _database(request),
        link["id"],
        uid,
        body.learner_id,
        now,
        session.hint,
        device_label(request.headers.get("user-agent")),
        country_of(request.headers.get("cf-ipcountry")),
    ):
        raise refusal(409, "already_decided", "That request was already answered")
    return Response(status_code=204)


@tv_sign_in_router.post("/deny", status_code=204)
async def deny_link(request: Request, uid: ParentUid, body: Coded) -> Response:
    _, link = await _held_request(request, uid, body.user_code)
    if not await tv_links.deny(_database(request), link["id"], uid, now_ms()):
        raise refusal(409, "already_decided", "That request was already answered")
    return Response(status_code=204)


class TvDevice(Wire):
    id: str
    label: str
    learner: Learner | None
    created_at: int
    last_used_at: int


class TvDevices(Wire):
    devices: list[TvDevice]


@tv_sign_in_router.get("/devices", response_model=TvDevices)
async def list_devices(request: Request, uid: ParentUid) -> TvDevices:
    """The TVs signed in to the account, newest first."""
    held = await request.app.state.keeping.learners.directory(account_key(uid))
    rows = await tv_sessions.active(_database(request), uid, now_ms())
    return TvDevices(
        devices=[
            TvDevice(
                id=row["id"],
                label=row["label"],
                learner=held.find(row["learner_id"]),
                created_at=row["created_at"],
                last_used_at=row["last_used_at"],
            )
            for row in rows
        ]
    )


@tv_sign_in_router.delete("/devices/{device_id}", status_code=204)
async def remove_device(
    request: Request,
    uid: ParentUid,
    device_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,32}$")],
) -> Response:
    if not await tv_sessions.revoke(_database(request), uid, device_id, now_ms()):
        raise refusal(404, "no_such_tv", "No such TV")
    return Response(status_code=204)
