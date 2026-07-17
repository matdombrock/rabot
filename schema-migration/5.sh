#!/usr/bin/env bash
# Schema migration: drop orphaned FTS5 virtual table (messages_fts) and its shadow tables.
#
# These were created by an external tool or previous iteration and are not used
# by the current codebase. Without triggers to keep them in sync with the
# real 'messages' table, they are dead tables.
#
# Usage: bash schema-migration/5.sh

set -euo pipefail

BASE_DIR="db"
LOG_FILE="./schema-migration/logs/5-$(date +%Y%m%d-%H%M%S).log"
ERRORS=0
DBS=0
SKIPPED=0

echo "=== Schema migration 5: drop orphaned FTS tables $(date) ===" | tee -a "$LOG_FILE"

for db_path in "$BASE_DIR"/[0-9]*/data.db; do
  if [ ! -f "$db_path" ]; then
    echo "No guild databases found." | tee -a "$LOG_FILE"
    exit 0
  fi

  GUILD_ID=$(basename "$(dirname "$db_path")")
  echo "" | tee -a "$LOG_FILE"
  echo "--- Guild: $GUILD_ID ($db_path) ---" | tee -a "$LOG_FILE"

  if ! sqlite3 "$db_path" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='messages_fts'" 2>/dev/null | grep -q 1; then
    echo "  [SKIP] messages_fts does not exist — skipping" | tee -a "$LOG_FILE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  DBS=$((DBS + 1))

  # Count shadow tables for reporting
  SHADOW_COUNT=$(sqlite3 "$db_path" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name GLOB 'messages_fts_*';")

  echo "  [DROP] messages_fts (virtual table + ${SHADOW_COUNT} shadow tables)" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "DROP TABLE IF EXISTS messages_fts;" 2>>"$LOG_FILE" || {
    echo "  [ERR] DROP messages_fts" | tee -a "$LOG_FILE"
    ERRORS=$((ERRORS + 1))
  }

  # Verify removal
  REMAINING=$(sqlite3 "$db_path" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name GLOB 'messages_fts*';")
  if [ "$REMAINING" -eq 0 ]; then
    echo "  [OK]  All messages_fts tables removed" | tee -a "$LOG_FILE"
  else
    echo "  [ERR] ${REMAINING} messages_fts tables remain" | tee -a "$LOG_FILE"
    ERRORS=$((ERRORS + 1))
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "=== Migration complete ===" | tee -a "$LOG_FILE"
echo "  Databases processed: $DBS" | tee -a "$LOG_FILE"
echo "  Databases skipped (no FTS): $SKIPPED" | tee -a "$LOG_FILE"
echo "  Errors: $ERRORS" | tee -a "$LOG_FILE"
echo "  Log: $LOG_FILE" | tee -a "$LOG_FILE"

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
