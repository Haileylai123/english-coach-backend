-- Migration 0001: Initial full schema
-- English Coach — D1 (Cloudflare SQLite)

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  locale        TEXT DEFAULT 'zh-HK',
  difficulty    TEXT DEFAULT 'beginner',
  xp            INTEGER DEFAULT 0,
  level         INTEGER DEFAULT 1,
  streak        INTEGER DEFAULT 0,
  last_practice_date TEXT,
  pet_name      TEXT DEFAULT 'Mimi',
  pet_species   TEXT DEFAULT 'cat',
  pet_coins     INTEGER DEFAULT 100,
  pet_hunger    INTEGER DEFAULT 80,
  pet_intimacy  INTEGER DEFAULT 50,
  pet_outfit    TEXT,
  pet_background TEXT DEFAULT 'garden',
  tier          TEXT DEFAULT 'free',
  tier_expires  INTEGER,
  stripe_customer_id TEXT,
  apple_sub_id  TEXT,
  notify_enabled INTEGER DEFAULT 0,
  api_key_hint  TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  refresh_hash    TEXT NOT NULL,
  device_label    TEXT,
  user_agent      TEXT,
  ip              TEXT,
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  revoked_at      INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── User vocabulary (SRS) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_vocab (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  en              TEXT NOT NULL,
  zh              TEXT,
  part_of_speech  TEXT,
  example         TEXT,
  source          TEXT DEFAULT 'manual',
  srs_ef          REAL DEFAULT 2.5,
  srs_interval    INTEGER DEFAULT 0,
  srs_reps        INTEGER DEFAULT 0,
  srs_due         TEXT,
  last_review     TEXT,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, en)
);
CREATE INDEX IF NOT EXISTS idx_user_vocab_user ON user_vocab(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vocab_due ON user_vocab(user_id, srs_due);

-- ── Custom vocabulary ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_vocab (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  en          TEXT NOT NULL,
  zh          TEXT,
  context     TEXT,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, en)
);
CREATE INDEX IF NOT EXISTS idx_custom_vocab_user ON custom_vocab(user_id);

-- ── Course progress ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_progress (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  course_id   TEXT NOT NULL,
  lesson_id   TEXT NOT NULL,
  completed   INTEGER DEFAULT 0,
  score       INTEGER,
  attempts    INTEGER DEFAULT 0,
  last_score  INTEGER,
  completed_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, course_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_progress(user_id);

-- ── Achievements ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at     INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, achievement_key)
);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);

-- ── Analyses (speech history) ────────────────────────────────
CREATE TABLE IF NOT EXISTS analyses (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  scene           TEXT,
  transcript      TEXT,
  duration_ms     INTEGER,
  overall_score   INTEGER,
  fluency_score   INTEGER,
  vocab_score     INTEGER,
  pron_score      INTEGER,
  grammar_score   INTEGER,
  cefr_level      TEXT,
  word_count      INTEGER,
  ai_feedback     TEXT,
  audio_url       TEXT,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at DESC);

-- ── Pet state ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pet_state (
  user_id         TEXT PRIMARY KEY,
  species         TEXT DEFAULT 'cat',
  name            TEXT DEFAULT 'Mimi',
  hunger          INTEGER DEFAULT 80,
  intimacy        INTEGER DEFAULT 50,
  energy          INTEGER DEFAULT 100,
  coins           INTEGER DEFAULT 100,
  outfit          TEXT,
  background      TEXT DEFAULT 'garden',
  owned_pets      TEXT,
  owned_items     TEXT,
  furniture       TEXT,
  last_fed_at     INTEGER,
  last_played_at  INTEGER,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Practice log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  practice_date TEXT NOT NULL,
  scene       TEXT,
  xp_earned   INTEGER DEFAULT 0,
  analyses_count INTEGER DEFAULT 0,
  minutes     INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, practice_date)
);
CREATE INDEX IF NOT EXISTS idx_practice_log_user_date ON practice_log(user_id, practice_date DESC);

-- ── Subscriptions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  tier            TEXT NOT NULL,
  status          TEXT NOT NULL,
  source          TEXT,
  external_id     TEXT,
  started_at      INTEGER NOT NULL,
  expires_at      INTEGER,
  cancelled_at    INTEGER,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status);

-- ── AI usage tracking ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  usage_date  TEXT NOT NULL,
  call_count  INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, usage_date)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage(user_id, usage_date);

-- ── Notification tokens ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token       TEXT NOT NULL,
  platform    TEXT,
  enabled     INTEGER DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, token)
);

-- ── Scene stats ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scene_stats (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  scene       TEXT NOT NULL,
  count       INTEGER DEFAULT 0,
  last_used   INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, scene)
);
CREATE INDEX IF NOT EXISTS idx_scene_stats_user ON scene_stats(user_id);
