import type { Guild } from "discord.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "prompts/ai-guild-scan-prompt.txt"), "utf-8");

const { truncate, maxTokens, temperature } = config.llmText;

export interface GuildScanResult {
  summary: string;
  messageCount: number;
  generated: string;
  cached: boolean;
  reportId?: string;
  error?: string;
  // Scores (1-10, nullable on error)
  activityScore: number | null;
  healthScore: number | null;
  toxicityScore: number | null;
  spamScore: number | null;
  engagementScore: number | null;
}

export async function generateGuildScan(guild: Guild, force = false): Promise<GuildScanResult> {
  if (!config.openrouter.apiKey) {
    return { summary: "", messageCount: 0, generated: "", cached: false, error: "OpenRouter API key not configured. Add it to src/config.json", activityScore: null, healthScore: null, toxicityScore: null, spamScore: null, engagementScore: null };
  }

  const db = getGuildDb(guild.id);

  // Check for existing scan if not forced
  if (!force) {
    const existing = db.prepare(`
      SELECT id, generated, message_count, ai_scan, guild_activity_score, guild_health_score, guild_toxicity_score, guild_spam_score, guild_engagement_score FROM rep_hist_guild_scan
      ORDER BY generated DESC LIMIT 1
    `).get() as { id: string; generated: string; message_count: number; ai_scan: string; guild_activity_score: number | null; guild_health_score: number | null; guild_toxicity_score: number | null; guild_spam_score: number | null; guild_engagement_score: number | null } | undefined;

    if (existing) {
      const newestMsg = db.prepare(`SELECT MAX(created_at) as ts FROM messages`).get() as { ts: number | null } | undefined;
      if (newestMsg && newestMsg.ts) {
        const lastScanTime = new Date(existing.generated).getTime();
        if (newestMsg.ts < lastScanTime) {
          return {
            summary: existing.ai_scan,
            messageCount: existing.message_count,
            generated: existing.generated,
            cached: true,
            reportId: existing.id,
            activityScore: existing.guild_activity_score,
            healthScore: existing.guild_health_score,
            toxicityScore: existing.guild_toxicity_score,
            spamScore: existing.guild_spam_score,
            engagementScore: existing.guild_engagement_score,
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
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "guild_scan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                analysis: { type: "string", description: "Full markdown-formatted analysis of the server's activity including suspicious users and overall assessment" },
                activity: { type: "integer", minimum: 1, maximum: 10, description: "Activity score — how active and lively the server is overall" },
                health:   { type: "integer", minimum: 1, maximum: 10, description: "Health score — how healthy, positive, and well-moderated the server seems" },
                toxicity: { type: "integer", minimum: 1, maximum: 10, description: "Toxicity score — how toxic, hostile, or rule-breaking the conversation is" },
                spam:     { type: "integer", minimum: 1, maximum: 10, description: "Spam score — how much spam, advertising, or low-effort content is present" },
                engagement: { type: "integer", minimum: 1, maximum: 10, description: "Engagement score — how engaged users are (conversations, replies, thoughtful messages)" }
              },
              required: ["analysis", "activity", "health", "toxicity", "spam", "engagement"],
              additionalProperties: false
            }
          }
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 500)}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const rawContent = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(rawContent);

    const summary = parsed.analysis || parsed.summary || rawContent;
    const clamp = (n: unknown) => typeof n === "number" ? Math.min(Math.max(n, 1), 10) : null;
    const activityScore = clamp(parsed.activity);
    const healthScore = clamp(parsed.health);
    const toxicityScore = clamp(parsed.toxicity);
    const spamScore = clamp(parsed.spam);
    const engagementScore = clamp(parsed.engagement);

    const generated = new Date().toISOString();

    // Save to reports table
    const reportId = crypto.randomUUID();
    const totalMsgs = db.prepare(`SELECT COUNT(*) as count FROM messages`).get() as { count: number } | undefined;
    db.prepare(`INSERT INTO rep_hist_guild_scan (id, guild_name, generated, message_count, ai_scan, guild_activity_score, guild_health_score, guild_toxicity_score, guild_spam_score, guild_engagement_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      reportId, guild.name, generated, totalMsgs?.count ?? 0, summary,
      activityScore, healthScore, toxicityScore, spamScore, engagementScore
    );

    return {
      summary,
      messageCount: totalMsgs?.count ?? messageLines.length,
      generated,
      cached: false,
      activityScore,
      healthScore,
      toxicityScore,
      spamScore,
      engagementScore,
    };
  } catch (err) {
    return {
      summary: "",
      messageCount: 0,
      generated: "",
      cached: false,
      error: err instanceof Error ? err.message : "Unknown error during guild scan",
      activityScore: null,
      healthScore: null,
      toxicityScore: null,
      spamScore: null,
      engagementScore: null,
    };
  }
}
