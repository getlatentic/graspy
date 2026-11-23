"""Signing a TV in from a phone: the OAuth device authorization grant (RFC 8628), with the phone's
confirmation showing what it approves. docs/TV_SIGN_IN.md has the flow and the threat model.

The TV asks for a request and polls it with its device code. A signed-in phone looks the short code
up, sees the device, and approves it for one of the account's learners or denies it. The TV's next
poll takes a session for that learner, once, and a credential to renew it with. Nothing here is
open to a TV except starting, polling, renewing and signing out, each by a secret only it holds."""

from __future__ import annotations

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, Request, Response
from pydantic import Field

from ..account import tv_links, tv_sessions
from ..account.directory import Learner, LearnerId, account_key, learner_key
from ..account.learners import NoSuchLearner, learner_of
from ..account.tv_codes import country_of, device_label, normalised_user_code
from ..learner.time import now_ms
from ..security.rate_limit import RETRY_AFTER_SECONDS, client_key
from ..wire import Wire
from .account_routes import Uid
from .consent_proof import refusal
from .routes import SessionResponse, learner_session
from .service_consent import service_consent_refusal

logger = logging.getLogger(__name__)

tv_sign_in_router = APIRouter(prefix="/tv-sign-in", tags=["tv-sign-in"])

DEV_WEB_ORIGIN = "http://localhost:5173"
# Where the web app answers on a phone; the code rides in the fragment, which no server is sent.
LINK_PATH = "/link"
NOT_VALID = ("code_not_found", "That code is not valid. Check the TV and try again")


def _database(request: Request):
    return request.app.state.tv_db


async def _spend(request: Request, key: str) -> None:
    """One of the pairing budget, kept per key. Where no budget is bound (local runs) nothing
    is counted."""
    limiter = request.app.state.pairing_limiter
    if limiter is not None and not await limiter.allow(key):
        raise HTTPException(
            status_code=429,
            detail={"error": "Too many requests", "code": "rate_limited"},
            headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
        )


def _web_origin(request: Request) -> str:
    """Where the phone is sent: the origin that asked if CORS allows it, else the first origin
    configured. Never an origin the caller names beyond those."""
    asked = request.headers.get("origin")
    if asked and request.app.state.origin_allowed(asked):
        return asked
    configured = [o for o in request.app.state.framing_hosts if "*" not in o]
    return configured[0] if configured else DEV_WEB_ORIGIN


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
    the person reads off its screen."""
    await _spend(request, f"tv-start:{client_key(request.scope)}")
    try:
        started = await tv_links.start(
            _database(request),
            request.app.state.session_secret,
            device_label(request.headers.get("user-agent")),
            country_of(request.headers.get("cf-ipcountry")),
            now_ms(),
        )
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


class Polled(Wire):
    status: Literal["pending", "slow_down", "expired", "denied", "approved"]
    interval: int | None = None
    # With `approved`: the TV's session, the credential that renews it, and who it learns as.
    token: str | None = None
    expires_in: int | None = None
    refresh_token: str | None = None
    account: str | None = None
    learner: Learner | None = None


@tv_sign_in_router.post(
    "/token", response_model=Polled, response_model_exclude_none=True
)
async def poll_link(request: Request, body: Polling) -> Polled:
    """The TV's poll. `slow_down` asks for a longer interval; `expired` also answers a code that
    is unknown or whose session was already taken."""
    now = now_ms()
    polled = await tv_links.poll(_database(request), body.device_code, now)
    if polled.status != tv_links.APPROVED:
        return Polled(status=polled.status, interval=polled.interval)
    taken = await tv_sessions.take(_database(request), body.device_code, now)
    if taken is None:
        return Polled(status=tv_links.EXPIRED)
    try:
        session = await _tv_session(
            request, taken.account_uid, taken.learner_id, taken.id
        )
    except HTTPException:
        await tv_sessions.revoke(_database(request), taken.account_uid, taken.id, now)
        return Polled(status=tv_links.DENIED)
    return Polled(
        status=tv_links.APPROVED,
        token=session.token,
        expires_in=session.expires_in,
        refresh_token=taken.refresh_token,
        account=taken.account_uid,
        learner=session.learner,
    )


async def _tv_session(
    request: Request, uid: str, learner_id: str, tv_id: str
) -> SessionResponse:
    """A session for the learner the TV was approved for, if the account still holds them and
    their parent's agreement stands."""
    try:
        learner = await learner_of(request.app.state.keeping, uid, learner_id)
    except NoSuchLearner:
        raise refusal(404, "no_such_learner", "No such learner") from None
    refused = await service_consent_refusal(request.app, learner_key(uid, learner.id))
    if refused is not None:
        raise refused
    return learner_session(request, uid, learner, tv=tv_id)


class Renewing(Wire):
    refresh_token: str = Field(min_length=20, max_length=128)


@tv_sign_in_router.post("/session", response_model=SessionResponse)
async def renew_session(request: Request, body: Renewing) -> SessionResponse:
    """The TV's next session, while its credential stands. A credential whose learner or consent
    is gone is revoked."""
    now = now_ms()
    renewed = await tv_sessions.renew(_database(request), body.refresh_token, now)
    if renewed is None:
        raise refusal(401, "tv_revoked", "This TV is signed out")
    try:
        return await _tv_session(
            request, renewed.account_uid, renewed.learner_id, renewed.id
        )
    except HTTPException as refused:
        if refused.status_code in (403, 404):
            await tv_sessions.revoke(
                _database(request), renewed.account_uid, renewed.id, now
            )
        raise


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


async def _open_request(request: Request, uid: str, typed: str) -> dict:
    """The open request a signed-in account's phone names, with the attempt counted. The account's
    budget is spent first, so guessing codes is slow for each account and each address."""
    await _spend(request, f"tv-look:{uid}")
    await _spend(request, f"tv-look-ip:{client_key(request.scope)}")
    code = normalised_user_code(typed)
    link = (
        await tv_links.touch(
            _database(request), request.app.state.session_secret, code, now_ms()
        )
        if code
        else None
    )
    if link is None:
        raise _not_valid()
    return link


@tv_sign_in_router.post("/lookup", response_model=Asked)
async def look_up(request: Request, uid: Uid, body: Coded) -> Asked:
    link = await _open_request(request, uid, body.user_code)
    return Asked(
        label=link["label"],
        country=link["country"],
        created_at=link["created_at"],
        expires_at=link["expires_at"],
    )


class Approval(Wire):
    user_code: str = Field(max_length=32)
    learner_id: LearnerId


async def _approvable_learner(request: Request, uid: str, learner_id: str) -> None:
    try:
        learner = await learner_of(request.app.state.keeping, uid, learner_id)
    except NoSuchLearner:
        raise refusal(404, "no_such_learner", f"No learner {learner_id}") from None
    refused = await service_consent_refusal(request.app, learner_key(uid, learner.id))
    if refused is not None:
        raise refused


@tv_sign_in_router.post("/approve", status_code=204)
async def approve_link(request: Request, uid: Uid, body: Approval) -> Response:
    """The account of this phone's session signs the TV in as one of its learners. The request
    is bound to that account and learner, and no other account can take it over."""
    link = await _open_request(request, uid, body.user_code)
    await _approvable_learner(request, uid, body.learner_id)
    now = now_ms()
    if (
        await tv_sessions.active_count(_database(request), uid, now)
        >= tv_sessions.MAX_TVS_PER_ACCOUNT
    ):
        raise refusal(409, "too_many_tvs", "Remove a TV before signing in another")
    if not await tv_links.approve(
        _database(request), link["id"], uid, body.learner_id, now
    ):
        raise refusal(409, "already_decided", "That request was already answered")
    return Response(status_code=204)


@tv_sign_in_router.post("/deny", status_code=204)
async def deny_link(request: Request, uid: Uid, body: Coded) -> Response:
    link = await _open_request(request, uid, body.user_code)
    if not await tv_links.deny(_database(request), link["id"], now_ms()):
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
async def list_devices(request: Request, uid: Uid) -> TvDevices:
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
    uid: Uid,
    device_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,32}$")],
) -> Response:
    if not await tv_sessions.revoke(_database(request), uid, device_id, now_ms()):
        raise refusal(404, "no_such_tv", "No such TV")
    return Response(status_code=204)
