# Deployment Guide

## One-time setup
```bash
cd backend
npm install
bash scripts/setup.sh
```

The script will:
1. Create D1 database `english-coach-db`
2. Create KV namespace `KV`
3. Create R2 buckets `english-coach-audio` + dev variant
4. Create Queue `english-coach-jobs`
5. Update `wrangler.toml` with real IDs
6. Apply schema locally
7. Prompt for secrets

## Manual secret setup
```bash
wrangler secret put ANTHROPIC_API_KEY     # Claude API key
wrangler secret put JWT_SECRET            # any random 64+ char string
wrangler secret put REFRESH_SECRET        # another random 64+ char string
wrangler secret put STRIPE_SECRET         # optional, for real payments
wrangler secret put APPLE_SHARED_SECRET   # optional
```

## Apply schema to production
```bash
npm run db:init
```

## Deploy
```bash
npm run deploy
```

Worker URL will be: `https://english-coach-backend.<your-subdomain>.workers.dev`

## Local dev
```bash
npm run dev
```
Available at: `http://localhost:8787`

## Health check
```bash
curl https://your-worker.workers.dev/api/health
# → {"status":"ok","env":"production",...}
```

## Curl examples

### Register
```bash
curl -X POST https://your-worker.workers.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"hello123","displayName":"Tester"}'
```

### Login
```bash
curl -X POST https://your-worker.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"hello123"}'
```

### Get user (with token)
```bash
curl https://your-worker.workers.dev/api/user/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### AI analyze
```bash
curl -X POST https://your-worker.workers.dev/api/ai/analyze \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Hello, my name is John. I am from New York.",
    "scene": "daily",
    "scores": {"overall": 75, "fluency": 80, "vocab": 70, "grammar": 75}
  }'
```

### Sync vocab
```bash
curl -X POST https://your-worker.workers.dev/api/sync/state \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "vocab": [{"en":"hello","zh":"你好","srsEf":2.5,"srsReps":0}],
    "analyses": [{"scene":"daily","transcript":"...","overallScore":75}]
  }'
```

## Database migrations

When you change schema:
```bash
# Create new migration file
mkdir -p migrations
# e.g. migrations/0002_add_field.sql
wrangler d1 migrations create english-coach-db 0002_add_field
wrangler d1 migrations apply english-coach-db --local
wrangler d1 migrations apply english-coach-db --remote
```

## Quota tiers

Edit `wrangler.toml`:
```toml
[vars]
FREE_AI_QUOTA_PER_DAY = "20"
PRO_AI_QUOTA_PER_DAY = "500"
```

## Monitoring

```bash
# Live tail of logs
npm run tail

# D1 query
wrangler d1 execute english-coach-db --command "SELECT count(*) FROM users"
```
