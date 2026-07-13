import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";

const ping: Command = {
  name: "ping",
  description: "Pong!",
  json: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Pong!")
    .toJSON(),
  async execute(interaction) {
    await interaction.reply("Pong!");
  },
};

export default ping;
