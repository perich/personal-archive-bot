To install dependencies:

```bash
bun install
```

To run:

```bash
bun run main.ts
```

If you get this error: 

```
ERROR: [youtube] MYwd0Wus5Ik: Sign in to confirm you’re not a bot.
```

You can pass a cookies file to the script that will get passed to the `yt-dlp` process.
```bash
bun run main.ts --cookies /path/to/cookies.txt
```

This project was created using `bun init` in bun v1.2.2. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
