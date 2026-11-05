import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { loadCommands } from "./commands/index.js";

let deploying = false;

export async function deployGuildCommands(guildId?: string): Promise<void> {
  if (deploying) return;
  deploying = true;
  try {
    const rest = new REST({ version: "10" }).setToken(config.discord.token);
    const targetGuild = guildId || config.discord.guildId;
    const commands = await loadCommands();
    const json = commands.map((cmd) => cmd.json);

    if (targetGuild) {
      await rest.put(Routes.applicationGuildCommands(config.discord.clientId, targetGuild), { body: json });
    }
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body: json });
    console.log("Deployed:", JSON.stringify(json, null, 2));
  } finally {
    deploying = false;
  }
}
