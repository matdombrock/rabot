import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Config {
  port: number;
  discord: {
    token: string;
    clientId: string;
    guildId: string;
  };
  openrouter: {
    apiKey: string;
    model: string;
  };
  aiScan: {
    truncate: number;
    maxTokens: number;
    temperature: number;
  };
}

function loadConfig(): Config {
  const raw = readFileSync(join(__dirname, "config.json"), "utf-8");
  return JSON.parse(raw) as Config;
}

export const config = loadConfig();

if (!config.discord.token || config.discord.token === "your-bot-token-here") {
  throw new Error("Missing discord.token in src/config.json — edit the file with your bot token");
}
if (!config.discord.clientId || config.discord.clientId === "your-client-id-here") {
  throw new Error("Missing discord.clientId in src/config.json");
}
