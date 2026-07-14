import type { Guild } from "discord.js";
import { getGuildDb } from "../db.js";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CACHE_TTL = 40_000;
const memberCache = new Map<string, { fetchedAt: number }>();

export interface UserReportResult {
  guildName: string;
  generated: string;
  totalMembers: number;
  csv: string;
}

export async function generateUserReport(guild: Guild): Promise<UserReportResult> {
  const db = getGuildDb(guild.id);

  const cached = memberCache.get(guild.id);
  if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL) {
    await guild.members.fetch();
    memberCache.set(guild.id, { fetchedAt: Date.now() });
  }

  const members = guild.members.cache;
  const now = Date.now();
  const header = "ID,Username,Display Name,Top Role,Days in Server,Account Age (days),Bot,Total Posts,Last Post";
  const rows: string[] = [header];

  const statsMap = new Map<string, { total: number; last: number | null }>();
  const statsRows = db.prepare("SELECT author_id, COUNT(*) as total, MAX(created_at) as last FROM messages GROUP BY author_id").all() as { author_id: string; total: number; last: number | null }[];
  for (const s of statsRows) {
    statsMap.set(s.author_id, { total: s.total, last: s.last });
  }

  for (const [, member] of members) {
    const user = member.user;
    const daysInServer = member.joinedAt
      ? Math.floor((now - member.joinedAt.getTime()) / 86_400_000)
      : "?";
    const accountAge = Math.floor((now - user.createdAt.getTime()) / 86_400_000);
    const topRole = member.roles.highest.name;
    const stats = statsMap.get(user.id);
    const totalPosts = stats?.total ?? 0;
    const lastPost = stats?.last ? new Date(stats.last).toISOString().slice(0, 19).replace("T", " ") : "";

    rows.push(
      [
        user.id,
        csvEscape(user.username),
        csvEscape(member.displayName),
        csvEscape(topRole),
        String(daysInServer),
        String(accountAge),
        String(user.bot),
        String(totalPosts),
        csvEscape(lastPost),
      ].join(",")
    );
  }

  return {
    guildName: guild.name,
    generated: new Date().toISOString(),
    totalMembers: members.size,
    csv: rows.join("\n"),
  };
}
