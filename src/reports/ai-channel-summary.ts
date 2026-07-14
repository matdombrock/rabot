import type { Guild, TextChannel } from "discord.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "prompts/ai-channel-prompt.txt"), "utf-8");

const { truncate, maxTokens, temperature } = config.aiScan;

export interface ChannelSummaryResult {
  channelId: string;
  channelName: string;
  summary: string;
  messageCount: number;
  generated: string;
  cached: boolean;
  reportId?: string;
  error?: string;
}

/**
 * Generate or retrieve a cached AI summary for a channel.
 * If a recent summary exists and no new messages have been posted since,
 * returns the cached version.
 */
export async function getChannelSummary(
  guild: Guild,
  channelId: string,
  force = false,
): Promise<ChannelSummaryResult> {
  const db = getGuildDb(guild.id);
  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  const channelName = (channel as { name: string } | undefined)?.name ?? channelId;

  if (!config.openrouter.apiKey) {
    return {
      channelId,
      channelName,
      summary: "",
      messageCount: 0,
      generated: "",
      cached: false,
      error: "OpenRouter API key not configured. Add it to src/config.json",
    };
  }

  // Check for existing summary (unless forced)
  if (!force) {
    const existing = db.prepare(`
      SELECT id, generated, message_count, total_members, ai_scan FROM reports
      WHERE type = 'channel-summary' AND channel_id = ?
      ORDER BY generated DESC LIMIT 1
    `).get(channelId) as { id: string; generated: string; message_count: number; total_members: number; ai_scan: string } | undefined;

    if (existing) {
      const newestMsg = db.prepare(`
        SELECT created_at FROM messages
        WHERE channel_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(channelId) as { created_at: number } | undefined;

      if (newestMsg) {
        const lastSummaryTime = new Date(existing.generated).getTime();
        if (newestMsg.created_at < lastSummaryTime) {
          return {
            channelId,
            channelName,
            summary: existing.ai_scan,
            messageCount: existing.total_members || existing.message_count,
            generated: existing.generated,
            cached: true,
            reportId: existing.id,
          };
        }
      }
    }
  }

  // Fetch recent messages
  const messages = db.prepare(`
    SELECT content, author_id, created_at FROM messages
    WHERE channel_id = ?
    ORDER BY created_at DESC
  `).all(channelId) as { content: string; author_id: string; created_at: number }[];

  // Accumulate messages up to truncate limit
  let messageLines: string[] = [];
  let totalLen = 0;
  for (const m of messages) {
    const date = new Date(m.created_at).toISOString().slice(0, 10);
    const line = `[${date}] <${m.author_id}> ${m.content}`;
    if (totalLen + line.length > truncate && messageLines.length > 0) break;
    messageLines.push(line);
    totalLen += line.length;
  }
  messageLines.reverse();
  const messageText = messageLines.join("\n");

  // Call OpenRouter API
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openrouter.apiKey}`,
        "HTTP-Referer": "https://github.com/your-username/dbot",
      },
      body: JSON.stringify({
        model: config.openrouter.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Channel: #${channelName}\n\nRecent messages (${messageLines.length} messages, ${totalLen} chars):\n\n${messageText || "(no messages found)"}` },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 500)}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const summary = data.choices?.[0]?.message?.content ?? "(no summary returned)";

    // Save to reports table
    const reportId = crypto.randomUUID();
    const generated = new Date().toISOString();
    const totalInChannel = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE channel_id = ?`).get(channelId) as { count: number } | undefined;
    db.prepare(`INSERT INTO reports (id, guild_name, type, generated, total_members, username, csv, ai_scan, message_count, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      reportId, guild.name, "channel-summary", generated, totalInChannel?.count ?? 0, "", "", summary, messageLines.length, channelId
    );

    return {
      channelId,
      channelName,
      summary,
      messageCount: totalInChannel?.count ?? messageLines.length,
      generated,
      cached: false,
      reportId,
    };
  } catch (err) {
    return {
      channelId,
      channelName,
      summary: "",
      messageCount: 0,
      generated: "",
      cached: false,
      error: err instanceof Error ? err.message : "Unknown error during channel summary generation",
    };
  }
}
