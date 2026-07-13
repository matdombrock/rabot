import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

export type Action = "ban" | "kick";

export interface GuildSettings {
  guildId: string;
  guildName: string;
}

export interface ReportRecord {
  id: string;
  guildId: string;
  guildName: string;
  type: "full" | "quick";
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

interface Data {
  settings: GuildSettings[];
  reports: ReportRecord[];
  modlogs: ModLog[];
  checksums: { checksum: string; label: string }[];
  action: Action;
}

const defaultData: Data = { settings: [], reports: [], modlogs: [], checksums: [], action: "ban" };

const adapter = new JSONFile<Data>("db.json");
const db = new Low<Data>(adapter, defaultData);

export default db;
