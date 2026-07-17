#!/usr/bin/env bash
# Schema migration: rename checksums → filter_image, textfilters → filter_text.
#
# Usage: bash schema-migration/4.sh
#
# This script is idempotent — safe to re-run.

set -euo pipefail

BASE_DIR="db"
LOG_FILE="./schema-migration/logs/4-$(date +%Y%m%d-%H%M%S).log"
ERRORS=0
DBS=0
SKIPPED=0

echo "=== Schema migration 4: rename filter tables $(date) ===" | tee -a "$LOG_FILE"

for db_path in "$BASE_DIR"/[0-9]*/data.db; do
  if [ ! -f "$db_path" ]; then
    echo "No guild databases found." | tee -a "$LOG_FILE"
    exit 0
  fi

  GUILD_ID=$(basename "$(dirname "$db_path")")
  echo "" | tee -a "$LOG_FILE"
  echo "--- Guild: $GUILD_ID ($db_path) ---" | tee -a "$LOG_FILE"

  # Check if checksums still exists
  if ! sqlite3 "$db_path" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='checksums'" 2>/dev/null | grep -q 1; then
    echo "  [SKIP] checksums already renamed — skipping" | tee -a "$LOG_FILE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  DBS=$((DBS + 1))

  # ── Step 1: Create new tables ──

  echo "  [CREATE] filter_image (from checksums)" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS filter_image (
      checksum TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT ''
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] filter_image creation" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] filter_text (from textfilters)" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS filter_text (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('warn', 'kick', 'ban')),
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] filter_text creation" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  # ── Step 2: Migrate data ──

  CHK_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM checksums;")
  TF_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM textfilters;")

  echo "  [MIGRATE] ${CHK_COUNT} rows → filter_image" | tee -a "$LOG_FILE"
  if [ "$CHK_COUNT" -gt 0 ]; then
    sqlite3 "$db_path" "INSERT INTO filter_image SELECT * FROM checksums;" 2>>"$LOG_FILE" || { echo "  [ERR] filter_image migration" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }
  fi

  echo "  [MIGRATE] ${TF_COUNT} rows → filter_text" | tee -a "$LOG_FILE"
  if [ "$TF_COUNT" -gt 0 ]; then
    sqlite3 "$db_path" "INSERT INTO filter_text SELECT * FROM textfilters;" 2>>"$LOG_FILE" || { echo "  [ERR] filter_text migration" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }
  fi

  # ── Verify ──
  NEW_CHK=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM filter_image;")
  NEW_TF=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM filter_text;")

  if [ "$CHK_COUNT" -ne "$NEW_CHK" ]; then
    echo "  [ERR] filter_image count mismatch: $CHK_COUNT vs $NEW_CHK" | tee -a "$LOG_FILE"
    ERRORS=$((ERRORS + 1))
  fi
  if [ "$TF_COUNT" -ne "$NEW_TF" ]; then
    echo "  [ERR] filter_text count mismatch: $TF_COUNT vs $NEW_TF" | tee -a "$LOG_FILE"
    ERRORS=$((ERRORS + 1))
  fi

  if [ "$ERRORS" -gt 0 ]; then
    echo "  [ERR] Verification failed — skipping DROP" | tee -a "$LOG_FILE"
    continue
  fi

  # ── Step 3: Drop old tables ──
  echo "  [DROP] checksums" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "DROP TABLE IF EXISTS checksums;" 2>>"$LOG_FILE" || { echo "  [ERR] DROP checksums" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [DROP] textfilters" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "DROP TABLE IF EXISTS textfilters;" 2>>"$LOG_FILE" || { echo "  [ERR] DROP textfilters" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [OK]  Migration complete for guild ${GUILD_ID}" | tee -a "$LOG_FILE"
done

echo "" | tee -a "$LOG_FILE"
echo "=== Migration complete ===" | tee -a "$LOG_FILE"
echo "  Databases processed: $DBS" | tee -a "$LOG_FILE"
echo "  Databases skipped: $SKIPPED" | tee -a "$LOG_FILE"
echo "  Errors: $ERRORS" | tee -a "$LOG_FILE"
echo "  Log: $LOG_FILE" | tee -a "$LOG_FILE"

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
