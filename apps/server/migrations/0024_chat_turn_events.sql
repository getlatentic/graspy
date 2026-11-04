-- A turn is one message and its answer. A turn that a restart cut off is run again, so what it writes
-- must be written once however many times it is run: each of these events is kept once per turn. The
-- turn is named in the event's data. The writer checks first, so the index is what refuses a second
-- write that slipped past, and each index is partial on a literal kind so a query that names the kind
-- can use it.
CREATE UNIQUE INDEX chat_event_turn_started ON chat_event (chat, json_extract(data, '$.turn'))
    WHERE kind = 'turn.started';
CREATE UNIQUE INDEX chat_event_turn_user ON chat_event (chat, json_extract(data, '$.turn'))
    WHERE kind = 'user';
CREATE UNIQUE INDEX chat_event_turn_assistant ON chat_event (chat, json_extract(data, '$.turn'))
    WHERE kind = 'assistant';
CREATE UNIQUE INDEX chat_event_turn_finished ON chat_event (chat, json_extract(data, '$.turn'))
    WHERE kind = 'turn.finished';
