import type { Guild } from "discord.js";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CACHE_TTL = 40_000;
const memberCache = new Map<string, { fetchedAt: number }>();

export interface QuickReportResult {
  guildName: string;
  generated: string;
  totalMembers: number;
  onlineCount: number;
  csv: string;
}

export async function generateQuickReport(guild: Guild): Promise<QuickReportResult> {
  const cached = memberCache.get(guild.id);
  if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL) {
    await guild.members.fetch();
    memberCache.set(guild.id, { fetchedAt: Date.now() });
  }

  // Fetch guild from REST API for approximate_presence_count
  // (available without GuildPresences privileged intent)
  let onlineCount = 0;
  try {
    const fetched = await guild.fetch();
    onlineCount = fetched.approximatePresenceCount ?? 0;
  } catch {}

  const members = guild.members.cache;
  const now = Date.now();
  const header = "ID,Avatar,Username,Display Name,Top Role,Days in Server";
  const rows: string[] = [header];

  for (const [, member] of members) {
    const user = member.user;
    const daysInServer = member.joinedAt
      ? Math.floor((now - member.joinedAt.getTime()) / 86_400_000)
      : "?";
    const topRole = member.roles.highest.name;
    const avatarUrl = member.displayAvatarURL({ size: 32 });
    rows.push(
      [
        user.id,
        csvEscape(avatarUrl),
        csvEscape(user.username),
        csvEscape(member.displayName),
        csvEscape(topRole),
        String(daysInServer),
      ].join(",")
    );
  }

  return {
    guildName: guild.name,
    generated: new Date().toISOString(),
    totalMembers: members.size,
    onlineCount,
    csv: rows.join("\n"),
  };
}
