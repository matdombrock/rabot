import { Events, type Message } from "discord.js";
import crypto from "node:crypto";
import type { Event } from "../types.js";
import type { ModLog } from "../db.js";
import { computeImageChecksum } from "../checksum/compute.js";
import { deleteUserMessages } from "../helpers/deleteMessages.js";
import db from "../db.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"]);

function isImageAttachment(attachment: { contentType: string | null; url: string; name: string }): boolean {
  if (attachment.contentType?.startsWith("image/")) return true;
  const ext = attachment.name.toLowerCase().slice(attachment.name.lastIndexOf("."));
  return IMAGE_EXTENSIONS.has(ext);
}

async function handleMatch(message: Message, matchedEntry: { checksum: string; label: string }) {
  await db.read();
  const action = db.data.action;
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
    guildId: message.guildId ?? "",
    guildName: message.guild?.name ?? "",
    messagesDeleted: count,
  };

  await db.update(({ modlogs }) => {
    modlogs.push(log);
  });

  console.log(`${action}ed ${log.userTag} (${log.userId}) — matched ${log.checksum.slice(0, 12)}... — deleted ${count} messages`);
}

const messageCreate: Event = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (message.author.bot || !message.guild) return;

    const attachments = message.attachments.filter(isImageAttachment);
    if (attachments.size === 0) return;

    await db.read();
    const watched = db.data.checksums;
    if (watched.length === 0) return;

    for (const [, attachment] of attachments) {
      try {
        const checksum = await computeImageChecksum(attachment.url);
        const entry = watched.find((e) => e.checksum === checksum);
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
