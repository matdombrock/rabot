import type { Guild, TextChannel } from "discord.js";

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

const MESSAGES_PER_CHANNEL = 100;

export async function generateUserAnalysis(guild: Guild, userId: string): Promise<UserAnalysisResult> {
  const member = guild.members.cache.get(userId) ?? await guild.members.fetch({ user: userId, cache: true });
  if (!member) throw new Error("Member not found in guild");

  const user = member.user;
  const now = Date.now();

  const textChannels = guild.channels.cache.filter(
    (ch): ch is TextChannel => ch.isTextBased() && ch.viewable
  );

  let totalMessages = 0;
  let lastPostDate: string | null = null;

  for (const [, channel] of textChannels) {
    try {
      const messages = await channel.messages.fetch({ limit: MESSAGES_PER_CHANNEL });
      for (const [, msg] of messages) {
        if (msg.author.id !== userId) continue;
        totalMessages++;
        if (!lastPostDate || msg.createdTimestamp > new Date(lastPostDate).getTime()) {
          lastPostDate = msg.createdTimestamp > 0 ? new Date(msg.createdTimestamp).toISOString() : null;
        }
      }
    } catch {
      // skip inaccessible channels
    }
  }

  const daysInServer = member.joinedAt
    ? Math.floor((now - member.joinedAt.getTime()) / 86_400_000)
    : "?";
  const accountAgeDays = Math.floor((now - user.createdAt.getTime()) / 86_400_000);

  const result: UserAnalysisResult = {
    guildName: guild.name,
    generated: new Date().toISOString(),
    userId: user.id,
    username: user.username,
    displayName: member.displayName,
    avatarUrl: member.displayAvatarURL({ size: 64 }),
    discordJoinDate: user.createdAt.toISOString(),
    guildJoinDate: member.joinedAt?.toISOString() ?? null,
    topRole: member.roles.highest.name,
    roles: member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => r.name),
    isBoosting: member.premiumSince !== null,
    isBot: user.bot,
    lastPostDate,
    totalMessages,
    daysInServer,
    accountAgeDays,
    csv: [
      "Field,Value",
      `Username,${user.username}`,
      `Display Name,${member.displayName}`,
      `User ID,${user.id}`,
      `Avatar,${member.displayAvatarURL({ size: 64 })}`,
      `Discord Join Date,${user.createdAt.toISOString()}`,
      `Guild Join Date,${member.joinedAt?.toISOString() ?? "N/A"}`,
      `Days in Server,${daysInServer}`,
      `Account Age (days),${accountAgeDays}`,
      `Top Role,${member.roles.highest.name}`,
      `Roles,${member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => r.name).join("; ")}`,
      `Boosting,${member.premiumSince !== null ? "Yes" : "No"}`,
      `Bot,${user.bot ? "Yes" : "No"}`,
      `Last Post,${lastPostDate ?? "N/A"}`,
      `Total Messages,${totalMessages}`,
    ].join("\n"),
  };

  return result;
}
