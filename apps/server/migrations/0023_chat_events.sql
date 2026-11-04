-- What happens in a chat, in the order it happened: the conversation is a fold of this log. A chat is
-- named by the id its first message was given (an A2A context id). seq starts at 1 in each chat and
-- is taken by the insert that writes the event, so two writers cannot take the same one. A kind is
-- checked where it is written (app/chatlog/kinds.py), so a new kind needs no migration.
CREATE TABLE chat_event (
    chat TEXT NOT NULL,
    seq INTEGER NOT NULL CHECK (seq > 0),
    kind TEXT NOT NULL CHECK (kind <> ''),
    data TEXT NOT NULL CHECK (json_valid(data)),
    at INTEGER NOT NULL,
    PRIMARY KEY (chat, seq)
) WITHOUT ROWID;
