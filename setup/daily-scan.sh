#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# FlyFXFreight Deals Machine — Daily Automated Scan
# Runs via launchd at 5:30 AM (or on wake if Mac was asleep)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── CONFIGURATION ────────────────────────────────────────────
DEALS_DIR="$HOME/Desktop/FlyFX/deals-machine"
VERCEL_URL="YOUR_VERCEL_URL_HERE"  # <-- Replace with your Vercel URL
LOG_FILE="$DEALS_DIR/logs/daily-scan-$(date +%Y-%m-%d).log"
DATE=$(date +%Y-%m-%d)

# ─── SETUP ────────────────────────────────────────────────────
mkdir -p "$DEALS_DIR/logs"
mkdir -p "$DEALS_DIR/output"
mkdir -p "$DEALS_DIR/archive"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "═══════════════════════════════════════════════════════"
echo "FlyFXFreight Daily Scan — $DATE $(date +%H:%M:%S)"
echo "═══════════════════════════════════════════════════════"

# ─── ARCHIVE YESTERDAY ───────────────────────────────────────
echo "[$(date +%H:%M:%S)] Archiving previous output..."
if ls "$DEALS_DIR/output/"*.xlsx 1>/dev/null 2>&1; then
  for f in "$DEALS_DIR/output/"*.xlsx "$DEALS_DIR/output/"*.md "$DEALS_DIR/output/"*.json; do
    [ -f "$f" ] && mv "$f" "$DEALS_DIR/archive/" 2>/dev/null || true
  done
  echo "  Archived previous files to archive/"
fi

# ─── CLEAN OLD ARCHIVES (30+ days) ──────────────────────────
echo "[$(date +%H:%M:%S)] Cleaning archives older than 30 days..."
find "$DEALS_DIR/archive" -type f -mtime +30 -delete 2>/dev/null || true

# ─── RUN CLAUDE ──────────────────────────────────────────────
echo "[$(date +%H:%M:%S)] Starting Claude deals pipeline..."
cd "$DEALS_DIR"

# Run Claude Code with the deals command
# Uses the CLAUDE.md in this directory automatically
claude "deals please" 2>&1

CLAUDE_EXIT=$?

if [ $CLAUDE_EXIT -ne 0 ]; then
  echo "[$(date +%H:%M:%S)] ERROR: Claude exited with code $CLAUDE_EXIT"
  exit 1
fi

echo "[$(date +%H:%M:%S)] Claude pipeline complete."

# ─── PUSH TO VERCEL ──────────────────────────────────────────
JSON_FILE="$DEALS_DIR/output/deals_${DATE}.json"

if [ -f "$JSON_FILE" ] && [ "$VERCEL_URL" != "YOUR_VERCEL_URL_HERE" ]; then
  echo "[$(date +%H:%M:%S)] Pushing deals to Vercel..."

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d @"$JSON_FILE" \
    "${VERCEL_URL}/api/daily")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "  Successfully pushed to Deals Deck (HTTP $HTTP_CODE)"
  else
    echo "  WARNING: Push failed (HTTP $HTTP_CODE) — deals still in local output/"
  fi
else
  if [ "$VERCEL_URL" = "YOUR_VERCEL_URL_HERE" ]; then
    echo "[$(date +%H:%M:%S)] SKIP: Vercel URL not configured. Edit this script to set VERCEL_URL."
  else
    echo "[$(date +%H:%M:%S)] SKIP: No JSON output file found at $JSON_FILE"
  fi
fi

# ─── SUMMARY ─────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "SCAN COMPLETE — $(date +%H:%M:%S)"
echo "═══════════════════════════════════════════════════════"
echo "Output files:"
ls -la "$DEALS_DIR/output/" 2>/dev/null || echo "  (none)"
echo ""
echo "Next step: Open the Deals Deck or check output/"
