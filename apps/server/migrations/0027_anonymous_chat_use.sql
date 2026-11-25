-- How many tutor turns a visitor with no account has taken (docs/SECURITY.md): the web's /try is
-- the one way to spend model credits without signing in, so each turn is counted per session, per
-- network and in all, and the chat refuses once a count passes its limit.
--
-- One row per counter, named by `bucket` (the kind, whose it is and its hour or day). Nothing in
-- it is about a learner: a session's id, a network (an IPv4 address, an IPv6 /64) and a number.
-- A row is deleted once its window is over (`expires_at`, milliseconds since the epoch).
CREATE TABLE anonymous_chat_use (
    bucket TEXT PRIMARY KEY,
    turns INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX anonymous_chat_use_expiry ON anonymous_chat_use (expires_at);
