# English Coach Backend (Cloudflare)

Edge-deployed API for the English Coach mobile app.

## Stack
- **Cloudflare Workers** (TypeScript) — serverless API
- **D1** — SQLite for users, vocab, progress, subscriptions
- **KV** — sessions, rate limit counters, cache
- **R2** — audio recordings, user exports
- **Queues** — async jobs (AI analysis, notifications)
- **JWT** — auth

## Setup

```bash
# 1. Install deps
npm install

# 2. Create D1 database
wrangler d1 create english-coach-db
# Copy the database_id into wrangler.toml

# 3. Create KV namespace
wrangler kv:namespace create KV
# Copy the id into wrangler.toml

# 4. Create R2 bucket
wrangler r2 bucket create english-coach-audio

# 5. Apply schema
npm run db:init:local    # local dev
npm run db:init          # production

# 6. Set secrets
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put JWT_SECRET
wrangler secret put REFRESH_SECRET

# 7. Run dev
npm run dev
```

## Endpoints

### Auth
- `POST /api/auth/register` — `{ email, password, displayName }` → `{ user, accessToken, refreshToken }`
- `POST /api/auth/login` — `{ email, password }` → `{ user, accessToken, refreshToken }`
- `POST /api/auth/refresh` — `{ refreshToken }` → `{ accessToken, refreshToken }`
- `POST /api/auth/logout` — invalidate refresh token

### User
- `GET /api/user/me` — profile + XP + streak
- `PATCH /api/user/me` — update profile
- `DELETE /api/user/me` — delete account

### Sync
- `GET /api/sync/state` — full state snapshot
- `POST /api/sync/state` — push state delta
- `GET /api/sync/vocab` — list user vocab
- `POST /api/sync/vocab` — add vocab + SRS state
- `DELETE /api/sync/vocab/:en` — remove
- `GET /api/sync/analyses` — list analyses

### AI (Claude proxy — server holds the key)
- `POST /api/ai/analyze` — `{ transcript, scene, confidenceValues }` → AI feedback
- `POST /api/ai/chat` — `{ messages, scene }` → AI chat reply
- `POST /api/ai/explain` — `{ word, sentence }` → AI explanation
- `GET /api/ai/usage` — quota used / remaining

### Subscription
- `GET /api/subscription` — current tier
- `POST /api/subscription/checkout` — start checkout
- `POST /api/subscription/cancel` — cancel
- `POST /api/subscription/webhook` — payment provider callback

### Upload (R2)
- `POST /api/upload/audio` — upload recording (multipart) → `{ url }`
- `GET /api/upload/audio/:id` — presigned GET URL

## Quotas
| Tier    | AI calls/day | Vocab limit | Audio retention |
|---------|--------------|-------------|-----------------|
| Free    | 20           | 200         | 7 days          |
| Pro     | 500          | 5000        | 90 days         |
| Premium | unlimited    | unlimited   | 1 year          |

## Background Jobs (Queues)
- `analyze_deep` — Claude deep analysis after speech
- `notify_streak` — push notification fanout
- `cleanup_audio` — R2 cleanup of old recordings

## Cron Triggers
- `0 0 * * *` (midnight UTC) — daily reset: purge expired sessions + 30-day-old AI usage rows
- `0 12 * * *` (noon UTC) — streak reminder: fanout push to users with active streak who didn't practice today
- `0 3 * * 0` (Sun 3am UTC) — R2 cleanup: delete audio older than tier retention (free 7d, pro 90d, premium 365d)

## Notifications
- `POST /api/notifications/register` — `{ token, platform }` — save Expo push token
- `POST /api/notifications/unregister` — `{ token }` — remove token
- `POST /api/notifications/test` — send a test push to caller's devices

## Admin (requires email in `ADMIN_EMAILS` env var)
- `GET /api/admin/stats` — user counts, AI usage, vocab total
- `GET /api/admin/users?limit=50&offset=0&q=search` — paginated user list with search
- `GET /api/admin/ai-usage` — 30-day AI usage breakdown
- `GET /api/admin/recent-analyses` — last 20 analyses across all users
- `POST /api/admin/broadcast` — `{ title, body, tier? }` — push to all users (or specific tier)

## Health
- `GET /api/health` — basic liveness
- `GET /api/health/ready` — deep check (DB + KV + R2)
