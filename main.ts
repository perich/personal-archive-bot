import { Telegraf } from "telegraf";
import { spawn } from "child_process";
import { Dropbox } from "dropbox";
import { unlink, readdir } from "fs/promises";
import { join } from "path";

// Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // Telegram bot token
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN; // Dropbox access token
const ALLOWED_USER_ID = Number(process.env.ALLOWED_USER_ID); // Telegram user ID for authorization
if (!TELEGRAM_TOKEN || !DROPBOX_TOKEN || !ALLOWED_USER_ID) {
  throw Error("missing env vars in process.env");
}

const bot = new Telegraf(TELEGRAM_TOKEN);
const dbx = new Dropbox({ accessToken: DROPBOX_TOKEN });

function isValidYouTubeUrl(url: string): boolean {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return regex.test(url);
}

const ONE_HOUR_IN_MS = 1000 * 60 * 60;
async function downloadVideo(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ttl = setTimeout(() => {
      reject(new Error("Download timed out"));
    }, ONE_HOUR_IN_MS);

    let stdout = "";
    const dl = spawn("yt-dlp", [
      url,
      "-o",
      `./downloads/%(title)s.%(ext)s`,
      "--restrict-filename",
    ]);

    dl.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log("stdout", data.toString());
    });

    dl.stderr.on("data", (data) => {
      console.log("stderr", data.toString());
    });

    dl.on("close", (code) => {
      if (code === 0) {
        // Look for the merger line first
        let match = stdout.match(/\[Merger\] Merging formats into "(.+?)"/);
        if (!match) {
          // Look for the "[download] Destination:" line first
          let match = stdout.match(/\[download\] Destination: (.+)/);
        }
        if (!match) {
          // If not found, look for the "[download] .+ has already been downloaded" line
          match = stdout.match(/\[download\] (.+) has already been downloaded/);
        }
        if (match) {
          console.log("regex match", match);
          resolve(match[1].trim());
          clearTimeout(ttl);
        } else {
          reject(new Error("Could not determine downloaded file path"));
          clearTimeout(ttl);
        }
      } else {
        reject(new Error("Download failed"));
        clearTimeout(ttl);
      }
    });

    dl.on("error", (err) => {
      reject(err);
      clearTimeout(ttl);
    });
  });
}

async function uploadToDropbox(filePath: string): Promise<void> {
  //   console.log("mocked dropbox upload from file path:", filePath);
  //   await new Promise<void>((res) => {
  //     setTimeout(() => {
  //       res();
  //     }, 15_000);
  //   });
  const fileContent = await Bun.file(filePath).arrayBuffer();
  const fileName = filePath.split("/").pop() || "video.mp4";
  await dbx.filesUpload({
    path: `/videos/${fileName}`,
    contents: fileContent,
  });
}

bot.on("text", async (ctx) => {
  if (ctx.from.id !== ALLOWED_USER_ID) {
    ctx.reply("Unauthorized user.");
    return;
  }

  if (ctx.message.text === "hi") {
    ctx.reply(
      "I've gone out to find myself. If I come back before I return, please ask me to wait."
    );
    return;
  }

  const url = ctx.message.text;
  if (!isValidYouTubeUrl(url)) {
    ctx.reply("Please send a valid YouTube URL.");
    return;
  }

  ctx.reply("Starting download...");
  try {
    const filePath = await downloadVideo(url);
    ctx.reply("Download complete. Uploading to Dropbox...");
    await uploadToDropbox(filePath);
    ctx.reply("Upload complete!");
    await unlink(filePath); // Delete the specific downloaded file
  } catch (error) {
    ctx.reply(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
});

// Start the bot
bot.launch();
console.log("Bot is running...");

// Graceful shutdown
process.on("SIGINT", () => {
  bot.stop();
  console.log("Bot stopped.");
  process.exit(0);
});
