#!/bin/bash
# scripts/setup.sh — one-time setup of all Cloudflare resources
# Run: bash scripts/setup.sh

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  English Coach — Cloudflare Backend Setup                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check wrangler installed
if ! command -v wrangler &> /dev/null; then
  echo "❌ wrangler not found. Install: npm i -g wrangler"
  exit 1
fi

# Check logged in
if ! wrangler whoami &> /dev/null; then
  echo "🔑 Please login first: wrangler login"
  exit 1
fi

echo "📦 Creating D1 database..."
D1_OUTPUT=$(wrangler d1 create english-coach-db 2>&1 | tee /dev/stderr)
D1_ID=$(echo "$D1_OUTPUT" | grep -oE 'database_id = "[^"]+"' | head -1 | sed 's/database_id = "\(.*\)"/\1/')
if [ -z "$D1_ID" ]; then
  echo "❌ Failed to create D1 database. Output above."
  exit 1
fi
echo "✅ D1 created: $D1_ID"

echo ""
echo "🗄️  Creating KV namespace..."
KV_OUTPUT=$(wrangler kv:namespace create KV 2>&1 | tee /dev/stderr)
KV_ID=$(echo "$KV_OUTPUT" | grep -oE 'id = "[^"]+"' | head -1 | sed 's/id = "\(.*\)"/\1/')
if [ -z "$KV_ID" ]; then
  echo "❌ Failed to create KV. Output above."
  exit 1
fi
echo "✅ KV created: $KV_ID"

echo ""
echo "📦 Creating R2 bucket..."
wrangler r2 bucket create english-coach-audio
wrangler r2 bucket create english-coach-audio-dev
echo "✅ R2 buckets created"

echo ""
echo "📬 Creating Queue..."
wrangler queues create english-coach-jobs || echo "Queue may already exist"
echo "✅ Queue ready"

echo ""
echo "📝 Updating wrangler.toml with IDs..."
# Replace placeholders
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/REPLACE_WITH_REAL_DB_ID/$D1_ID/" wrangler.toml
  sed -i '' "s/REPLACE_WITH_REAL_KV_ID/$KV_ID/" wrangler.toml
else
  sed -i "s/REPLACE_WITH_REAL_DB_ID/$D1_ID/" wrangler.toml
  sed -i "s/REPLACE_WITH_REAL_KV_ID/$KV_ID/" wrangler.toml
fi
echo "✅ wrangler.toml updated"

echo ""
echo "🗃️  Applying schema (local)..."
wrangler d1 execute english-coach-db --local --file=./schema.sql
echo "✅ Local schema applied"

echo ""
echo "🔐 Setting secrets..."
echo "Please have these ready:"
echo "  - ANTHROPIC_API_KEY  (from https://console.anthropic.com/)"
echo "  - JWT_SECRET         (any random 64-char string)"
echo "  - REFRESH_SECRET     (another random 64-char string)"
echo ""
read -p "Set ANTHROPIC_API_KEY now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  wrangler secret put ANTHROPIC_API_KEY
fi
read -p "Set JWT_SECRET now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  JWT_SECRET=$(openssl rand -hex 32)
  echo "$JWT_SECRET" | wrangler secret put JWT_SECRET
  echo "✅ Generated random JWT_SECRET"
fi
read -p "Set REFRESH_SECRET now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  REFRESH_SECRET=$(openssl rand -hex 32)
  echo "$REFRESH_SECRET" | wrangler secret put REFRESH_SECRET
  echo "✅ Generated random REFRESH_SECRET"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🎉 Setup complete!                                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. npm run db:init          # apply schema to production"
echo "  2. npm run dev              # start local dev server"
echo "  3. Update mobile app API URL to point here"
echo ""
echo "Test endpoints:"
echo "  curl http://localhost:8787/api/health"
echo ""
