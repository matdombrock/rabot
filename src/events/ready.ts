import { Events, type Client } from "discord.js";
import type { Event } from "../types.js";

const ready: Event = {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client) {
    console.log(`Logged in as ${client.user?.tag}`);
  },
};

export default ready;
