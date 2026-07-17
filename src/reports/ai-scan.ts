import type { Guild } from "discord.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "prompts/ai-prompt.txt"), "utf-8");

const { truncate, maxTokens, temperature } = config.llmText;

export interface AiScanResult {
  userId: string;
  username: string;
  analysis: string;
  riskScore: number | null;
  niceScore: number | null;
  weirdScore: number | null;
  spammerScore: number | null;
  aiScore: number | null;
  cached?: boolean;
  messageCount?: number;
  generated?: string;
  error?: string;
}

interface StreamChunk {
  type: "text" | "score" | "done" | "error";
  text?: string;
  score?: number;
  error?: string;
}

export async function generateAiScan(guild: Guild, userId: string, force = false): Promise<AiScanResult> {
  if (!config.openrouter.apiKey) {
    return { userId, username: "", analysis: "", riskScore: null, niceScore: null, weirdScore: null, spammerScore: null, aiScore: null, error: "OpenRouter API key not configured. Add it to src/config.json" };
  }

  const db = getGuildDb(guild.id);

  // Get user info (needed before cache check for username)
  const memberRow = db.prepare("SELECT * FROM members WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

  const username = memberRow?.username as string ?? member?.user.username ?? userId;

  // Check for existing scan if not forced
  if (!force) {
    const existing = db.prepare(`
      SELECT id, generated, ai_scan, risk_score, nice_score, weird_score, spammer_score, ai_score FROM rep_hist_ai_scan
      WHERE username = ?
      ORDER BY generated DESC LIMIT 1
    `).get(username) as { id: string; generated: string; ai_scan: string; risk_score: number | null; nice_score: number | null; weird_score: number | null; spammer_score: number | null; ai_score: number | null } | undefined;

    if (existing) {
      const newestMsg = db.prepare(`SELECT MAX(created_at) as ts FROM messages WHERE author_id = ?`).get(userId) as { ts: number | null } | undefined;
      if (newestMsg?.ts) {
        const lastScanTime = new Date(existing.generated).getTime();
        if (newestMsg.ts < lastScanTime) {
          return {
            userId,
            username,
            analysis: existing.ai_scan || "",
            riskScore: existing.risk_score,
            niceScore: existing.nice_score,
            weirdScore: existing.weird_score,
            spammerScore: existing.spammer_score,
            aiScore: existing.ai_score,
            cached: true,
            generated: existing.generated,
          };
        }
      }
    }
  }

  const displayName = memberRow?.display_name as string ?? member?.displayName ?? "";
  const joinDate = memberRow?.guild_join_date as string ?? member?.joinedAt?.toISOString() ?? "unknown";
  const topRole = memberRow?.top_role as string ?? member?.roles.highest.name ?? "@everyone";
  const isBot = memberRow ? !!(memberRow.is_bot as number) : member?.user.bot ?? false;

  // Grab messages in reverse chronological order, accumulating until truncate limit
  const allMessages = db.prepare(`
    SELECT content, created_at FROM messages
    WHERE author_id = ?
    ORDER BY created_at DESC
  `).all(userId) as { content: string; created_at: number }[];

  let messageLines: string[] = [];
  let totalLen = 0;
  for (const m of allMessages) {
    const date = new Date(m.created_at).toISOString().slice(0, 10);
    const line = `[${date}] ${m.content}`;
    if (totalLen + line.length > truncate && messageLines.length > 0) break;
    messageLines.push(line);
    totalLen += line.length;
  }
  // Reverse so oldest-first
  messageLines.reverse();
  const messageText = messageLines.join("\n");

  const userProfile = [
    `Username: ${username}`,
    `Display Name: ${displayName || "—"}`,
    `User ID: ${userId}`,
    `Guild Join Date: ${joinDate}`,
    `Top Role: ${topRole}`,
    `Is Bot: ${isBot ? "Yes" : "No"}`,
    `Total Messages in DB: ${allMessages.length}`,
    ``,
    `--- MESSAGES (showing ${messageLines.length} messages, ${totalLen} chars) ---`,
    messageText || "(no messages found)",
  ].join("\n");

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
          { role: "user", content: userProfile },
        ],
        max_tokens: maxTokens,
        temperature,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "user_scan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                analysis: { type: "string", description: "Full natural language analysis of the user in markdown format" },
                risk:    { type: "integer", minimum: 1, maximum: 10, description: "Risk score — likelihood user is malicious or harmful" },
                nice:    { type: "integer", minimum: 1, maximum: 10, description: "Nice score — how friendly, helpful, and positive this user is" },
                weird:   { type: "integer", minimum: 1, maximum: 10, description: "Weird score — how unusual, eccentric, or odd the user's behaviour is" },
                spammer: { type: "integer", minimum: 1, maximum: 10, description: "Spammer score — likelihood user is posting spam, ads, or repetitive content" },
                ai:      { type: "integer", minimum: 1, maximum: 10, description: "AI/LLM score — likelihood the user is an AI bot or LLM-generated" }
              },
              required: ["analysis", "risk", "nice", "weird", "spammer", "ai"],
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

    const analysis = parsed.analysis || "(no analysis returned)";
    const clamp = (n: unknown) => typeof n === "number" ? Math.min(Math.max(n, 1), 10) : null;
    const riskScore = clamp(parsed.risk);
    const niceScore = clamp(parsed.nice);
    const weirdScore = clamp(parsed.weird);
    const spammerScore = clamp(parsed.spammer);
    const aiScore = clamp(parsed.ai);

    return { userId, username, analysis, riskScore, niceScore, weirdScore, spammerScore, aiScore };
  } catch (err) {
    return {
      userId, username, analysis: "", riskScore: null, niceScore: null, weirdScore: null, spammerScore: null, aiScore: null,
      error: err instanceof Error ? err.message : "Unknown error during AI scan",
    };
  }
}

export function saveAiScanResult(
  guildId: string, guildName: string, username: string, analysis: string,
  riskScore: number | null, niceScore: number | null, weirdScore: number | null,
  spammerScore: number | null, aiScore: number | null,
  messageCount = 0,
) {
  const db = getGuildDb(guildId);
  db.prepare(`INSERT INTO rep_hist_ai_scan (id, guild_name, generated, username, message_count, ai_scan, risk_score, nice_score, weird_score, spammer_score, ai_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), guildName, new Date().toISOString(), username, messageCount, analysis,
    riskScore, niceScore, weirdScore, spammerScore, aiScore
  );
}
