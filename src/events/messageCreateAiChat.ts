import crypto from "node:crypto";
import { Events, type Message } from "discord.js";
import type { Event } from "../types.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "../reports/prompts/ai-chat-prompt.txt"), "utf-8");
const { truncate, maxTokens, temperature } = config.llmText;

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
    if (enabledRow?.value !== "true") {
      await message.reply("Hi, I'm rb-zero. Created by Replicat. My 'brain' is currently disabled. Beep boop.").catch(() => {});
      return;
    }

    if (!config.openrouter.apiKey) return;

    // Use per-guild custom prompt if set, otherwise fall back to default
    const customPromptRow = db.prepare("SELECT value FROM config WHERE key = 'aichat_prompt'").get() as { value: string } | undefined;
    const systemPrompt = customPromptRow?.value || SYSTEM_PROMPT;

    // Send an immediate acknowledgment
    const ack = await message.reply("brewing some slop...");
    let ackMessageId = ack.id;

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
      // Timeout: if the fetch takes longer than 30s, the AbortSignal will fire
      const timeoutSignal = AbortSignal.timeout(30000);
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
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens ?? 1000,
          temperature: temperature ?? 0.5,
        }),
        signal: timeoutSignal,
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI chat API error:", errText.slice(0, 200));
        return;
      }

      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      const reply = data.choices?.[0]?.message?.content ?? "(no response)";
      const disclaimer = "\n\n***NOTE: This is an AI driven feature. Responses may be comically incorrect.***";
      const prefixed = `**LLM OUTPUT:**\n\n${reply}${disclaimer}`;

      // Send the actual response as a new message
      let botReply;
      if (prefixed.length <= 2000) {
        botReply = await message.reply(prefixed);
      } else {
        botReply = await message.reply(prefixed.slice(0, 2000));
      }

      // Log to DB
      const channelName = message.channel.isDMBased() ? "DM" : (message.channel as { name: string }).name ?? "unknown";
      db.prepare(
        `INSERT INTO ai_chat_log (id, guild_id, channel_id, channel_name, user_id, user_name, question, response, created_at, response_message_id, ack_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        botReply?.id ?? "",
        ackMessageId ?? "",
      );
    } catch (err) {
      console.error("AI chat error:", err);
      if (err instanceof Error && err.name === 'TimeoutError') {
        await message.reply("LLM Response timed out").catch(() => {});
      }
    }
  },
};

export default messageCreateAiChat;
