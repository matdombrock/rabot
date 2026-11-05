#!/usr/bin/env bash
# Schema migration: rename log tables to use log_* prefix.
#
# Renames existing tables with their indexes:
#   modlogs         → log_mod
#   saylogs         → log_say
#   textfilter_logs → log_textfilter
#   ai_chat_log     → log_ai_chat
#   actionlogs      → log_action
#
# Usage: bash schema-migration/3.sh
#
# This script is idempotent — safe to re-run. Skips guild databases
# where the old table no longer exists (already migrated).

set -euo pipefail

BASE_DIR="db"
LOG_FILE="./schema-migration/logs/3-$(date +%Y%m%d-%H%M%S).log"
ERRORS=0
DBS=0
SKIPPED=0

echo "=== Schema migration 3: rename log tables to log_* prefix $(date) ===" | tee -a "$LOG_FILE"

# Table definitions for the renaming: old_name new_name
TABLE_PAIRS=(
  "modlogs log_mod"
  "saylogs log_say"
  "textfilter_logs log_textfilter"
  "ai_chat_log log_ai_chat"
  "actionlogs log_action"
)

# Indexes that need to be dropped and recreated
INDEX_DROP_CREATE=(
  "idx_actionlogs_guild idx_log_action_guild log_action guild_id"
  "idx_actionlogs_ts idx_log_action_ts log_action timestamp"
)

for db_path in "$BASE_DIR"/[0-9]*/data.db; do
  if [ ! -f "$db_path" ]; then
    echo "No guild databases found." | tee -a "$LOG_FILE"
    exit 0
  fi

  GUILD_ID=$(basename "$(dirname "$db_path")")
  echo "" | tee -a "$LOG_FILE"
  echo "--- Guild: $GUILD_ID ($db_path) ---" | tee -a "$LOG_FILE"

  # Check if the first table (modlogs) still exists; if not, assume already migrated
  if ! sqlite3 "$db_path" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='modlogs'" 2>/dev/null | grep -q 1; then
    echo "  [SKIP] modlogs already renamed — skipping" | tee -a "$LOG_FILE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  DBS=$((DBS + 1))

  # ── Step 1: Create each new log_* table with identical schema ──

  echo "  [CREATE] log_mod (from modlogs)" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS log_mod (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_tag TEXT NOT NULL,
      checksum TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      guild_name TEXT NOT NULL,
      messages_deleted INTEGER DEFAULT 0
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] log_mod creation" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] log_say (from saylogs)" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS log_say (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      guild_name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      content TEXT NOT NULL,
      message_id TEXT NOT NULL
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] log_say creation" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] log_textfilter (from textfilter_logs)" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS log_textfilter (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_tag TEXT NOT NULL,
      pattern TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      guild_name TEXT NOT NULL
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] log_textfilter creation" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] log_ai_chat (from ai_chat_log)" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS log_ai_chat (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL DEFAULT '',
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL,
      response TEXT NOT NULL,
      response_message_id TEXT NOT NULL DEFAULT '',
      ack_message_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] log_ai_chat creation" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] log_action (from actionlogs)" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS log_action (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      guild_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL DEFAULT '',
      channel_id TEXT NOT NULL DEFAULT '',
      channel_name TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT ''
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] log_action creation" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  # ── Step 2: Migrate data ──

  for pair in "${TABLE_PAIRS[@]}"; do
    read -r old_table new_table <<< "$pair"

    COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM \"${old_table}\";")
    echo "  [MIGRATE] ${COUNT} rows → ${new_table}" | tee -a "$LOG_FILE"

    if [ "$COUNT" -gt 0 ]; then
      sqlite3 "$db_path" "INSERT INTO \"${new_table}\" SELECT * FROM \"${old_table}\";" 2>>"$LOG_FILE" || {
        echo "  [ERR] ${new_table} data migration" | tee -a "$LOG_FILE"
        ERRORS=$((ERRORS + 1))
      }
    fi
  done

  # ── Step 3: Verify row counts ──

  VERIFY_OK=true
  for pair in "${TABLE_PAIRS[@]}"; do
    read -r old_table new_table <<< "$pair"
    OLD_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM \"${old_table}\";")
    NEW_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM \"${new_table}\";")
    if [ "$OLD_COUNT" -ne "$NEW_COUNT" ]; then
      echo "  [WARN] ${old_table} → ${new_table}: ${OLD_COUNT} old vs ${NEW_COUNT} new — mismatch!" | tee -a "$LOG_FILE"
      VERIFY_OK=false
    fi
  done

  if [ "$VERIFY_OK" = false ]; then
    echo "  [ERR] Row count verification failed — skipping DROP" | tee -a "$LOG_FILE"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # ── Step 4: Drop old tables and recreate indexes ──

  for pair in "${TABLE_PAIRS[@]}"; do
    read -r old_table new_table <<< "$pair"
    echo "  [DROP] ${old_table}" | tee -a "$LOG_FILE"
    sqlite3 "$db_path" "DROP TABLE IF EXISTS \"${old_table}\";" 2>>"$LOG_FILE" || {
      echo "  [ERR] DROP ${old_table}" | tee -a "$LOG_FILE"
      ERRORS=$((ERRORS + 1))
    }
  done

  # Recreate indexes on renamed tables
  for idx_def in "${INDEX_DROP_CREATE[@]}"; do
    read -r old_idx new_idx table col <<< "$idx_def"
    echo "  [INDEX] ${new_idx} ON ${table}(${col})" | tee -a "$LOG_FILE"
    sqlite3 "$db_path" "CREATE INDEX IF NOT EXISTS \"${new_idx}\" ON \"${table}\"(\"${col}\");" 2>>"$LOG_FILE" || {
      echo "  [ERR] INDEX ${new_idx}" | tee -a "$LOG_FILE"
      ERRORS=$((ERRORS + 1))
    }
  done

  echo "  [OK]  Migration complete for guild ${GUILD_ID}" | tee -a "$LOG_FILE"
done

echo "" | tee -a "$LOG_FILE"
echo "=== Migration complete ===" | tee -a "$LOG_FILE"
echo "  Databases processed: $DBS" | tee -a "$LOG_FILE"
echo "  Databases skipped (already migrated): $SKIPPED" | tee -a "$LOG_FILE"
echo "  Errors: $ERRORS" | tee -a "$LOG_FILE"
echo "  Log: $LOG_FILE" | tee -a "$LOG_FILE"

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
