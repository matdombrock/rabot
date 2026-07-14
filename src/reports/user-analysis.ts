import type { Guild } from "discord.js";
import { getGuildDb } from "../db.js";

export interface UserAnalysisResult {
  guildName: string;
  generated: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  discordJoinDate: string;
  guildJoinDate: string | null;
  topRole: string;
  roles: string[];
  isBoosting: boolean;
  isBot: boolean;
  lastPostDate: string | null;
  totalMessages: number;
  daysInServer: number | string;
  accountAgeDays: number;
  csv: string;
}

export async function generateUserAnalysis(guild: Guild, userId: string): Promise<UserAnalysisResult> {
  const db = getGuildDb(guild.id);

  const memberRow = db.prepare("SELECT * FROM members WHERE id = ?").get(userId) as any;
  const msgStats = db.prepare("SELECT COUNT(*) as total, MAX(created_at) as last FROM messages WHERE author_id = ?").get(userId) as { total: number; last: number | null };
  const totalMessages = msgStats?.total ?? 0;
  const lastPostAt = msgStats?.last ? new Date(msgStats.last).toISOString() : null;

  const member = guild.members.cache.get(userId) ?? await guild.members.fetch({ user: userId, cache: true });

  const now = Date.now();
  const daysInServer = member?.joinedAt
    ? Math.floor((now - member.joinedAt.getTime()) / 86_400_000)
    : "?";
  const accountAgeDays = member
    ? Math.floor((now - member.user.createdAt.getTime()) / 86_400_000)
    : memberRow ? Math.floor((now - new Date(memberRow.discord_join_date).getTime()) / 86_400_000) : 0;

  const result: UserAnalysisResult = {
    guildName: guild.name,
    generated: new Date().toISOString(),
    userId,
    username: memberRow?.username ?? member?.user.username ?? "unknown",
    displayName: memberRow?.display_name ?? member?.displayName ?? "unknown",
    avatarUrl: memberRow?.avatar_url ?? member?.displayAvatarURL({ size: 64 }) ?? "",
    discordJoinDate: memberRow?.discord_join_date ?? member?.user.createdAt.toISOString() ?? "",
    guildJoinDate: memberRow?.guild_join_date ?? member?.joinedAt?.toISOString() ?? null,
    topRole: memberRow?.top_role ?? member?.roles.highest.name ?? "@everyone",
    roles: member ? member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => r.name) : [],
    isBoosting: member?.premiumSince !== null && member !== undefined,
    isBot: memberRow ? !!memberRow.is_bot : member?.user.bot ?? false,
    lastPostDate: lastPostAt,
    totalMessages,
    daysInServer,
    accountAgeDays,
    csv: [
      "Field,Value",
      `Username,${memberRow?.username ?? member?.user.username ?? "unknown"}`,
      `Display Name,${memberRow?.display_name ?? member?.displayName ?? "unknown"}`,
      `User ID,${userId}`,
      `Avatar,${memberRow?.avatar_url ?? member?.displayAvatarURL({ size: 64 }) ?? ""}`,
      `Discord Join Date,${memberRow?.discord_join_date ?? member?.user.createdAt.toISOString() ?? ""}`,
      `Guild Join Date,${memberRow?.guild_join_date ?? member?.joinedAt?.toISOString() ?? "N/A"}`,
      `Days in Server,${daysInServer}`,
      `Account Age (days),${accountAgeDays}`,
      `Top Role,${memberRow?.top_role ?? member?.roles.highest.name ?? "@everyone"}`,
      `Roles,${member ? member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => r.name).join("; ") : ""}`,
      `Boosting,${member?.premiumSince ? "Yes" : "No"}`,
      `Bot,${memberRow ? (!!memberRow.is_bot ? "Yes" : "No") : member?.user.bot ?? false ? "Yes" : "No"}`,
      `Last Post,${lastPostAt ?? "N/A"}`,
      `Total Messages,${totalMessages}`,
    ].join("\n"),
  };

  return result;
}
