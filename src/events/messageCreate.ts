import { Events, type Message } from "discord.js";
import crypto from "node:crypto";
import type { Event } from "../types.js";
import type { ModLog } from "../db.js";
import { computeImageChecksum } from "../checksum/compute.js";
import { deleteUserMessages } from "../helpers/deleteMessages.js";
import { getGuildDb } from "../db.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"]);

function isImageAttachment(attachment: { contentType: string | null; url: string; name: string }): boolean {
  if (attachment.contentType?.startsWith("image/")) return true;
  const ext = attachment.name.toLowerCase().slice(attachment.name.lastIndexOf("."));
  return IMAGE_EXTENSIONS.has(ext);
}

async function handleMatch(message: Message, matchedEntry: { checksum: string; label: string }) {
  const guildId = message.guildId!;
  const db = getGuildDb(guildId);
  const actionRow = db.prepare("SELECT value FROM config WHERE key = 'action'").get() as { value: string } | undefined;
  const action = (actionRow?.value ?? "ban") as "ban" | "kick";
  const member = message.member;
  if (!member) return;

  if (action === "ban") {
    await member.ban({ deleteMessageSeconds: 0 });
  } else {
    await member.kick();
  }

  const count = await deleteUserMessages(message.guild!, message.author.id);

  const log: ModLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    userId: message.author.id,
    userName: message.author.username,
    userTag: message.author.tag,
    checksum: matchedEntry.checksum,
    label: matchedEntry.label ?? "",
    channelId: message.channelId,
    channelName: message.channel.isDMBased() ? "DM" : (message.channel as any).name ?? "unknown",
    guildId,
    guildName: message.guild?.name ?? "",
    messagesDeleted: count,
  };

  db.prepare(`INSERT INTO modlogs (id, timestamp, action, user_id, user_name, user_tag, checksum, label, channel_id, channel_name, guild_id, guild_name, messages_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    log.id, log.timestamp, log.action, log.userId, log.userName, log.userTag, log.checksum, log.label, log.channelId, log.channelName, log.guildId, log.guildName, log.messagesDeleted
  );

  console.log(`${action}ed ${log.userTag} (${log.userId}) — matched ${log.checksum.slice(0, 12)}... — deleted ${count} messages`);
}

const messageCreate: Event = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (message.author.bot || !message.guild) return;
    const guildId = message.guildId!;
    const db = getGuildDb(guildId);
    const now = new Date().toISOString();

    // ── Live tracking ──

    db.prepare(`INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      message.id, message.channelId, message.author.id, message.content || '[no text content]', message.createdTimestamp
    );

    const member = message.member;
    if (member) {
      db.prepare(`INSERT INTO members (id, username, display_name, avatar_url, discord_join_date, guild_join_date, top_role, is_bot, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name, avatar_url=excluded.avatar_url, top_role=excluded.top_role, updated_at=excluded.updated_at`).run(
        message.author.id, message.author.username, member.displayName, member.displayAvatarURL({ size: 64 }),
        message.author.createdAt.toISOString(), member.joinedAt?.toISOString() ?? null, member.roles.highest.name, message.author.bot ? 1 : 0, now
      );
    }

    // ── Text filter check ──

    const filters = db.prepare("SELECT id, pattern, action, label FROM textfilters").all() as { id: string; pattern: string; action: string; label: string }[];
    if (filters.length > 0 && message.content) {
      const contentLower = message.content.toLowerCase();
      for (const f of filters) {
        if (contentLower.includes(f.pattern.toLowerCase())) {
          const tag = message.author.tag;
          const guildMember = message.member ?? await message.guild.members.fetch(message.author.id);

          if (f.action === "warn") {
            try { await (message.author as any).send(`Your message in **${message.guild.name}** was flagged by the text filter (pattern: \`${f.pattern}\`${f.label ? ` — ${f.label}` : ""}). Please avoid posting similar content.`); } catch {}
            await (message.channel as any).send(`⚠️ ${message.author}, your message was flagged by the text filter.`).catch(() => {});
          } else if (f.action === "kick") {
            await guildMember?.kick().catch(() => {});
          } else if (f.action === "ban") {
            await guildMember?.ban({ deleteMessageSeconds: 0 }).catch(() => {});
          }

          db.prepare(`INSERT INTO textfilter_logs (id, timestamp, action, user_id, user_name, user_tag, pattern, label, channel_id, channel_name, guild_id, guild_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            crypto.randomUUID(), new Date().toISOString(), f.action, message.author.id, message.author.username, message.author.tag, f.pattern, f.label, message.channelId, message.channel.isDMBased() ? "DM" : (message.channel as any).name ?? "unknown", message.guildId ?? "", message.guild?.name ?? ""
          );

          console.log(`[textfilter] ${f.action}ed ${tag} — matched "${f.pattern}"${f.label ? ` (${f.label})` : ""}`);
          return;
        }
      }
    }

    // ── Image check ──

    const attachments = message.attachments.filter(isImageAttachment);
    if (attachments.size === 0) return;

    const checksumRows = db.prepare("SELECT checksum, label FROM checksums").all() as { checksum: string; label: string }[];
    if (checksumRows.length === 0) return;

    for (const [, attachment] of attachments) {
      try {
        const checksum = await computeImageChecksum(attachment.url);
        const entry = checksumRows.find((e) => e.checksum === checksum);
        if (entry) {
          await handleMatch(message, entry);
          return;
        }
      } catch (err) {
        console.error("Checksum check failed:", err);
      }
    }
  },
};

export default messageCreate;
