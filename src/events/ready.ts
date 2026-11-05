import { Events, type Client } from "discord.js";
import type { Event } from "../types.js";
import { config } from "../config.js";

const ready: Event = {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client) {
    const model = config.openrouter.model || "(not configured)";
    console.log(`Logged in as ${client.user?.tag}`);
    console.log(`AI model: ${model}`);
  },
};

export default ready;
