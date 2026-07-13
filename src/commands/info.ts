import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { Command } from "../types.js";

const info: Command = {
  name: "info",
  description: "Show bot information",
  json: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show bot information")
    .toJSON(),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("Bot Info")
      .setColor(0x5865f2)
      .addFields(
        { name: "Node.js", value: process.version, inline: true },
        { name: "Discord.js", value: `v${interaction.client.user?.id ? "14" : "?"}`, inline: true },
        { name: "Uptime", value: formatUptime(interaction.client.uptime), inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};

function formatUptime(ms: number | null): string {
  if (ms === null) return "N/A";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

export default info;
