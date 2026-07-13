import { Collection, type Guild, type TextChannel } from "discord.js";
import crypto from "node:crypto";
import db from "../db.js";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface UserReportResult {
  guildName: string;
  generated: string;
  totalMembers: number;
  csv: string;
}

const MESSAGES_PER_CHANNEL = 100;

interface UserStats {
  totalPosts: number;
  lastPostAt: Date | null;
}

async function collectMessageStats(guild: Guild): Promise<Map<string, UserStats>> {
  const stats = new Map<string, UserStats>();

  const channels = guild.channels.cache.filter(
    (ch): ch is TextChannel => ch.isTextBased() && ch.viewable
  );

  for (const [, channel] of channels) {
    try {
      const messages = await channel.messages.fetch({ limit: MESSAGES_PER_CHANNEL });
      for (const [, msg] of messages) {
        const existing = stats.get(msg.author.id) ?? { totalPosts: 0, lastPostAt: null };
        existing.totalPosts++;
        if (!existing.lastPostAt || msg.createdTimestamp > existing.lastPostAt.getTime()) {
          existing.lastPostAt = msg.createdTimestamp > 0 ? new Date(msg.createdTimestamp) : null;
        }
        stats.set(msg.author.id, existing);
      }
    } catch {
      // skip channels we can't access
    }
  }

  return stats;
}

export async function generateUserReport(guild: Guild): Promise<UserReportResult> {
  const [members, messageStats] = await Promise.all([
    guild.members.fetch(),
    collectMessageStats(guild),
  ]);

  const now = Date.now();
  const header = "ID,Username,Display Name,Top Role,Days in Server,Account Age (days),Bot,Total Posts,Last Post";
  const rows: string[] = [header];

  for (const [, member] of members) {
    const user = member.user;
    const daysInServer = member.joinedAt
      ? Math.floor((now - member.joinedAt.getTime()) / 86_400_000)
      : "?";
    const accountAge = Math.floor((now - user.createdAt.getTime()) / 86_400_000);
    const topRole = member.roles.highest.name;
    const userStats = messageStats.get(user.id);
    const totalPosts = userStats?.totalPosts ?? 0;
    const lastPost = userStats?.lastPostAt?.toISOString().slice(0, 19).replace("T", " ") ?? "";

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

  const result = {
    guildName: guild.name,
    generated: new Date().toISOString(),
    totalMembers: members.size,
    csv: rows.join("\n"),
  };

  await db.update(({ reports }) => {
    reports.push({
      id: crypto.randomUUID(),
      guildId: guild.id,
      guildName: guild.name,
      type: "full",
      generated: result.generated,
      totalMembers: result.totalMembers,
      csv: result.csv,
    });
  });

  return result;
}
