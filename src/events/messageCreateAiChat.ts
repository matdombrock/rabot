import crypto from "node:crypto";
import { Events, type Message } from "discord.js";
import type { Event } from "../types.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "../reports/ai-chat-prompt.txt"), "utf-8");
const { truncate, maxTokens, temperature } = config.aiScan;

const messageCreateAiChat: Event = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    // Only respond to non-bot messages in guilds that mention the bot
    if (message.author.bot || !message.guild) return;
    if (!message.mentions.users.has(message.client.user!.id)) return;

    const guildId = message.guildId!;
    const db = getGuildDb(guildId);

    // Check if AI chat is enabled for this guild
    const enabledRow = db.prepare("SELECT value FROM config WHERE key = 'aichat_enabled'").get() as { value: string } | undefined;
    if (enabledRow?.value !== "true") return;

    if (!config.openrouter.apiKey) return;

    // Send an immediate acknowledgment
    const ack = await message.reply("brewing some slop...");

    // Get recent messages from this channel
    const messages = db.prepare(`
      SELECT content, author_id, created_at FROM messages
      WHERE channel_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(message.channelId) as { content: string; author_id: string; created_at: number }[];

    // Build context
    const contextLines = messages
      .reverse()
      .slice(-20)
      .map(m => `<${m.author_id}> ${m.content}`)
      .join("\n");

    const userMessage = message.content.replace(/<@!?\d+>/g, "").trim();
    const prompt = [
      `Channel context (recent messages):`,
      contextLines || "(no recent messages)",
      ``,
      `User question: ${userMessage}`,
    ].join("\n");

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openrouter.apiKey}`,
          "HTTP-Referer": "https://github.com/your-username/dbot",
        },
        body: JSON.stringify({
          model: config.openrouter.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens ?? 1000,
          temperature: temperature ?? 0.5,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI chat API error:", errText.slice(0, 200));
        return;
      }

      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      const reply = data.choices?.[0]?.message?.content ?? "(no response)";

      // Send the actual response as a new message
      if (reply.length <= 2000) {
        await message.reply(reply);
      } else {
        await message.reply(reply.slice(0, 2000));
      }

      // Log to DB
      const channelName = message.channel.isDMBased() ? "DM" : (message.channel as { name: string }).name ?? "unknown";
      db.prepare(
        `INSERT INTO ai_chat_log (id, guild_id, channel_id, channel_name, user_id, user_name, question, response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        guildId,
        message.channelId,
        channelName,
        message.author.id,
        message.author.username,
        userMessage,
        reply,
        new Date().toISOString(),
      );
    } catch (err) {
      console.error("AI chat error:", err);
    }
  },
};

export default messageCreateAiChat;
