#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# FlyFXFreight Deals Machine — One-Command Deploy
# Run this from your Mac terminal:
#   bash ~/Desktop/FlyFX/deals-machine/flyfx-deals-deck/setup/DEPLOY.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEALS_DIR="$(cd "$PROJECT_DIR/.." && pwd)"

echo "═══════════════════════════════════════════════════════"
echo "  FlyFXFreight Deals Machine — Deploy"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Project: $PROJECT_DIR"
echo ""

# ─── 1. INSTALL DEPS ─────────────────────────────────────────
echo "[1/6] Installing dependencies..."
cd "$PROJECT_DIR"
npm install --silent

# ─── 2. BUILD ─────────────────────────────────────────────────
echo "[2/6] Building..."
npm run build 2>&1 | tail -3

# ─── 3. INIT GIT ─────────────────────────────────────────────
echo "[3/6] Initialising git..."
if [ ! -d .git ]; then
  git init -b main
  git add -A
  git commit -m "FlyFXFreight Deals Machine v2.0"
fi

# ─── 4. DEPLOY TO VERCEL ─────────────────────────────────────
echo "[4/6] Deploying to Vercel..."
echo "  (If this is your first time, follow the prompts)"
echo ""
npx vercel --prod

echo ""
VERCEL_URL=$(npx vercel ls 2>/dev/null | grep -o 'https://[^ ]*' | head -1 || echo "CHECK_VERCEL_DASHBOARD")
echo "  Your Vercel URL: $VERCEL_URL"

# ─── 5. SETUP DAILY AUTOMATION ───────────────────────────────
echo "[5/6] Setting up daily automation..."

# Copy daily-scan.sh
cp "$PROJECT_DIR/setup/daily-scan.sh" "$DEALS_DIR/daily-scan.sh"
chmod +x "$DEALS_DIR/daily-scan.sh"

# Update Vercel URL in daily-scan.sh
if [ "$VERCEL_URL" != "CHECK_VERCEL_DASHBOARD" ]; then
  sed -i '' "s|YOUR_VERCEL_URL_HERE|$VERCEL_URL|g" "$DEALS_DIR/daily-scan.sh"
  echo "  Updated daily-scan.sh with Vercel URL"
fi

# Setup launchd
PLIST_SRC="$PROJECT_DIR/setup/com.flyfx.daily-scan.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.flyfx.daily-scan.plist"

cp "$PLIST_SRC" "$PLIST_DST"
sed -i '' "s|REPLACE_WITH_YOUR_HOME|$HOME|g" "$PLIST_DST"

# Unload if already loaded
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo "  Daily scan scheduled for 5:30 AM"

# ─── 6. CREATE DIRECTORIES ───────────────────────────────────
echo "[6/6] Ensuring directory structure..."
mkdir -p "$DEALS_DIR/output"
mkdir -p "$DEALS_DIR/archive"
mkdir -p "$DEALS_DIR/logs"

# ─── 7. SETUP TERMINAL ALIAS ─────────────────────────────────
SHELL_RC="$HOME/.zshrc"
if ! grep -q 'alias deals=' "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# FlyFXFreight Deals Machine" >> "$SHELL_RC"
  echo "alias deals=\"cd $DEALS_DIR && claude \\\"deals please\\\"\"" >> "$SHELL_RC"
  echo "  Added 'deals' alias to ~/.zshrc"
fi

# ─── DONE ─────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Deals Deck:  $VERCEL_URL"
echo "  Password:    YOUR_APP_PASSWORD"
echo ""
echo "  NEXT STEPS:"
echo "  1. Add env vars in Vercel dashboard:"
echo "     → APOLLO_API_KEY = your Apollo key"
echo "     → APP_PASSWORD = YOUR_APP_PASSWORD"
echo "  2. Test: type 'deals' in Terminal"
echo "  3. Open the Deals Deck URL on your phone"
echo ""
echo "  IMPORTANT: Add your Anthropic + Apollo API keys"
echo "  to the Vercel project's Environment Variables"
echo "  at vercel.com → project → Settings → Env Vars"
echo ""
