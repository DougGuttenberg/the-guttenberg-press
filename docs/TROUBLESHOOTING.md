# Daily Paper Troubleshooting Guide

Common issues and how to fix them.

## "No Paper Delivered This Morning"

The most common issue. Let's diagnose it.

### Step 1: Check if the daemon is running
```bash
npm run status
```

If you see `Daemon: Stopped`, the background process crashed. Restart it:
```bash
npm start
```

If you see `Daemon: Running`, move to Step 2.

### Step 2: Check the logs
```bash
npm run logs
```

Look for error messages. Common ones are listed below.

### Step 3: Run the pipeline manually
```bash
npm run manual
```

This generates and sends today's paper immediately. Watch Telegram and email for it.

If this works, the system is fine and the daemon just needs to be restarted. If this fails, look at the error and jump to the relevant section below.

### Step 4: Check the scheduled delivery time
Look in `.env` to confirm the delivery time:
```bash
cat .env | grep DELIVERY_TIME
```

Should show something like `DELIVERY_TIME=06:00`.

On macOS, check the launchd job:
```bash
launchctl list | grep daily-paper
```

On Linux, check crontab:
```bash
crontab -l | grep daily-paper
```

---

## "Pipeline Failed" or "Error: API key invalid"

The Claude API connection failed.

### Quick Fix
```bash
npm run manual
```

Try again manually. Sometimes this is a temporary API issue.

### Detailed Diagnosis

1. **Verify API key is correct:**
   ```bash
   cat .env | grep ANTHROPIC_API_KEY
   ```
   Should start with `sk-ant-`.

2. **Verify API key is active:**
   - Go to [console.anthropic.com/keys](https://console.anthropic.com/keys)
   - Check if the key still exists and isn't disabled
   - Check your account billing is up to date

3. **Check rate limits:**
   - Daily Paper uses the Claude API. If you hit rate limits, wait a few minutes
   - Check your usage at [console.anthropic.com/usage](https://console.anthropic.com/usage)
   - If you're over budget, add more credits

4. **Verify network connection:**
   ```bash
   ping api.anthropic.com
   ```
   Should respond. If not, check your internet connection.

### If Key Was Compromised
If you think the key was exposed:

1. Go to [console.anthropic.com/keys](https://console.anthropic.com/keys)
2. Click the three dots next to your key
3. Click "Revoke"
4. Create a new key
5. Update `.env`:
   ```bash
   nano .env
   ```
   Replace `ANTHROPIC_API_KEY` with the new key
6. Restart:
   ```bash
   npm stop
   npm start
   ```

---

## "Telegram not working" or "Can't send message to Telegram"

### Step 1: Verify Telegram configuration
```bash
cat .env | grep TELEGRAM
```

Should show:
- `TELEGRAM_BOT_TOKEN` - starts with numbers and colon
- `TELEGRAM_CHAT_ID` - a long number

### Step 2: Test Telegram connection
```bash
npm run manual
```

Should send a test message to Telegram. Check for errors in the output.

### Step 3: Common Telegram issues

**Issue: "Invalid bot token"**
- Go to @BotFather on Telegram
- Send `/mybots` to see your bots
- Click your bot
- Click "API Token"
- Copy the token exactly (no spaces or extra characters)
- Update `.env` with the new token
- Run `npm start` to restart

**Issue: "Invalid chat ID"**
- Go to @userinfobot on Telegram
- Send any message
- It responds with your User ID (a number)
- Update the `TELEGRAM_CHAT_ID` in `.env`
- Run `npm start` to restart

**Issue: "Access denied" or "Forbidden"**
- Make sure the bot exists and you own it
- Go to @BotFather, send `/mybots`, click your bot
- The bot should list your username as creator
- Try blocking and unblocking the bot in Telegram
- Generate a new bot via @BotFather if needed

### Step 4: Send a test message manually
Edit `src/send-telegram.js` to add a test function, or run:

```javascript
// In Node REPL
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot('YOUR_BOT_TOKEN');
bot.sendMessage('YOUR_CHAT_ID', 'Test message')
  .then(() => console.log('Success!'))
  .catch(err => console.log('Error:', err));
```

Replace with your actual token and chat ID from `.env`.

---

## "Email not sending" or "Gmail errors"

### Step 1: Verify Gmail configuration
```bash
cat .env | grep GMAIL
```

Should show:
- `GMAIL_ADDRESS` - your full Gmail address
- `GMAIL_APP_PASSWORD` - 16 characters

### Step 2: Common Gmail issues

**Issue: "Invalid email address"**
- Verify `GMAIL_ADDRESS` in `.env` is your actual Gmail address
- For example: `doug.paper.news@gmail.com`

**Issue: "Invalid app password"**
- Regular Gmail passwords don't work with Daily Paper
- You must use an "App Password" (16 characters)
- Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
- Generate a new app password for "Mail"
- Copy the 16 characters (no spaces)
- Update `.env` with the new password
- Restart: `npm stop && npm start`

**Issue: "2-Step Verification not enabled"**
- App Passwords only work if 2-Step Verification is on
- Go to [myaccount.google.com/security](https://myaccount.google.com/security)
- Click "2-Step Verification"
- Enable it with your phone
- Then create an App Password (see above)

**Issue: "Less secure apps" error**
- Daily Paper doesn't need "Less secure apps" enabled
- Make sure 2-Step Verification is ON
- Use an App Password, not your regular Gmail password

### Step 3: Test email manually
```bash
npm run manual
```

This sends both a test email and Telegram message. Check your Gmail for the email.

Look in Spam/Promotions folder if you don't see it in Inbox.

### Step 4: Check Gmail logs
Look at the last email sent:
```bash
npm run logs | grep -i "email\|gmail"
```

### Step 5: Verify Gmail can send
Test by sending an email to yourself manually from Gmail.com first to confirm the account works.

---

## "Too Many Stories" or "Too Few Stories"

Stories vary day to day. If it's consistently off, adjust the thresholds.

### If you're getting 20+ stories
You want 12-15 per day. To get fewer:

1. Edit `config/judgment-model.json`
2. Lower the `judgment_threshold` (e.g., from 0.5 to 0.6)
3. Restart: `npm stop && npm start`
4. Test: `npm run manual`

**judgment-model.json:**
```json
{
  "judgment_threshold": 0.5,
  ...
}
```

Increase the threshold value (0.0 to 1.0) to be more selective.

### If you're getting 5 or fewer stories
To get more:

1. Edit `config/judgment-model.json`
2. Lower the `judgment_threshold` (e.g., from 0.6 to 0.4)
3. Or increase the `max_stories_per_day` (e.g., from 15 to 20)
4. Restart and test

### If stories don't match your interests
See "Stories Feel Generic or Stale" below.

---

## "Stories Feel Generic or Stale"

The AI isn't curating well for your interests. Let's tune it.

### Step 1: Give feedback
React to stories in Telegram with emoji:
- ✅ for "I loved this"
- ❌ for "Not interested"

After ~20 reactions, the system learns your preferences better.

### Step 2: Check feedback is being processed
```bash
npm run logs | tail -20
```

Look for "Feedback processed" or "Updated weights based on feedback".

### Step 3: Adjust judgment weights manually
Edit `config/judgment-model.json`. It looks like:

```json
{
  "weights": {
    "freshness": 0.15,
    "relevance": 0.35,
    "importance": 0.25,
    "impact": 0.15,
    "quality": 0.10
  },
  "judgment_threshold": 0.5,
  ...
}
```

Each weight is 0.0 to 1.0. Total should equal 1.0.

**What each weight does:**

- **freshness** (0.15): How recent the story is. Higher = prefer breaking news.
- **relevance** (0.35): How well it matches your interests. Higher = more personalized.
- **importance** (0.25): Prominence/reach. Higher = favor major publications.
- **impact** (0.15): Business/societal impact. Higher = focus on consequential stories.
- **quality** (0.10): Writing quality and source credibility. Higher = stricter standards.

**Example adjustments:**

If you want more breaking tech news:
```json
"freshness": 0.30,
"relevance": 0.40,
```

If you want more important business stories:
```json
"importance": 0.40,
"impact": 0.20,
```

If you want only high-quality writing:
```json
"quality": 0.20,
"importance": 0.20,
"relevance": 0.30,
"freshness": 0.15,
"impact": 0.15,
```

After changing, restart and test:
```bash
npm stop && npm start
npm run manual
```

### Step 4: Add or remove RSS sources
See [CUSTOMIZATION.md](CUSTOMIZATION.md) for how to add sources.

If you're getting stories that aren't relevant, remove the source. If you're missing topics, add sources.

### Step 5: Adjust interest keywords
Edit `config/judgment-model.json` to add keywords:

```json
{
  "keywords": {
    "positive": ["advertising", "marketing", "creativity", "tech"],
    "negative": ["politics", "celebrity"]
  },
  ...
}
```

Stories matching positive keywords score higher. Negative keywords reduce scores.

---

## "Can't View Logs" or "Logs Are Empty"

### Check log file exists
```bash
ls -la logs/
```

Should show `daily-paper.log`.

### View recent logs
```bash
npm run logs
```

Or directly:
```bash
tail -50 logs/daily-paper.log
```

View more lines:
```bash
tail -100 logs/daily-paper.log
```

View entire log:
```bash
cat logs/daily-paper.log
```

### View logs in real-time
While the system runs:
```bash
tail -f logs/daily-paper.log
```

Press `Ctrl+C` to stop.

### Clear old logs
```bash
npm run clean
```

This deletes all cache and logs. The system will start fresh.

---

## "Daemon won't stop" or "Process still running"

### Force stop
```bash
npm stop
```

If that doesn't work:

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.guttenberg.dailypaper.plist
```

**Linux:**
```bash
killall node
```

### Restart cleanly
```bash
npm stop
sleep 2
npm start
```

---

## "How do I run the pipeline manually?"

To generate and send today's paper immediately:

```bash
npm run manual
```

To run individual steps:

```bash
# Fetch all RSS feeds
npm run fetch

# Judge stories (requires fetched candidates)
npm run judge

# Format for preview (no send)
npm run format

# Send today's paper
npm run send
```

---

## "How do I restart everything?"

```bash
npm stop
npm start
```

Or a hard restart:
```bash
npm stop
npm run clean
npm start
```

This clears all cache and starts fresh.

---

## "How do I change the delivery time?"

### macOS
```bash
nano ~/.launchd-daily-paper.plist
```

Find the line with `<string>6:00:00</string>` and change the time.

### Linux
```bash
crontab -e
```

Find the daily-paper line and change the time. For example:
- `0 6 * * *` = 6:00 AM
- `0 7 * * *` = 7:00 AM
- `0 8 * * *` = 8:00 AM

### Restart for changes to take effect
```bash
npm stop
npm start
```

### To verify the new time
```bash
npm run status
```

---

## "How do I check if the system is healthy?"

```bash
npm run status
```

This shows:
- Daemon status (Running/Stopped)
- Next delivery time
- Last delivery time
- Configuration check
- API connection status

All should show green checkmarks.

---

## "I want to see what stories the AI evaluated"

```bash
cat cache/stories.json | head -20
```

This shows the candidate stories before curation.

After curation:
```bash
cat cache/judged.json | head -20
```

This shows stories after the AI evaluated them, with scores.

---

## "How do I report a bug or get help?"

1. Check the logs: `npm run logs`
2. Try: `npm run manual`
3. Read [TROUBLESHOOTING.md](TROUBLESHOOTING.md) (this file)
4. Check [SETUP.md](SETUP.md) - maybe something wasn't configured right
5. Review [CUSTOMIZATION.md](CUSTOMIZATION.md) - maybe it's a settings thing
6. Read the main [README](../README.md)

If still stuck:
1. Save the output: `npm run logs > debug.txt`
2. Include this in any bug report
3. Describe what you expected to happen and what actually happened

---

## Still Having Issues?

Most issues fall into these categories:

1. **API/Auth problems** → See API key section
2. **Network issues** → Check internet connection
3. **Telegram problems** → Verify bot token and chat ID
4. **Gmail problems** → Verify app password and 2FA
5. **Logic issues** → Adjust weights in judgment-model.json
6. **Scheduling issues** → Verify daemon is running with `npm run status`

Start by checking logs: `npm run logs`

Then try manual run: `npm run manual`

Then restart: `npm stop && npm start`

Good luck! Daily Paper should be delivering fresh news to your inbox by morning.
