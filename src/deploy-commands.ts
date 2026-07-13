import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { loadCommands } from "./commands/index.js";

async function clearCommands(rest: REST, clientId: string, guildId?: string) {
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  const existing = (await rest.get(route)) as { id: string }[];
  for (const cmd of existing) {
    const deleteRoute = guildId
      ? Routes.applicationGuildCommand(clientId, guildId, cmd.id)
      : Routes.applicationCommand(clientId, cmd.id);
    await rest.delete(deleteRoute);
  }
  return existing.length;
}

async function deployCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const guildId = config.guildId || undefined;

  if (guildId) {
    console.log(`Clearing commands for guild ${guildId}...`);
    const n = await clearCommands(rest, config.clientId, guildId);
    console.log(`Deleted ${n} guild commands.`);
  }

  console.log("Clearing global commands...");
  const n = await clearCommands(rest, config.clientId);
  console.log(`Deleted ${n} global commands.`);

  const commands = await loadCommands();
  const json = commands.map((cmd) => cmd.json);

  if (guildId) {
    console.log(`Deploying ${json.length} commands to guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: json });
  }

  console.log(`Deploying ${json.length} global commands...`);
  const data = await rest.put(Routes.applicationCommands(config.clientId), { body: json });

  console.log(`Successfully deployed ${(data as unknown[]).length} global commands.`);
}

deployCommands().catch(console.error);
