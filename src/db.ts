import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

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

// ── Data shapes ──

export interface MainData {
  settings: { guildId: string; guildName: string }[];
}
export interface SayData {
  saylogs: SayLog[];
}
export interface ReportsData {
  reports: ReportRecord[];
}
export interface ImageCheckData {
  checksums: { checksum: string; label: string }[];
  action: Action;
  modlogs: ModLog[];
}

export interface GuildDbs {
  main: Low<MainData>;
  say: Low<SayData>;
  reports: Low<ReportsData>;
  imageCheck: Low<ImageCheckData>;
}

const cache = new Map<string, GuildDbs>();

function ensureDir(filePath: string) {
  const dir = dirname(resolve(filePath));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const mainDefault: MainData = { settings: [] };
const sayDefault: SayData = { saylogs: [] };
const reportsDefault: ReportsData = { reports: [] };
const imageCheckDefault: ImageCheckData = { checksums: [], action: "ban", modlogs: [] };

export function getGuildDb(guildId: string): GuildDbs {
  let dbs = cache.get(guildId);
  if (dbs) return dbs;

  const prefix = `db/${guildId}/`;
  ensureDir(prefix + "main.json");

  dbs = {
    main: new Low(new JSONFile<MainData>(prefix + "main.json"), mainDefault),
    say: new Low(new JSONFile<SayData>(prefix + "say.json"), sayDefault),
    reports: new Low(new JSONFile<ReportsData>(prefix + "reports.json"), reportsDefault),
    imageCheck: new Low(new JSONFile<ImageCheckData>(prefix + "imagecheck.json"), imageCheckDefault),
  };

  cache.set(guildId, dbs);
  return dbs;
}

export async function readGuildDb(guildId: string) {
  const dbs = getGuildDb(guildId);
  await Promise.all([dbs.main.read(), dbs.say.read(), dbs.reports.read(), dbs.imageCheck.read()]);
}
