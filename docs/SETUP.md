# Daily Paper Setup Guide

This guide walks you through setting up Daily Paper step-by-step. You'll need to create three accounts and configure them. Total time: ~15 minutes.

## Prerequisites

- **macOS 11+** or any Linux distribution
- **Node.js 16+** (download from [nodejs.org](https://nodejs.org))
- **Internet connection**
- Three accounts you'll create below (free tier works for all)

## Step 1: Create an Anthropic Account and Get Your API Key

Claude AI powers the curation engine. You'll need an Anthropic API key.

### 1a. Create Account
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Click "Sign Up"
3. Use your email and create a password
4. Verify your email

### 1b. Get Your API Key
1. After logging in, go to [console.anthropic.com/keys](https://console.anthropic.com/keys)
2. Click "Create Key"
3. Name it "Daily Paper" (just for reference)
4. Click "Create"
5. **Copy the entire key** (starts with `sk-ant-`)
6. **Save it securely** - you'll paste it into setup.sh

You'll see a screen like this:

```
┌─────────────────────────────────────────────┐
│ API Keys                                     │
├─────────────────────────────────────────────┤
│ + Create Key                                │
│                                             │
│ Daily Paper                                 │
│ sk-ant-[redacted]............. (created)   │
└─────────────────────────────────────────────┘
```

Keep this key safe. It's like a password for the AI service.

### 1c. Check Your Billing
1. While at console.anthropic.com, click your profile (top right)
2. Click "Billing"
3. Add a payment method if you haven't (small monthly charge, ~$270-280)
4. Set a usage limit if desired (e.g., $300/month)

## Step 2: Create a Telegram Bot

Telegram is how you'll receive your daily paper in the morning. Setting up a bot takes 3 minutes.

### 2a. Create the Bot via @BotFather
1. Open Telegram (download from [telegram.org](https://telegram.org) if needed)
2. Search for the user `@BotFather` and open the chat
3. Send the message: `/newbot`
4. BotFather will ask for a name. Type something like: `DailyPaperBot`
5. BotFather will ask for a username. Type something like: `DailyPaper_doug_bot`
   - (Must be unique; can include your name)
6. BotFather will respond with your bot's token (starts with `123456789:ABCdef...`)
7. **Copy this token** and save it securely

You'll see something like:

```
Done! Congratulations on your new bot. You'll find it at
t.me/DailyPaper_doug_bot.

Use this token to access the HTTP API:
123456789:ABCdefGHIJKLmnopQRSTuvWXYZabc

For a description of the Bot API, see this page:
https://core.telegram.org/bots/api
```

### 2b. Get Your Telegram Chat ID
1. Still in Telegram, search for and open the user `@userinfobot`
2. Send any message (e.g., "hi")
3. The bot will reply with your user ID (a long number)
4. **Copy this number** and save it

You'll see something like:

```
User ID: 987654321
Is bot: No
First name: Doug
Last name: Guttenberg
...
```

### 2c. Verify Your Bot Works
1. Open Telegram
2. Search for `@DailyPaper_doug_bot` (or whatever username you created)
3. Open the chat with your bot
4. Send any message

You should see a reply saying the bot is offline (that's fine, we'll activate it).

## Step 3: Create a Gmail Account and App Password

Gmail is how Daily Paper will send you formatted daily newspapers by email.

### 3a. Create Gmail Account (or use existing)
If you already have a Gmail account, skip to 3b. Otherwise:

1. Go to [accounts.google.com/signup](https://accounts.google.com/signup)
2. Follow the steps to create a new account
3. You can use any email format (e.g., `doug.paper.news@gmail.com`)

### 3b. Enable 2-Factor Authentication
This is required to create an app password.

1. Log in to your Gmail account
2. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
3. On the left, click "Security"
4. Under "Signing in to Google," find "2-Step Verification"
5. Click "2-Step Verification"
6. Follow the steps (you'll use your phone)
7. Once complete, return to the Security page

### 3c. Create an App Password
1. Still in [myaccount.google.com/security](https://myaccount.google.com/security)
2. Under "Signing in to Google," find "App passwords"
   - (It should appear after you enable 2-Step Verification)
3. Select:
   - App: "Mail"
   - Device: "Windows Computer" (or just pick any)
4. Click "Generate"
5. Google will show a 16-character password (no spaces)
6. **Copy this password** exactly and save it

You'll see something like:

```
Your app password for Mail (Windows Computer):

abcd efgh ijkl mnop

[Copy]
```

Save it without spaces: `abcdefghijklmnop`

### 3d. Test Your Email Works
1. Go to [mail.google.com](https://mail.google.com)
2. Try logging out and back in to verify your password works

## Step 4: Clone and Run Setup

### 4a. Clone the Repository
```bash
git clone <repository-url> daily-paper
cd daily-paper
```

Replace `<repository-url>` with the actual URL (you'll have been given this).

### 4b. Run Setup Script
```bash
./setup.sh
```

The script will ask for:
1. **Anthropic API Key** - paste the key from Step 1b (starts with `sk-ant-`)
2. **Telegram Bot Token** - paste from Step 2a (format: `123456789:ABC...`)
3. **Telegram Chat ID** - paste from Step 2b (just a number)
4. **Gmail Address** - the full Gmail address you're using (e.g., `doug.paper.news@gmail.com`)
5. **Gmail App Password** - paste from Step 3c (16 characters, no spaces)
6. **Delivery Time** - when you want your paper (default: `6:00 AM`)

The script creates a `.env` file with these securely stored and installs dependencies.

When it finishes, you'll see:

```
✓ Setup complete!
✓ Environment configured
✓ Dependencies installed
✓ Cron job scheduled for 6:00 AM

Your first Daily Paper will arrive tomorrow morning.
Check logs with: npm run logs
```

### 4c. Install Dependencies (if not done by setup.sh)
```bash
npm install
```

## Step 5: Verify Everything Works

### 5a. Check Configuration
```bash
npm run status
```

You should see something like:

```
Daily Paper Status:
✓ Telegram bot configured
✓ Gmail configured
✓ Anthropic API key valid
✓ Next delivery: Tomorrow at 6:00 AM
✓ Daemon: Running

Last delivery: Never (this is the first run)
```

### 5b. Test with a Manual Run
Generate and send your first paper immediately to test:

```bash
npm run manual
```

This will:
1. Fetch the latest stories from 32+ RSS feeds
2. Use Claude to intelligently curate them
3. Format as an email and Telegram message
4. Send both to you

Watch your Telegram and email for the first Daily Paper to arrive!

### 5c. Check the Logs
If anything went wrong, view the logs:

```bash
npm run logs
```

You'll see detailed output of each step.

## Step 6: Verify Automatic Delivery

If the manual test worked, you're done! Daily Paper will automatically run tomorrow morning at 6 AM.

To verify it's scheduled:
```bash
npm run status
```

Should show:
```
Daemon: Running
Next delivery: Tomorrow at 6:00 AM
```

## What to Expect

### Your First Paper
When Daily Paper runs, you'll receive:

**Telegram Message:**
```
Daily Paper - Friday, February 21

🔴 POWER

Tech Giants Brace for AI Regulation Wave
- Investment bank predicts stricter enforcement
  by Q2 2026. Affects: NVDA, META, MSFT
[link]

Meta's New Safety Framework
- Expanded content moderation policies
  announcement today
[link]

🟢 INSIGHT

How AI is Changing Advertising
- Inside look at creative shops adopting
  AI tools. Affects: WPP, Publicis
[link]

...and 12 more stories tailored to you
```

**Email Message:**
HTML-formatted version with full story excerpts, publication times, and source credits.

### Daily Usage
Every morning at 6 AM, you'll get your curated paper. React with emoji to give feedback (✅ = great, ❌ = not interested).

## Common Setup Issues

### "Command not found: git"
- Install Git: `brew install git` (macOS) or `apt-get install git` (Linux)

### "Command not found: node"
- Install Node.js from [nodejs.org](https://nodejs.org)
- Verify: `node --version` should show v16 or higher

### "./setup.sh: permission denied"
```bash
chmod +x setup.sh
./setup.sh
```

### "API key invalid"
- Double-check you copied the full key (should start with `sk-ant-`)
- Make sure you don't have extra spaces
- Try generating a new key in the Anthropic console

### "Telegram token invalid"
- Go back to @BotFather and get your token again
- Paste the entire token without spaces

### "Gmail not working"
- Make sure you created an App Password, not your regular Gmail password
- Verify 2-Step Verification is enabled
- Check that you pasted the 16-character password without spaces

### "Setup script won't run"
```bash
bash setup.sh
```

Try with `bash` explicitly.

## Next Steps

1. **Customize sources** - [CUSTOMIZATION.md](CUSTOMIZATION.md) shows how to add/remove feeds
2. **Adjust delivery time** - Change when your paper arrives
3. **Tune AI weights** - Make the curation smarter for your interests
4. **Add feedback** - React to stories to train the system

## Support

For issues:

1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. View logs: `npm run logs`
3. Run manual test: `npm run manual`
4. Review the configuration: `cat .env`

Questions? See the [main README](../README.md).

---

Once setup is complete, Daily Paper will run automatically every morning. Enjoy your personalized newspaper!
