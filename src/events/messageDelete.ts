import { Events, type Message, type PartialMessage } from "discord.js";
import crypto from "node:crypto";
import type { Event } from "../types.js";
import { getGuildDb } from "../db.js";

// Debounce: avoid duplicate logging when both messageDelete and audit log fire
// for the same event, and when our own web-panel delete API already logged it.
const dedupCache = new Set<string>();
setInterval(() => dedupCache.clear(), 5000);

const messageDelete: Event = {
  name: Events.MessageDelete,
  async execute(message: Message<boolean> | PartialMessage) {
    if (!message.guildId || message.author?.bot) return;
    const guildId = message.guildId;
    const dedupKey = `${guildId}:${message.id}`;
    if (dedupCache.has(dedupKey)) return;
    dedupCache.add(dedupKey);

    const db = getGuildDb(guildId);
    const timestamp = new Date().toISOString();

    // Mark as deleted in messages table
    db.prepare("UPDATE messages SET deleted = 1 WHERE id = ?").run(message.id);

    // Resolve author info — prefer cached data, fall back to DB
    const authorId = message.author?.id ?? "";
    const authorName = message.author?.username ?? "";

    // Check if this deletion was already recorded by our own delete endpoint
    // (the manual delete from the web panel already logs an actionlog entry)
    const existing = db.prepare("SELECT id FROM actionlogs WHERE (action = 'message-delete' OR action = 'message-removed') AND target_id = ? AND timestamp > ?").get(authorId, new Date(Date.now() - 3000).toISOString()) as { id: string } | undefined;
    if (existing) {
      dedupCache.delete(dedupKey);
      return;
    }

    // Determine channel name
    let channelName = "unknown";
    try {
      const channel = message.channel;
      if (channel && "name" in channel) channelName = (channel as { name: string }).name;
    } catch {}

    const contentPreview = message.content ? (message.content.length > 200 ? message.content.slice(0, 200) + "..." : message.content) : "";
    const action = authorId ? "message-removed" : "message-purged";

    const logId = crypto.randomUUID();
    db.prepare(`INSERT INTO actionlogs (id, guild_id, guild_name, timestamp, action, target_id, target_name, channel_id, channel_name, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      logId,
      guildId,
      message.guild?.name ?? "",
      timestamp,
      action,
      authorId,
      authorName || authorId,
      message.channelId,
      channelName,
      contentPreview ? `Message removed: "${contentPreview}"` : "Message removed (no content cached)"
    );
  },
};

export default messageDelete;
