-- Жвуша — токенная система. Базовая схема.
-- Применять: psql "$DATABASE_URL" -f db/migrations/0001_init.sql
-- Идемпотентно (IF NOT EXISTS) — можно гонять повторно.

-- Балансы юзеров. user_id — Telegram user id (BIGINT, может быть до 2^53).
CREATE TABLE IF NOT EXISTS user_balance (
  user_id     BIGINT PRIMARY KEY,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Пользователи продукта. user_id в остальных таблицах = Telegram user id,
-- чтобы не плодить лишний lookup в serverless-роутах.
CREATE TABLE IF NOT EXISTS users (
  telegram_user_id        BIGINT PRIMARY KEY,
  username                TEXT,
  first_name              TEXT,
  daily_calorie_goal      INTEGER,
  protein_goal            INTEGER,
  fat_goal                INTEGER,
  carbs_goal              INTEGER,
  timezone                TEXT,
  free_ai_credits_granted BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- История операций. Аудит-лог для всех debit/credit.
-- delta < 0 — списание, delta > 0 — начисление.
-- kind: 'parse-food' | 'starting-bonus' | 'purchase' | 'refund' | 'admin-grant'.
CREATE TABLE IF NOT EXISTS token_transactions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  delta       INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_tx_user_created
  ON token_transactions (user_id, created_at DESC);

-- Журнал AI-анализов. Первичный разбор списывает 1 AI-кредит, уточнения
-- ссылаются на parent_analysis_id и не списывают баланс повторно.
CREATE TABLE IF NOT EXISTS ai_analyses (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL,
  parent_analysis_id  BIGINT REFERENCES ai_analyses(id),
  input_type          TEXT NOT NULL,             -- 'photo' | 'voice' | 'text' | 'mixed'
  model_provider      TEXT NOT NULL,             -- 'google' | 'openrouter' | etc.
  model_name          TEXT NOT NULL,
  prompt_version      TEXT NOT NULL,
  raw_input_text      TEXT,
  result_json         JSONB,
  confidence          DOUBLE PRECISION,
  status              TEXT NOT NULL,             -- 'success' | 'failed' | 'refunded'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_created
  ON ai_analyses (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_parent
  ON ai_analyses (parent_analysis_id);

-- Postgres-дневник питания. Старый CloudStorage остаётся fallback на время
-- миграции UI, но sale-ready MVP должен писать публичные данные сюда.
CREATE TABLE IF NOT EXISTS food_entries (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  date            DATE NOT NULL,
  meal_type       TEXT,
  title           TEXT NOT NULL,
  source_type     TEXT NOT NULL,       -- 'ai_photo' | 'ai_voice' | 'ai_text' | 'manual' | 'mixed'
  total_calories  INTEGER NOT NULL DEFAULT 0,
  total_protein   DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_fat       DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_carbs     DOUBLE PRECISION NOT NULL DEFAULT 0,
  calorie_min     INTEGER,
  calorie_max     INTEGER,
  confidence      DOUBLE PRECISION,
  status          TEXT NOT NULL DEFAULT 'saved',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_entries_user_date
  ON food_entries (user_id, date DESC);

CREATE TABLE IF NOT EXISTS food_items (
  id                    BIGSERIAL PRIMARY KEY,
  food_entry_id          BIGINT NOT NULL REFERENCES food_entries(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  estimated_weight_g    DOUBLE PRECISION,
  calories_per_100g     DOUBLE PRECISION,
  protein_per_100g      DOUBLE PRECISION,
  fat_per_100g          DOUBLE PRECISION,
  carbs_per_100g        DOUBLE PRECISION,
  total_calories        DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_protein         DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_fat             DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_carbs           DOUBLE PRECISION NOT NULL DEFAULT 0,
  source_type           TEXT NOT NULL DEFAULT 'ai_estimate',
  confidence            DOUBLE PRECISION,
  uncertainty_reason    TEXT
);

CREATE INDEX IF NOT EXISTS idx_food_items_entry
  ON food_items (food_entry_id);

CREATE TABLE IF NOT EXISTS notes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  date        DATE NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_date
  ON notes (user_id, date DESC);

CREATE TABLE IF NOT EXISTS daily_summaries (
  user_id           BIGINT NOT NULL,
  date              DATE NOT NULL,
  total_calories    INTEGER NOT NULL DEFAULT 0,
  total_protein     DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_fat         DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_carbs       DOUBLE PRECISION NOT NULL DEFAULT 0,
  calorie_goal      INTEGER,
  delta_from_goal   INTEGER,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

-- Runtime-хранилище текущего клиентского формата дневника. Это слой
-- совместимости для переноса с Telegram CloudStorage/localStorage в Postgres:
-- приложение продолжает хранить FoodEntry[] за день без рискованной миграции
-- всех nutrition-связей в одном шаге.
CREATE TABLE IF NOT EXISTS calorie_days (
  user_id     BIGINT NOT NULL,
  day         DATE NOT NULL,
  entries     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_calorie_days_user_updated
  ON calorie_days (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS water_days (
  user_id     BIGINT NOT NULL,
  day         DATE NOT NULL,
  entries     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_water_days_user_updated
  ON water_days (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS day_meta (
  user_id     BIGINT NOT NULL,
  day         DATE NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_day_meta_user_updated
  ON day_meta (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_foods (
  user_id     BIGINT NOT NULL,
  id          TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_user_foods_user_updated
  ON user_foods (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_meals (
  user_id     BIGINT NOT NULL,
  id          TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_user_meals_user_updated
  ON user_meals (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_recent (
  user_id     BIGINT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{"entries":[]}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_goal (
  user_id     BIGINT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_days (
  user_id     BIGINT NOT NULL,
  day         DATE NOT NULL,
  notes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_note_days_user_updated
  ON note_days (user_id, updated_at DESC);

-- История платежей. external_id уникален в рамках провайдера —
-- защита от двойного зачисления одного платежа.
-- provider: 'telegram-stars' | 'tribute' | 'yookassa' | 'admin'.
CREATE TABLE IF NOT EXISTS payments (
  id            BIGSERIAL PRIMARY KEY,
  provider      TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  user_id       BIGINT NOT NULL,
  amount_minor  INTEGER NOT NULL,             -- сумма в копейках/центах/Stars
  currency      TEXT NOT NULL,                -- 'RUB' | 'USD' | 'XTR' (Stars)
  tokens        INTEGER NOT NULL,             -- сколько токенов начислили
  status        TEXT NOT NULL DEFAULT 'succeeded',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_user_created
  ON payments (user_id, created_at DESC);
