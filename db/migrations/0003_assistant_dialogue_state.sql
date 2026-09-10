-- Жвуша assistant: рабочая память текущего треда.
-- Это не confirmed memory пользователя: состояние перезаписывается по ходу диалога.

CREATE TABLE IF NOT EXISTS assistant_dialogue_states (
  thread_id             BIGINT PRIMARY KEY REFERENCES assistant_threads(id) ON DELETE CASCADE,
  user_id               BIGINT NOT NULL,
  active_topic          TEXT NOT NULL DEFAULT '',
  focus_day             DATE,
  focus_range           TEXT NOT NULL DEFAULT '',
  pending_question      TEXT NOT NULL DEFAULT '',
  last_user_ask         TEXT NOT NULL DEFAULT '',
  last_assistant_point  TEXT NOT NULL DEFAULT '',
  signals_json          JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence            DOUBLE PRECISION NOT NULL DEFAULT 0.5
                        CHECK (confidence >= 0 AND confidence <= 1),
  source_message_id     BIGINT REFERENCES assistant_messages(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_dialogue_states_user_updated
  ON assistant_dialogue_states (user_id, updated_at DESC);
