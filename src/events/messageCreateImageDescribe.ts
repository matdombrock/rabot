import { Events, type Message, AttachmentBuilder } from "discord.js";
import type { Event } from "../types.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const messageCreateImageDescribe: Event = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guildId!;
    const db = getGuildDb(guildId);

    // Check if AI image describe is enabled for this guild
    const enabledRow = db.prepare("SELECT value FROM config WHERE key = 'aiimagedescribe_enabled'").get() as { value: string } | undefined;
    if (enabledRow?.value !== "true") return;

    if (!config.openrouter.apiKey) return;

    // Find image attachments
    const imageAttachments = message.attachments.filter(a => {
      if (!a.contentType) return false;
      return a.contentType.startsWith("image/");
    });

    // Also check for image URLs in message content
    const imageUrlPattern = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?/gi;
    const contentUrls = (message.content.match(imageUrlPattern) || []);

    const imageUrls: string[] = [];

    for (const [, att] of imageAttachments) {
      imageUrls.push(att.url);
    }
    for (const url of contentUrls) {
      if (!imageUrls.includes(url)) imageUrls.push(url);
    }

    if (imageUrls.length === 0) return;

    // React to acknowledge we're processing
    await message.react("🤖").catch(() => {});
    await message.react("👁️").catch(() => {});

    // Process each image (limit to first 4 to avoid abuse)
    const toProcess = imageUrls.slice(0, 4);

    for (const imageUrl of toProcess) {
      try {
        const timeoutSignal = AbortSignal.timeout(30000);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openrouter.apiKey}`,
            "HTTP-Referer": "https://github.com/your-username/dbot",
          },
          body: JSON.stringify({
            model: config.imageDescribe.model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Describe this image in a few sentences. Be specific about what you see." },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
          signal: timeoutSignal,
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("Image describe API error:", errText.slice(0, 200));
          return;
        }

        const data = (await response.json()) as { choices: { message: { content: string } }[] };
        const description = data.choices?.[0]?.message?.content ?? "(no description)";

        const reply = [
          "This image looks like:",
          description,
          "",
          "*This is an AI driven accessibility feature. Image descriptions may be comically incorrect.*",
        ].join("\n");

        if (reply.length <= 2000) {
          await message.reply(reply);
        } else {
          await message.reply(reply.slice(0, 2000));
        }
      } catch (err) {
        console.error("Image describe error:", err);
        if (err instanceof Error && err.name === "TimeoutError") {
          await message.reply("Image description timed out").catch(() => {});
        }
      }
    }
  },
};

export default messageCreateImageDescribe;
