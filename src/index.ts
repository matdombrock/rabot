import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { createWebServer } from "./web/server.js";
import db from "./db.js";

async function main() {
  await db.read();
  db.data.saylogs ??= [];
  db.data.modlogs ??= [];
  db.data.settings ??= [];
  db.data.reports ??= [];
  db.data.checksums ??= [];
  db.data.action ??= "ban";

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

  const eventMods = await Promise.all([
    import("./events/ready.js"),
    import("./events/interactionCreate.js"),
    import("./events/messageCreate.js"),
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

  await client.login(config.token);
}

main().catch(console.error);
