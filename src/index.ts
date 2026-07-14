import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { createWebServer } from "./web/server.js";
import { mainDb } from "./db.js";

async function main() {
  await mainDb.read();

  const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ]});

  const eventMods = await Promise.all([
    import("./events/ready.js"),
    import("./events/interactionCreate.js"),
    import("./events/messageCreate.js"),
    import("./events/messageDelete.js"),
    import("./events/guildAuditLogEntryCreate.js"),
    import("./events/messageCreateAiChat.js"),
    import("./events/messageCreateImageDescribe.js"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  for (const mod of eventMods) {
    const event = mod.default;
    if (event.once) {
      c.once(event.name, (...args: unknown[]) => event.execute(...args));
    } else {
      c.on(event.name, (...args: unknown[]) => event.execute(...args));
    }
  }

  client.once(Events.ClientReady, () => {
    createWebServer(client);
  });

  await client.login(config.discord.token);
}

main().catch(console.error);
