import type { Guild } from "discord.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "ai-prompt.txt"), "utf-8");

const { maxMessages, maxMessageLength, maxTokens, temperature } = config.aiScan;

export interface AiScanResult {
  userId: string;
  username: string;
  analysis: string;
  riskScore: number | null;
  error?: string;
}

export async function generateAiScan(guild: Guild, userId: string): Promise<AiScanResult> {
  if (!config.openrouter.apiKey) {
    return {
      userId,
      username: "",
      analysis: "",
      riskScore: null,
      error: "OpenRouter API key not configured. Add it to src/config.json",
    };
  }

  const db = getGuildDb(guild.id);

  // Get user info
  const memberRow = db.prepare("SELECT * FROM members WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

  const username = memberRow?.username as string ?? member?.user.username ?? userId;
  const displayName = memberRow?.display_name as string ?? member?.displayName ?? "";
  const joinDate = memberRow?.guild_join_date as string ?? member?.joinedAt?.toISOString() ?? "unknown";
  const topRole = memberRow?.top_role as string ?? member?.roles.highest.name ?? "@everyone";
  const isBot = memberRow ? !!(memberRow.is_bot as number) : member?.user.bot ?? false;

  // Get last N messages from this user
  const messages = db.prepare(`
    SELECT content, created_at, channel_id FROM messages
    WHERE author_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, maxMessages) as { content: string; created_at: number; channel_id: string }[];

  // Truncate each message to maxMessageLength chars and reverse to chronological
  const messageText = messages
    .reverse()
    .map(m => {
      const date = new Date(m.created_at).toISOString().slice(0, 10);
      const content = m.content.length > maxMessageLength ? m.content.slice(0, maxMessageLength) + "..." : m.content;
      return `[${date}] ${content}`;
    })
    .join("\n");

  // Build user profile
  const userProfile = [
    `Username: ${username}`,
    `Display Name: ${displayName || "—"}`,
    `User ID: ${userId}`,
    `Guild Join Date: ${joinDate}`,
    `Top Role: ${topRole}`,
    `Is Bot: ${isBot ? "Yes" : "No"}`,
    `Total Messages in DB: ${messages.length}`,
    ``,
    `--- MESSAGES (${messages.length} messages, most recent first) ---`,
    messageText || "(no messages found)",
  ].join("\n");

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
          { role: "user", content: userProfile },
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
    const fullAnalysis = data.choices?.[0]?.message?.content ?? "(no response)";

    // Parse risk score from the last line
    const scoreMatch = fullAnalysis.match(/Risk Score:\s*(\d+)\s*\/\s*10/i);
    const riskScore = scoreMatch ? Math.min(Math.max(parseInt(scoreMatch[1], 10), 1), 10) : null;

    // Remove the score line from the analysis text
    const analysis = fullAnalysis.replace(/\n?Risk Score:\s*\d+\s*\/\s*10\s*/i, '').trim();

    return { userId, username, analysis, riskScore };
  } catch (err) {
    return {
      userId,
      username,
      analysis: "",
      riskScore: null,
      error: err instanceof Error ? err.message : "Unknown error during AI scan",
    };
  }
}
