import "dotenv/config";

function getEnvVar(name: string, required = true): string {
  const value = process.env[name];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const config = {
  token: getEnvVar("DISCORD_TOKEN"),
  clientId: getEnvVar("CLIENT_ID"),
  guildId: getEnvVar("GUILD_ID", false),
} as const;
