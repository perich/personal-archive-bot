To run:

```bash
bun install && bun run main.ts
```

This project was created using `bun init` in bun v1.2.2. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

### why does this exist

This is the source code for my personal archive bot. It's a simple typescript service that's deployed on a cloud server (currently a DigitalOcean Droplet). The purpose of the bot is to save any type of digital media—creating a private personal record of it. I got tired of some of my favorite old videos, websites, etc. disappearing off the internet. The internet is a beauitful trove of information and media but it's also very ephemeral.. very fleeting. 

Two thousand years ago, a volcanic eruption buried an ancient library of papyrus scrolls now known as the Herculaneum Papyri. In 2023 humanity decoded and started reading those scrolls. Ironically, those scrolls are probably more permanent than the content we put on the internet today. I hate the feeling of trying to find an old video, tweet, website, etc. from many years ago and finding it no longer exists. It gives me anxiety to feel like sand is slipping through my fingers. That's why this archive exists. To make sure the things I care about live forever. I can pull up something on a whim at any time, and even share the archive with my kids and grandkids one day!

### how does it work?

- I send a URL via a Telegram chat bot to the server
- The server downloads the URL (using `yt-dlp` for videos, and a chrome headless browser for everything else)
- The server uploads the downloaded file to DigitalOcean Spaces (S3-like API)
- The server sends a message to the Telegram chat bot with a success mesage, or an error message if it failed
- The server deletes the transient files from the server

### how can I use this?

1. Sign up for a Telegram bot token from BotFather, register with DigitalOcean Spaces and SmartProxy to get necessary API credentials.

2. clone this repo and create a `.env` file with the necessary environment variables

3. deploy the bot to a cloud server like DigitalOcean, AWS EC2, etc.

4. great success!
