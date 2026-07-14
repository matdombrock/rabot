import type { Guild } from "discord.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "ai-guild-scan-prompt.txt"), "utf-8");

const { truncate, maxTokens, temperature } = config.aiScan;

export interface GuildScanResult {
  summary: string;
  messageCount: number;
  generated: string;
  cached: boolean;
  reportId?: string;
  error?: string;
}

export async function generateGuildScan(guild: Guild, force = false): Promise<GuildScanResult> {
  if (!config.openrouter.apiKey) {
    return { summary: "", messageCount: 0, generated: "", cached: false, error: "OpenRouter API key not configured. Add it to src/config.json" };
  }

  const db = getGuildDb(guild.id);

  // Check for existing scan if not forced
  if (!force) {
    const existing = db.prepare(`
      SELECT id, generated, message_count, total_members, ai_scan FROM reports
      WHERE type = 'guild-scan'
      ORDER BY generated DESC LIMIT 1
    `).get() as { id: string; generated: string; message_count: number; total_members: number; ai_scan: string } | undefined;

    if (existing) {
      const newestMsg = db.prepare(`SELECT MAX(created_at) as ts FROM messages`).get() as { ts: number | null } | undefined;
      if (newestMsg && newestMsg.ts) {
        const lastScanTime = new Date(existing.generated).getTime();
        if (newestMsg.ts < lastScanTime) {
          return {
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

  // Grab the most recent messages across all channels
  const messages = db.prepare(`
    SELECT m.content, m.author_id, m.channel_id, u.username
    FROM messages m
    LEFT JOIN members u ON m.author_id = u.id
    ORDER BY m.created_at DESC
  `).all() as { content: string; author_id: string; channel_id: string; username: string | null }[];

  // Accumulate messages up to truncate limit
  let messageLines: string[] = [];
  let totalLen = 0;
  let seenChannels = new Set<string>();

  for (const m of messages) {
    const chName = m.channel_id.slice(0, 8);
    const line = `<${m.username ?? m.author_id}> in #${chName}: ${m.content}`;
    if (totalLen + line.length > truncate && messageLines.length > 0) break;
    messageLines.push(line);
    totalLen += line.length;
    seenChannels.add(m.channel_id);
  }
  messageLines.reverse();
  const messageText = messageLines.join("\n");

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
          { role: "user", content: `Server: ${guild.name}\n\nRecent messages from all channels (${messageLines.length} messages, ${seenChannels.size} channels, ${totalLen} chars):\n\n${messageText || "(no messages found)"}` },
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
    const summary = data.choices?.[0]?.message?.content ?? "(no response)";

    const generated = new Date().toISOString();

    // Save to reports table
    const reportId = crypto.randomUUID();
    const totalMsgs = db.prepare(`SELECT COUNT(*) as count FROM messages`).get() as { count: number } | undefined;
    db.prepare(`INSERT INTO reports (id, guild_name, type, generated, total_members, username, csv, ai_scan, message_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      reportId, guild.name, "guild-scan", generated, totalMsgs?.count ?? 0, "", "", summary, messageLines.length
    );

    return { summary, messageCount: totalMsgs?.count ?? messageLines.length, generated, cached: false };
  } catch (err) {
    return {
      summary: "",
      messageCount: 0,
      generated: "",
      cached: false,
      error: err instanceof Error ? err.message : "Unknown error during guild scan",
    };
  }
}
