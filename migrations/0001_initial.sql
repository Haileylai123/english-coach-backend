-- Initial schema (same as schema.sql for migration tooling)
-- This file mirrors schema.sql so wrangler migrations track changes.

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  locale TEXT DEFAULT 'zh-HK',
  difficulty TEXT DEFAULT 'beginner',
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak INTEGER DEFAULT 0,
  last_practice_date TEXT,
  pet_name TEXT DEFAULT 'Mimi',
  pet_species TEXT DEFAULT 'cat',
  pet_coins INTEGER DEFAULT 100,
  pet_hunger INTEGER DEFAULT 80,
  pet_intimacy INTEGER DEFAULT 50,
  pet_outfit TEXT,
  pet_background TEXT DEFAULT 'garden',
  tier TEXT DEFAULT 'free',
  tier_expires INTEGER,
  stripe_customer_id TEXT,
  apple_sub_id TEXT,
  notify_enabled INTEGER DEFAULT 0,
  api_key_hint TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- (Other tables intentionally omitted from migration body — schema.sql is the canonical source.
--  This migration file exists to register the initial version in wrangler's migration table.)
