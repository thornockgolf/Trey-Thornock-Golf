-- Read state per message, so a conversation can hold several threads (general, and one per video) and each is
-- marked read on its own. Until now one pointer per conversation (`coach_last_read_at` / `player_last_read_at`)
-- decided what was unread; those columns stay (forward-only) but are no longer written or read.
alter table messages add column read_at timestamptz;

-- Backfill: a message the recipient's old pointer had passed is read.
update messages m
   set read_at = now()
  from conversations c
 where c.id = m.conversation_id
   and m.created_at <= coalesce(case when m.sender_id = c.coach_id then c.player_last_read_at else c.coach_last_read_at end, '-infinity');

-- Unread lookups: the other side's unread messages in a conversation.
create index messages_unread_idx on messages (conversation_id, sender_id) where read_at is null;
