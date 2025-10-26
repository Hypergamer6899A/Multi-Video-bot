// index.js
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const express = require("express");
const fs = require("fs-extra");
require("dotenv").config();

// --- Discord Client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// --- Config ---
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const YT_API_KEY = process.env.YT_API_KEY;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_TOKEN = process.env.TWITCH_TOKEN;

const YT_CHANNELS = [
  "UCXXXXXX1",
  "UCXXXXXX2",
  "UCXXXXXX3",
  "UCXXXXXX4",
  "UCXXXXXX5",
];

const TWITCH_CHANNELS = ["twitchUser1", "twitchUser2"];

const DATA_FILE = "./mediaData.json";
const CHECK_INTERVAL = 60 * 1000; // 1 minute

// --- Load / Save JSON ---
async function loadData() {
  try {
    return await fs.readJson(DATA_FILE);
  } catch {
    return { youtube: {}, twitch: {} };
  }
}

async function saveData(data) {
  await fs.writeJson(DATA_FILE, data, { spaces: 2 });
}

// --- YouTube Helper ---
async function getLatestYouTubeVideo(channelId) {
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
    console.error("❌ YT API error:", err.message);
    return null;
  }
}

// --- Twitch Helper ---
async function isTwitchLive(username) {
  try {
    const res = await axios.get("https://api.twitch.tv/helix/streams", {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${TWITCH_TOKEN}`,
      },
      params: { user_login: username },
    });
    return res.data.data?.[0] ? true : false;
  } catch (err) {
    console.error("❌ Twitch API error:", err.message);
    return false;
  }
}

// --- Main Check Function ---
async function checkMedia() {
  const data = await loadData();
  const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);

  // --- YouTube ---
  for (const ytId of YT_CHANNELS) {
    const latest = await getLatestYouTubeVideo(ytId);
    if (!latest) continue;

    if (data.youtube[ytId] !== latest.id) {
      console.log(`🎥 New video: ${latest.url}`);
      if (channel) await channel.send(`New video dropped! 🎬\n${latest.url}`);
      data.youtube[ytId] = latest.id;
    }
  }

  // --- Twitch ---
  for (const twitchName of TWITCH_CHANNELS) {
    const live = await isTwitchLive(twitchName);

    if (live && !data.twitch[twitchName]?.announced) {
      console.log(`🔴 ${twitchName} is live!`);
      if (channel)
        await channel.send(`🔴 ${twitchName} just went live on Twitch! https://twitch.tv/${twitchName}`);
      data.twitch[twitchName] = { announced: true };
    } else if (!live) {
      data.twitch[twitchName] = { announced: false };
    }
  }

  await saveData(data);
}

// --- Bot Ready ---
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  checkMedia(); // Run immediately
  setInterval(checkMedia, CHECK_INTERVAL); // Repeat
});

// --- Express Keepalive ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("Media bot is running."));
app.listen(PORT, () => console.log(`🌐 Web server listening on port ${PORT}`));

client.login(process.env.TOKEN).catch(console.error);
