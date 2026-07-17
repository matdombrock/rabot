#!/usr/bin/env bash
# Schema migration: split monolithic 'reports' table into per-type tables.
#
# Creates 5 new tables (rep_hist_*) and migrates existing data from the
# old 'reports' table by type, then drops the old table.
#
# Usage: bash schema-migration/2.sh
#
# This script is idempotent — safe to re-run. If a guild database has
# already been migrated (old reports table already dropped), it's skipped.

set -euo pipefail

BASE_DIR="db"
LOG_FILE="./schema-migration/logs/2-$(date +%Y%m%d-%H%M%S).log"
ERRORS=0
DBS=0
SKIPPED=0

echo "=== Schema migration 2: split reports table $(date) ===" | tee -a "$LOG_FILE"

for db_path in "$BASE_DIR"/[0-9]*/data.db; do
  if [ ! -f "$db_path" ]; then
    echo "No guild databases found." | tee -a "$LOG_FILE"
    exit 0
  fi

  GUILD_ID=$(basename "$(dirname "$db_path")")
  echo "" | tee -a "$LOG_FILE"
  echo "--- Guild: $GUILD_ID ($db_path) ---" | tee -a "$LOG_FILE"

  # Skip if reports table no longer exists (already migrated)
  if ! sqlite3 "$db_path" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='reports'" 2>/dev/null | grep -q 1; then
    echo "  [SKIP] reports table already dropped — skipping" | tee -a "$LOG_FILE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  DBS=$((DBS + 1))

  # ── Step 1: Create the 5 new tables ──

  echo "  [CREATE] rep_hist_full" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS rep_hist_full (
      id TEXT PRIMARY KEY,
      guild_name TEXT NOT NULL,
      generated TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      total_members INTEGER DEFAULT 0,
      online_count INTEGER DEFAULT 0,
      csv TEXT NOT NULL
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_full" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] rep_hist_analysis" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS rep_hist_analysis (
      id TEXT PRIMARY KEY,
      guild_name TEXT NOT NULL,
      generated TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      csv TEXT NOT NULL
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_analysis" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] rep_hist_ai_scan" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS rep_hist_ai_scan (
      id TEXT PRIMARY KEY,
      guild_name TEXT NOT NULL,
      generated TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      message_count INTEGER DEFAULT 0,
      ai_scan TEXT NOT NULL DEFAULT '',
      risk_score INTEGER DEFAULT NULL,
      nice_score INTEGER DEFAULT NULL,
      weird_score INTEGER DEFAULT NULL,
      spammer_score INTEGER DEFAULT NULL,
      ai_score INTEGER DEFAULT NULL
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_ai_scan" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] rep_hist_channel_summary" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS rep_hist_channel_summary (
      id TEXT PRIMARY KEY,
      guild_name TEXT NOT NULL,
      generated TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT '',
      channel_name TEXT NOT NULL DEFAULT '',
      message_count INTEGER DEFAULT 0,
      ai_scan TEXT NOT NULL DEFAULT ''
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_channel_summary" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  echo "  [CREATE] rep_hist_guild_scan" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "
    CREATE TABLE IF NOT EXISTS rep_hist_guild_scan (
      id TEXT PRIMARY KEY,
      guild_name TEXT NOT NULL,
      generated TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      ai_scan TEXT NOT NULL DEFAULT '',
      guild_activity_score INTEGER DEFAULT NULL,
      guild_health_score INTEGER DEFAULT NULL,
      guild_toxicity_score INTEGER DEFAULT NULL,
      guild_spam_score INTEGER DEFAULT NULL,
      guild_engagement_score INTEGER DEFAULT NULL
    );
  " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_guild_scan" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }

  # ── Step 2: Migrate existing data per type ──

  # Count rows in old table for verification
  TOTAL_OLD=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM reports;")
  echo "  [DATA] ${TOTAL_OLD} rows in old reports table" | tee -a "$LOG_FILE"

  # rep_hist_analysis — from reports WHERE type = 'analysis'
  ANALYSIS_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM reports WHERE type='analysis';")
  echo "  [MIGRATE] ${ANALYSIS_COUNT} rows → rep_hist_analysis" | tee -a "$LOG_FILE"
  if [ "$ANALYSIS_COUNT" -gt 0 ]; then
    sqlite3 "$db_path" "
      INSERT INTO rep_hist_analysis (id, guild_name, generated, username, csv)
      SELECT id, guild_name, generated, username, csv
      FROM reports
      WHERE type = 'analysis';
    " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_analysis migration" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }
  fi

  # rep_hist_ai_scan — from reports WHERE type = 'ai-scan'
  AI_SCAN_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM reports WHERE type='ai-scan';")
  echo "  [MIGRATE] ${AI_SCAN_COUNT} rows → rep_hist_ai_scan" | tee -a "$LOG_FILE"
  if [ "$AI_SCAN_COUNT" -gt 0 ]; then
    sqlite3 "$db_path" "
      INSERT INTO rep_hist_ai_scan (id, guild_name, generated, username, message_count, ai_scan, risk_score, nice_score, weird_score, spammer_score, ai_score)
      SELECT id, guild_name, generated, username, message_count, ai_scan, risk_score, nice_score, weird_score, spammer_score, ai_score
      FROM reports
      WHERE type = 'ai-scan';
    " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_ai_scan migration" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }
  fi

  # rep_hist_channel_summary — from reports WHERE type = 'channel-summary'
  CHANNEL_SUMMARY_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM reports WHERE type='channel-summary';")
  echo "  [MIGRATE] ${CHANNEL_SUMMARY_COUNT} rows → rep_hist_channel_summary" | tee -a "$LOG_FILE"
  if [ "$CHANNEL_SUMMARY_COUNT" -gt 0 ]; then
    sqlite3 "$db_path" "
      INSERT INTO rep_hist_channel_summary (id, guild_name, generated, channel_id, channel_name, message_count, ai_scan)
      SELECT id, guild_name, generated, channel_id, channel_name, message_count, ai_scan
      FROM reports
      WHERE type = 'channel-summary';
    " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_channel_summary migration" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }
  fi

  # rep_hist_guild_scan — from reports WHERE type = 'guild-scan'
  GUILD_SCAN_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM reports WHERE type='guild-scan';")
  echo "  [MIGRATE] ${GUILD_SCAN_COUNT} rows → rep_hist_guild_scan" | tee -a "$LOG_FILE"
  if [ "$GUILD_SCAN_COUNT" -gt 0 ]; then
    sqlite3 "$db_path" "
      INSERT INTO rep_hist_guild_scan (id, guild_name, generated, message_count, ai_scan, guild_activity_score, guild_health_score, guild_toxicity_score, guild_spam_score, guild_engagement_score)
      SELECT id, guild_name, generated, message_count, ai_scan, guild_activity_score, guild_health_score, guild_toxicity_score, guild_spam_score, guild_engagement_score
      FROM reports
      WHERE type = 'guild-scan';
    " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_guild_scan migration" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }
  fi

  # rep_hist_full — from reports WHERE type = 'full' (likely 0 rows)
  FULL_COUNT=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM reports WHERE type='full';")
  echo "  [MIGRATE] ${FULL_COUNT} rows → rep_hist_full" | tee -a "$LOG_FILE"
  if [ "$FULL_COUNT" -gt 0 ]; then
    sqlite3 "$db_path" "
      INSERT INTO rep_hist_full (id, guild_name, generated, username, csv)
      SELECT id, guild_name, generated, username, csv
      FROM reports
      WHERE type = 'full';
    " 2>>"$LOG_FILE" || { echo "  [ERR] rep_hist_full migration" | tee -a "$LOG_FILE"; ERRORS=$((ERRORS + 1)); }
  fi

  # ── Verify row counts match ──
  MIGRATED=$(( ANALYSIS_COUNT + AI_SCAN_COUNT + CHANNEL_SUMMARY_COUNT + GUILD_SCAN_COUNT + FULL_COUNT ))
  if [ "$MIGRATED" -ne "$TOTAL_OLD" ]; then
    echo "  [WARN] Row count mismatch: ${TOTAL_OLD} old vs ${MIGRATED} migrated (unexpected type values?)" | tee -a "$LOG_FILE"
    # Check for any type values that weren't migrated
    UNMIGRATED=$(sqlite3 "$db_path" "SELECT type, COUNT(*) FROM reports GROUP BY type;" | grep -v '^analysis|' | grep -v '^ai-scan|' | grep -v '^channel-summary|' | grep -v '^guild-scan|' | grep -v '^full|' || true)
    if [ -n "$UNMIGRATED" ]; then
      echo "  [WARN] Unmigrated types:" | tee -a "$LOG_FILE"
      echo "$UNMIGRATED" | while IFS= read -r line; do
        echo "    $line" | tee -a "$LOG_FILE"
      done
    fi
  fi

  # ── Step 3: Drop old reports table ──

  echo "  [DROP] reports table" | tee -a "$LOG_FILE"
  sqlite3 "$db_path" "DROP TABLE IF EXISTS reports;" 2>>"$LOG_FILE" || {
    echo "  [ERR] DROP TABLE reports" | tee -a "$LOG_FILE"
    ERRORS=$((ERRORS + 1))
  }

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
