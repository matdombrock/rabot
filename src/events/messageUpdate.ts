import { Events, type Message, type PartialMessage } from "discord.js";
import crypto from "node:crypto";
import type { Event } from "../types.js";
import { getGuildDb } from "../db.js";

const messageUpdate: Event = {
  name: Events.MessageUpdate,
  async execute(oldMessage: Message<boolean> | PartialMessage, newMessage: Message<boolean>) {
    if (!newMessage.guildId || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const guildId = newMessage.guildId;
    const db = getGuildDb(guildId);

    const oldContent = oldMessage.content || "[unknown]";
    const newContent = newMessage.content || "[no text content]";

    db.prepare(`INSERT INTO message_edits (id, message_id, channel_id, author_id, old_content, new_content, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      newMessage.id,
      newMessage.channelId,
      newMessage.author.id,
      oldContent,
      newContent,
      new Date().toISOString()
    );

    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(newContent, newMessage.id);
  },
};

export default messageUpdate;
