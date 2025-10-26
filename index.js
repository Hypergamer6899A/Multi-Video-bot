const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const express = require("express");
const fs = require("fs-extra");
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const CHECK_INTERVAL = 60 * 1000; // 1 minute
const DATA_FILE = "./mediaData.json";

// Channels to monitor
const YT_CHANNELS = [
  process.env.YT_CHANNEL_1,
  process.env.YT_CHANNEL_2,
  process.env.YT_CHANNEL_3,
  process.env.YT_CHANNEL_4,
  process.env.YT_CHANNEL_5,
];

const TWITCH_CHANNELS = [
  process.env.TWITCH_CHANNEL_1,
  process.env.TWITCH_CHANNEL_2,
];

// Load or initialize JSON
async function loadData() {
  try {
    return await fs.readJson(DATA_FILE);
  } catch {
    const init = { youtube: {}, twitch: {} };
    await fs.writeJson(DATA_FILE, init, { spaces: 2 });
    return init;
  }
}

async function saveData(data) {
  await fs.writeJson(DATA_FILE, data, { spaces: 2 });
}

// --- YouTube ---
async function getLatestYouTubeVideo(channelId) {
  try {
    const res = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        key: process.env.YT_API_KEY,
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
    console.error("❌ YouTube fetch error:", err.message);
    return null;
  }
}

// --- Twitch ---
async function isTwitchLive(channelName) {
  try {
    const res = await axios.get(`https://api.twitch.tv/helix/streams`, {
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${process.env.TWITCH_TOKEN}`,
      },
      params: { user_login: channelName },
    });
    return res.data.data?.length > 0;
  } catch (err) {
    console.error("❌ Twitch fetch error:", err.message);
    return false;
  }
}

// --- Main check ---
async function checkMedia() {
  const data = await loadData();
  const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);

  // Check YouTube
  for (const ytId of YT_CHANNELS) {
    const latest = await getLatestYouTubeVideo(ytId);
    if (!latest) continue;

    if (data.youtube[ytId] !== latest.id) {
      console.log(`🎥 New YT video: ${latest.url}`);
      if (channel) await channel.send(`New video dropped! 🎬\n${latest.url}`);
      data.youtube[ytId] = latest.id;
    }
  }

  // Check Twitch
  for (const twitchName of TWITCH_CHANNELS) {
    const live = await isTwitchLive(twitchName);
    if (live && !data.twitch[twitchName]) {
      console.log(`🔴 ${twitchName} is live!`);
      if (channel)
        await channel.send(`🔴 ${twitchName} just went live on Twitch! https://twitch.tv/${twitchName}`);
      data.twitch[twitchName] = true;
    } else if (!live && data.twitch[twitchName]) {
      // Reset when streamer goes offline
      data.twitch[twitchName] = false;
    }
  }

  await saveData(data);
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  checkMedia();
  setInterval(checkMedia, CHECK_INTERVAL);
});

// --- Express Keepalive ---
const app = express();
app.get("/", (_, res) => res.send("Media bot running"));
app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Web server running")
);

client.login(process.env.TOKEN).catch(console.error);
