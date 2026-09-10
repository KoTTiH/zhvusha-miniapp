-- Жвуша assistant: чат, подтверждаемая память и private Blob metadata.
-- Идемпотентно (IF NOT EXISTS) — можно гонять повторно.

CREATE TABLE IF NOT EXISTS assistant_threads (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  title       TEXT NOT NULL DEFAULT 'Жвуша',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_threads_user_updated
  ON assistant_threads (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id                 BIGSERIAL PRIMARY KEY,
  thread_id          BIGINT NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
  user_id            BIGINT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content            TEXT NOT NULL,
  mode               TEXT NOT NULL DEFAULT 'health',
  safety_json        JSONB,
  used_context_json  JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread_created
  ON assistant_messages (thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_created
  ON assistant_messages (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assistant_memories (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'hypothesis')),
  text               TEXT NOT NULL,
  source_message_id  BIGINT REFERENCES assistant_messages(id) ON DELETE SET NULL,
  confidence         DOUBLE PRECISION,
  status             TEXT NOT NULL DEFAULT 'suggested'
                     CHECK (status IN ('suggested', 'confirmed', 'dismissed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_memories_user_status_updated
  ON assistant_memories (user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_attachments (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL,
  message_id     BIGINT REFERENCES assistant_messages(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('skin_photo', 'photo')),
  blob_url       TEXT NOT NULL,
  pathname       TEXT NOT NULL,
  media_type     TEXT NOT NULL,
  metadata_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_attachments_user_created
  ON assistant_attachments (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
