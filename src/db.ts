import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import Database from "better-sqlite3";
import type { Database as DbType } from "better-sqlite3";
import { mkdirSync } from "node:fs";

export type Action = "ban" | "kick";

export interface ReportRecord {
  id: string;
  guildId: string;
  guildName: string;
  type: "full" | "analysis";
  generated: string;
  totalMembers: number;
  csv: string;
}

export interface ModLog {
  id: string;
  timestamp: string;
  action: Action;
  userId: string;
  userName: string;
  userTag: string;
  checksum: string;
  label: string;
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
  messagesDeleted: number;
}

export interface SayLog {
  id: string;
  timestamp: string;
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
  content: string;
  messageId: string;
}

// ── Main config (LowDB) ──
export const mainDb = new Low(new JSONFile<{ settings: { guildId: string; guildName: string }[] }>("main.json"), { settings: [] });

// ── Per-guild SQLite databases ──

const guildDbs = new Map<string, DbType>();

export function getGuildDb(guildId: string): DbType {
  let db = guildDbs.get(guildId);
  if (db) return db;

  mkdirSync(`db/${guildId}`, { recursive: true });
  db = new Database(`db/${guildId}/data.db`);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      discord_join_date TEXT,
      guild_join_date TEXT,
      top_role TEXT,
      is_bot INTEGER DEFAULT 0,
      watched INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      guild_name TEXT NOT NULL,
      type TEXT NOT NULL,
      generated TEXT NOT NULL,
      total_members INTEGER DEFAULT 0,
      username TEXT NOT NULL DEFAULT '',
      csv TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modlogs (
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

    CREATE TABLE IF NOT EXISTS saylogs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      guild_name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      content TEXT NOT NULL,
      message_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checksums (
      checksum TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO config (key, value) VALUES ('action', 'ban');
    INSERT OR IGNORE INTO config (key, value) VALUES ('aichat_enabled', 'false');

    CREATE TABLE IF NOT EXISTS textfilters (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('warn', 'kick', 'ban')),
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS textfilter_logs (
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
  `);

  try { db.exec("ALTER TABLE reports ADD COLUMN username TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN ai_scan TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN risk_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN nice_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN weird_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN spammer_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN ai_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN message_count INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN channel_id TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN channel_name TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN guild_activity_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN guild_health_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN guild_toxicity_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN guild_spam_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE reports ADD COLUMN guild_engagement_score INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE members ADD COLUMN watched INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE ai_chat_log ADD COLUMN response_message_id TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE ai_chat_log ADD COLUMN ack_message_id TEXT NOT NULL DEFAULT ''"); } catch {}

  // Migration for messages.deleted column (added for delete-message feature)
  try { db.exec("ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0"); } catch {}

  // Manual action log for mod actions (message deletions, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_log (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL DEFAULT '',
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS actionlogs (
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
  `);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_actionlogs_guild ON actionlogs(guild_id)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_actionlogs_ts ON actionlogs(timestamp)"); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS message_edits (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      old_content TEXT NOT NULL,
      new_content TEXT NOT NULL,
      edited_at TEXT NOT NULL
    );
  `);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_message_edits_message ON message_edits(message_id)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_message_edits_channel ON message_edits(channel_id)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_message_edits_edited_at ON message_edits(edited_at)"); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS ref_entries (
      tag TEXT PRIMARY KEY,
      output TEXT NOT NULL
    );
  `);

  guildDbs.set(guildId, db);
  return db;
}
