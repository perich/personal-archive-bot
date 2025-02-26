import { Telegraf } from "telegraf";
import { ChildProcess, spawn } from "child_process";
import { s3, S3Client } from "bun";
import { unlink } from "fs/promises";
const stripQuotes = (str?: string) => {
  if (!str) throw new Error("No string provided");
  return str.replace(/^["']|["']$/g, "");
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ALLOWED_USER_ID = Number(process.env.ALLOWED_USER_ID);
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const SMARTPROXY_USERNAME = process.env.SMARTPROXY_USERNAME;
const SMARTPROXY_PASSWORD = stripQuotes(process.env.SMARTPROXY_PASSWORD!);

const args = process.argv.slice(2);
const cookiesIndex = args.indexOf("--cookies");
const COOKIES_PATH = cookiesIndex !== -1 ? args[cookiesIndex + 1] : null;
const THIRTY_MINUTES_IN_MS = 1000 * 60 * 30;

const requiredEnvVars = {
  TELEGRAM_TOKEN,
  ALLOWED_USER_ID,
  S3_ENDPOINT,
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  SMARTPROXY_USERNAME,
  SMARTPROXY_PASSWORD,
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([name]) => name);

if (missingVars.length > 0) {
  throw new Error(
    `Missing environment variables: ${missingVars.join(", ")} 😱\n` +
      `Please check your .env file 🔍`
  );
}

const bot = new Telegraf(TELEGRAM_TOKEN!, {
  // by default Telegraf has a 90s TTL.. sometimes videos can take much longer than that to download.. we'll use a 30min TTL (matching our yt-dlp TTL) + 1min buffer
  handlerTimeout: THIRTY_MINUTES_IN_MS + 1000 * 60,
});

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  bucket: S3_BUCKET,
  accessKeyId: S3_ACCESS_KEY_ID,
  secretAccessKey: S3_SECRET_ACCESS_KEY,
});

function isValidYouTubeUrl(url: string): boolean {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return regex.test(url);
}

async function downloadVideo(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let childProcess: ChildProcess | null = null;
    let stdout = "";
    let stderr = "";

    const ttl = setTimeout(() => {
      if (childProcess) {
        childProcess.kill();
      }
      reject(new Error("Download timed out"));
    }, THIRTY_MINUTES_IN_MS);

    const proxyUrl = `http://${SMARTPROXY_USERNAME}:${SMARTPROXY_PASSWORD}@gate.smartproxy.com:7000`;

    const ytDlpArgs = [
      url,
      "-o",
      `./downloads/%(title)s.%(ext)s`,
      "--restrict-filename",
      "--proxy",
      proxyUrl,
    ];

    if (COOKIES_PATH) {
      ytDlpArgs.push("--cookies", COOKIES_PATH);
    }

    childProcess = spawn("yt-dlp", ytDlpArgs);

    childProcess.stdout?.on("data", (data) => {
      stdout += data.toString();
      console.log("stdout", data.toString());
    });

    childProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
      console.log("stderr", data.toString());
    });

    childProcess.on("close", (code) => {
      if (code === 0) {
        // Look for the merger line first
        let match = stdout.match(/\[Merger\] Merging formats into "(.+?)"/);
        if (!match) {
          // If not found, look for the "[download] Destination: .+" line
          match = stdout.match(/\[download\] Destination: (.+)/);
        }
        if (!match) {
          // If not found, look for the "[download] .+ has already been downloaded" line
          match = stdout.match(/\[download\] (.+) has already been downloaded/);
        }
        if (match) {
          resolve(match[1].trim());
          clearTimeout(ttl);
        } else {
          reject(new Error("Could not determine downloaded file path"));
          clearTimeout(ttl);
        }
      } else {
        reject(new Error(`Download failed. From stderr: ${stderr} `));
        clearTimeout(ttl);
      }
    });

    childProcess.on("error", (err) => {
      reject(err);
      clearTimeout(ttl);
    });
  });
}

async function uploadToSpaces(filePath: string): Promise<void> {
  const fileName = filePath.split("/").pop(); // Extract the file name from the path
  if (!fileName) {
    throw new Error("Invalid file path, unable to determine file name.");
  }

  const s3file = s3Client.file(`yt-dlp/${fileName}`); // Define storage path in Spaces
  await Bun.write(s3file, Bun.file(filePath)); // Upload file to DigitalOcean Spaces
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
  let filePath;
  try {
    filePath = await downloadVideo(url);
    ctx.reply("Download complete. Uploading to Spaces...");
    await uploadToSpaces(filePath);
    ctx.reply(`Upload complete!`);
  } catch (error) {
    ctx.reply(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    console.error(error);
  } finally {
    if (!filePath) return;
    await unlink(filePath); // Delete the specific transient downloaded file if exists
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
