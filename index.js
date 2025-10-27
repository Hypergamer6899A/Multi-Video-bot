// index.js
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const express = require("express");
const fs = require("fs-extra");
require("dotenv").config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- Config ---
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_MS) || 600_000; // default 10 minute

// YouTube channels
const YT_API_KEY = process.env.YT_API_KEY;
const YT_CHANNELS = [
  process.env.YT_CHANNEL1,
  process.env.YT_CHANNEL2,
  process.env.YT_CHANNEL3,
  process.env.YT_CHANNEL4,
  process.env.YT_CHANNEL5,
].filter(Boolean); // remove empty entries

const DATA_FILE = "./mediaData.json";

// --- Helper Functions ---
async function getLatestVideo(channelId) {
  try {
    const res = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        key: YT_API_KEY,
        channelId,
        part: "snippet",
        order: "date",
        maxResults: 1,
      },
    });

    const item = res.data.items?.[0];
    if (!item || item.id.kind !== "youtube#video") return null;

    return {
      id: item.id.videoId,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    };
  } catch (err) {
    console.error(`❌ Failed to fetch YouTube data for ${channelId}:`, err.message);
    return null;
  }
}

async function checkForNewVideos() {
  let saved = {};
  try {
    saved = await fs.readJson(DATA_FILE);
  } catch {
    await fs.writeJson(DATA_FILE, saved);
  }

  for (const channelId of YT_CHANNELS) {
    const latest = await getLatestVideo(channelId);
    if (!latest) continue;

    if (saved[channelId] !== latest.id) {
      console.log(`🎥 New video found from ${channelId}: ${latest.url}`);

      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
      if (channel) {
        await channel.send(`🎬 New video uploaded!\n${latest.url}`);
      }

      saved[channelId] = latest.id;
      await fs.writeJson(DATA_FILE, saved, { spaces: 2 });
    }
  }
}

// --- Client Ready ---
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  // Run YouTube check immediately and then at intervals
  checkForNewVideos(); // run once immediately
  setInterval(checkForNewVideos, CHECK_INTERVAL); // repeat
});

// --- Express Keepalive ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("YouTube alert bot is running."));
app.listen(PORT, () => console.log(`🌐 Web server listening on port ${PORT}`));

// --- Login ---
client.login(process.env.TOKEN).catch(console.error);
