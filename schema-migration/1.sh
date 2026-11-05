#!/usr/bin/env bash
# One-time schema migration for existing guild databases.
#
# When new columns are added to CREATE TABLE IF NOT EXISTS in src/db.ts,
# existing databases won't auto-add them. Run this script to add any
# missing columns to all existing guild databases.
#
# Usage: bash tools/migrate-schema.sh
#
# This script is idempotent — safe to re-run.

set -euo pipefail

BASE_DIR="db"
LOG_FILE="./schmema-migration/logs/1-$(date +%Y%m%d-%H%M%S).log"
ERRORS=0
DBS=0

echo "=== Schema migration $(date) ===" | tee -a "$LOG_FILE"

for db_path in "$BASE_DIR"/[0-9]*/data.db; do
  if [ ! -f "$db_path" ]; then
    echo "No guild databases found." | tee -a "$LOG_FILE"
    exit 0
  fi

  GUILD_ID=$(basename "$(dirname "$db_path")")
  echo "" | tee -a "$LOG_FILE"
  echo "--- Guild: $GUILD_ID ($db_path) ---" | tee -a "$LOG_FILE"
  DBS=$((DBS + 1))

  # ── reports table columns ──
  for col in \
    "ai_scan TEXT NOT NULL DEFAULT ''" \
    "risk_score INTEGER DEFAULT NULL" \
    "nice_score INTEGER DEFAULT NULL" \
    "weird_score INTEGER DEFAULT NULL" \
    "spammer_score INTEGER DEFAULT NULL" \
    "ai_score INTEGER DEFAULT NULL" \
    "message_count INTEGER DEFAULT 0" \
    "channel_id TEXT NOT NULL DEFAULT ''" \
    "channel_name TEXT NOT NULL DEFAULT ''" \
    "guild_activity_score INTEGER DEFAULT NULL" \
    "guild_health_score INTEGER DEFAULT NULL" \
    "guild_toxicity_score INTEGER DEFAULT NULL" \
    "guild_spam_score INTEGER DEFAULT NULL" \
    "guild_engagement_score INTEGER DEFAULT NULL"; do

    if sqlite3 "$db_path" "SELECT 1 FROM pragma_table_info('reports') WHERE name='${col%% *}'" 2>/dev/null | grep -q 1; then
      echo "  [SKIP] reports.${col%% *} — already exists" | tee -a "$LOG_FILE"
    else
      echo "  [ADD]  reports.${col%% *}" | tee -a "$LOG_FILE"
      if sqlite3 "$db_path" "ALTER TABLE reports ADD COLUMN $col" 2>>"$LOG_FILE"; then
        :
      else
        echo "  [ERR]  reports.${col%% *}" | tee -a "$LOG_FILE"
        ERRORS=$((ERRORS + 1))
      fi
    fi
  done

  # ── members.watched column ──
  if sqlite3 "$db_path" "SELECT 1 FROM pragma_table_info('members') WHERE name='watched'" 2>/dev/null | grep -q 1; then
    echo "  [SKIP] members.watched — already exists" | tee -a "$LOG_FILE"
  else
    echo "  [ADD]  members.watched" | tee -a "$LOG_FILE"
    if sqlite3 "$db_path" "ALTER TABLE members ADD COLUMN watched INTEGER DEFAULT 0" 2>>"$LOG_FILE"; then
      :
    else
      echo "  [ERR]  members.watched" | tee -a "$LOG_FILE"
      ERRORS=$((ERRORS + 1))
    fi
  fi

  # ── messages.deleted column ──
  if sqlite3 "$db_path" "SELECT 1 FROM pragma_table_info('messages') WHERE name='deleted'" 2>/dev/null | grep -q 1; then
    echo "  [SKIP] messages.deleted — already exists" | tee -a "$LOG_FILE"
  else
    echo "  [ADD]  messages.deleted" | tee -a "$LOG_FILE"
    if sqlite3 "$db_path" "ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0" 2>>"$LOG_FILE"; then
      :
    else
      echo "  [ERR]  messages.deleted" | tee -a "$LOG_FILE"
      ERRORS=$((ERRORS + 1))
    fi
  fi

  # ── ai_chat_log.response_message_id column ──
  if sqlite3 "$db_path" "SELECT 1 FROM pragma_table_info('ai_chat_log') WHERE name='response_message_id'" 2>/dev/null | grep -q 1; then
    echo "  [SKIP] ai_chat_log.response_message_id — already exists" | tee -a "$LOG_FILE"
  else
    echo "  [ADD]  ai_chat_log.response_message_id" | tee -a "$LOG_FILE"
    if sqlite3 "$db_path" "ALTER TABLE ai_chat_log ADD COLUMN response_message_id TEXT NOT NULL DEFAULT ''" 2>>"$LOG_FILE"; then
      :
    else
      echo "  [ERR]  ai_chat_log.response_message_id" | tee -a "$LOG_FILE"
      ERRORS=$((ERRORS + 1))
    fi
  fi

  # ── ai_chat_log.ack_message_id column ──
  if sqlite3 "$db_path" "SELECT 1 FROM pragma_table_info('ai_chat_log') WHERE name='ack_message_id'" 2>/dev/null | grep -q 1; then
    echo "  [SKIP] ai_chat_log.ack_message_id — already exists" | tee -a "$LOG_FILE"
  else
    echo "  [ADD]  ai_chat_log.ack_message_id" | tee -a "$LOG_FILE"
    if sqlite3 "$db_path" "ALTER TABLE ai_chat_log ADD COLUMN ack_message_id TEXT NOT NULL DEFAULT ''" 2>>"$LOG_FILE"; then
      :
    else
      echo "  [ERR]  ai_chat_log.ack_message_id" | tee -a "$LOG_FILE"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "=== Migration complete ===" | tee -a "$LOG_FILE"
echo "  Databases processed: $DBS" | tee -a "$LOG_FILE"
echo "  Errors: $ERRORS" | tee -a "$LOG_FILE"
echo "  Log: $LOG_FILE" | tee -a "$LOG_FILE"

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
