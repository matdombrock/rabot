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

  guildDbs.set(guildId, db);
  return db;
}
