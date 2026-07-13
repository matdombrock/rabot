import type { Guild, TextChannel } from "discord.js";

export async function deleteUserMessages(guild: Guild, userId: string): Promise<number> {
  const channels = guild.channels.cache.filter(
    (ch): ch is TextChannel => ch.isTextBased()
  );

  let total = 0;
  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      let before: string | undefined;
      let done = false;
      while (!done) {
        const messages = await channel.messages.fetch({ limit: 100, before });
        const userMessages = messages.filter((m) => m.author.id === userId);
        for (const [, msg] of userMessages) {
          await msg.delete().catch(() => {});
          total++;
        }
        if (messages.size < 100) done = true;
        else before = messages.last()?.id;
      }
    })
  );

  return total;
}
