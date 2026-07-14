import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import type { Database as DbType } from "better-sqlite3";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let authDb: DbType | undefined;

export function getAuthDb(): DbType {
  if (authDb) return authDb;

  mkdirSync("db", { recursive: true });
  authDb = new Database("db/auth.db");
  authDb.pragma("journal_mode = WAL");

  authDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      discord_id TEXT DEFAULT NULL,
      is_superadmin INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_guilds (
      user_id TEXT NOT NULL REFERENCES users(id),
      guild_id TEXT NOT NULL,
      PRIMARY KEY (user_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  return authDb;
}

// ── Password hashing ──

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const computed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
}

// ── User CRUD ──

export interface User {
  id: string;
  username: string;
  password_hash: string;
  discord_id: string | null;
  is_superadmin: number;
  created_at: string;
}

export interface UserGuild {
  user_id: string;
  guild_id: string;
}

export function createUser(username: string, password: string, superadmin = false): User {
  const db = getAuthDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) throw new Error(`User "${username}" already exists`);

  const id = crypto.randomUUID();
  const password_hash = hashPassword(password);
  const created_at = new Date().toISOString();

  db.prepare("INSERT INTO users (id, username, password_hash, is_superadmin, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id, username, password_hash, superadmin ? 1 : 0, created_at
  );

  return { id, username, password_hash, discord_id: null, is_superadmin: superadmin ? 1 : 0, created_at };
}

export function deleteUser(username: string): boolean {
  const db = getAuthDb();
  const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (!user) return false;
  db.prepare("DELETE FROM user_guilds WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  return true;
}

export function getUser(username: string): User | undefined {
  return getAuthDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  return getAuthDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function listUsers(): User[] {
  return getAuthDb().prepare("SELECT * FROM users ORDER BY username").all() as User[];
}

export function setSuperadmin(username: string, value: boolean): boolean {
  const db = getAuthDb();
  const result = db.prepare("UPDATE users SET is_superadmin = ? WHERE username = ?").run(value ? 1 : 0, username);
  return result.changes > 0;
}

export function authenticateUser(username: string, password: string): User | undefined {
  const user = getUser(username);
  if (!user) return undefined;
  if (!verifyPassword(password, user.password_hash)) return undefined;
  return user;
}

// ── Guild assignments ──

export function assignGuild(username: string, guildId: string): boolean {
  const db = getAuthDb();
  const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (!user) return false;
  try {
    db.prepare("INSERT OR IGNORE INTO user_guilds (user_id, guild_id) VALUES (?, ?)").run(user.id, guildId);
    return true;
  } catch {
    return false;
  }
}

export function revokeGuild(username: string, guildId: string): boolean {
  const db = getAuthDb();
  const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (!user) return false;
  const result = db.prepare("DELETE FROM user_guilds WHERE user_id = ? AND guild_id = ?").run(user.id, guildId);
  return result.changes > 0;
}

export function getUserGuilds(userId: string): string[] {
  const rows = getAuthDb().prepare("SELECT guild_id FROM user_guilds WHERE user_id = ?").all(userId) as { guild_id: string }[];
  return rows.map(r => r.guild_id);
}

export function isSuperAdmin(userId: string): boolean {
  const user = getUserById(userId);
  return user?.is_superadmin === 1;
}

// ── Sessions ──

export function createSession(userId: string): string {
  const db = getAuthDb();
  const token = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);

  // Clean up expired sessions for this user
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").run(userId, now.toISOString());

  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token, userId, now.toISOString(), expires.toISOString()
  );

  return token;
}

export function validateSession(token: string): User | undefined {
  const db = getAuthDb();
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?").get(
    token, new Date().toISOString()
  ) as { user_id: string } | undefined;
  if (!session) return undefined;
  return getUserById(session.user_id);
}

export function deleteSession(token: string): void {
  getAuthDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ── Auth middleware helper ──

export function extractSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/session_token=([^;]+)/);
  return match?.[1];
}

export function hasGuildAccess(userId: string, guildId: string): boolean {
  if (isSuperAdmin(userId)) return true;
  const rows = getAuthDb().prepare("SELECT 1 FROM user_guilds WHERE user_id = ? AND guild_id = ?").get(userId, guildId);
  return !!rows;
}
