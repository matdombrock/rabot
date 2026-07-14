import type { Guild } from "discord.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

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

interface StreamChunk {
  type: "text" | "score" | "done" | "error";
  text?: string;
  score?: number;
  error?: string;
}

/**
 * Stream the AI scan response to a callback, yielding partial text chunks and the final score.
 * The caller is responsible for calling `saveAiScanResult` afterward to persist.
 */
export async function streamAiScan(
  guild: Guild,
  userId: string,
  onChunk: (chunk: StreamChunk) => void,
): Promise<void> {
  if (!config.openrouter.apiKey) {
    onChunk({ type: "error", error: "OpenRouter API key not configured. Add it to src/config.json" });
    return;
  }

  const db = getGuildDb(guild.id);

  const memberRow = db.prepare("SELECT * FROM members WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

  const username = memberRow?.username as string ?? member?.user.username ?? userId;
  const displayName = memberRow?.display_name as string ?? member?.displayName ?? "";
  const joinDate = memberRow?.guild_join_date as string ?? member?.joinedAt?.toISOString() ?? "unknown";
  const topRole = memberRow?.top_role as string ?? member?.roles.highest.name ?? "@everyone";
  const isBot = memberRow ? !!(memberRow.is_bot as number) : member?.user.bot ?? false;

  const messages = db.prepare(`
    SELECT content, created_at, channel_id FROM messages
    WHERE author_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, maxMessages) as { content: string; created_at: number; channel_id: string }[];

  const messageText = messages
    .reverse()
    .map(m => {
      const date = new Date(m.created_at).toISOString().slice(0, 10);
      const content = m.content.length > maxMessageLength ? m.content.slice(0, maxMessageLength) + "..." : m.content;
      return `[${date}] ${content}`;
    })
    .join("\n");

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
        stream: true,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "user_scan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                analysis: { type: "string", description: "Full natural language analysis of the user in markdown format" },
                riskScore: { type: "integer", minimum: 1, maximum: 10, description: "Likelihood this user is spammer or malicious" }
              },
              required: ["analysis", "riskScore"],
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

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from OpenRouter");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            // Try to parse the accumulated JSON to extract text
            // Since we're streaming JSON, we extract text from partial JSON
            onChunk({ type: "text", text: delta });
          }
        } catch {
          // Partial JSON — skip parse errors during streaming
        }
      }
    }

    // Send done signal — the frontend will parse the full accumulated text for the score
    onChunk({ type: "done" });

  } catch (err) {
    onChunk({
      type: "error",
      error: err instanceof Error ? err.message : "Unknown error during AI scan",
    });
  }
}

/**
 * Non-streaming version for backward compatibility / save-to-DB use.
 * Parses the score from the final JSON response.
 */
export async function generateAiScan(guild: Guild, userId: string): Promise<AiScanResult> {
  if (!config.openrouter.apiKey) {
    return { userId, username: "", analysis: "", riskScore: null, error: "OpenRouter API key not configured. Add it to src/config.json" };
  }

  const db = getGuildDb(guild.id);

  const memberRow = db.prepare("SELECT * FROM members WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

  const username = memberRow?.username as string ?? member?.user.username ?? userId;
  const displayName = memberRow?.display_name as string ?? member?.displayName ?? "";
  const joinDate = memberRow?.guild_join_date as string ?? member?.joinedAt?.toISOString() ?? "unknown";
  const topRole = memberRow?.top_role as string ?? member?.roles.highest.name ?? "@everyone";
  const isBot = memberRow ? !!(memberRow.is_bot as number) : member?.user.bot ?? false;

  const messages = db.prepare(`
    SELECT content, created_at, channel_id FROM messages
    WHERE author_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, maxMessages) as { content: string; created_at: number; channel_id: string }[];

  const messageText = messages
    .reverse()
    .map(m => {
      const date = new Date(m.created_at).toISOString().slice(0, 10);
      const content = m.content.length > maxMessageLength ? m.content.slice(0, maxMessageLength) + "..." : m.content;
      return `[${date}] ${content}`;
    })
    .join("\n");

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
                riskScore: { type: "integer", minimum: 1, maximum: 10, description: "Likelihood this user is spammer or malicious" }
              },
              required: ["analysis", "riskScore"],
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
    const riskScore = typeof parsed.riskScore === "number" ? Math.min(Math.max(parsed.riskScore, 1), 10) : null;

    return { userId, username, analysis, riskScore };
  } catch (err) {
    return {
      userId, username, analysis: "", riskScore: null,
      error: err instanceof Error ? err.message : "Unknown error during AI scan",
    };
  }
}

export function saveAiScanResult(guildId: string, username: string, analysis: string, riskScore: number | null) {
  const db = getGuildDb(guildId);
  db.prepare("INSERT INTO reports (id, guild_name, type, generated, total_members, username, csv, ai_scan, risk_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    crypto.randomUUID(), "", "ai-scan", new Date().toISOString(), 0, username, "", analysis, riskScore
  );
}
