# Daily Paper

A personalized daily newspaper curated by AI from 32+ sources and delivered fresh every morning.

## What It Does

Daily Paper is an automated news curation system that:

- **Aggregates** from 32+ RSS sources across business, technology, culture, and politics
- **Intelligently curates** using Claude AI to identify the most relevant stories for you
- **Delivers daily** to Telegram and email every morning at 6 AM (configurable)
- **Learns your interests** through feedback and story engagement patterns
- **Maintains quality** by filtering out duplicates, outdated content, and clickbait
- **Surprises you** with curated stories outside your usual preferences (configurable)

Think of it as a personal journalist who reads thousands of headlines and delivers only the stories that matter to you.

## Quick Start

### 1. Clone and Install
```bash
git clone <repo-url> daily-paper
cd daily-paper
npm install
```

### 2. Run Setup
```bash
./setup.sh
```
This guides you through creating API keys for Anthropic, Telegram, and Gmail. Takes about 5 minutes.

### 3. Wait for First Paper
Your first issue will arrive tomorrow morning at 6 AM via Telegram and email.

## How It Works

```
RSS Feeds (32+ sources)
    ↓
[Fetch & Parse]
    ↓
[Duplicate Detection]
    ↓
Raw Candidate Stories (100-200 per day)
    ↓
[Claude AI Judgment]
    (weighted scoring: freshness, relevance, importance, impact, quality)
    ↓
Curated Stories (12-15 per day)
    ↓
[Email & Telegram Formatting]
    ↓
Daily Paper → Your Inbox (6 AM)
```

Each story gets a judgment score based on five weighted dimensions:
- **Freshness** (recent is better)
- **Relevance** (matches your interests)
- **Importance** (signals prominence)
- **Impact** (affects people and markets)
- **Quality** (writing quality and source credibility)

## Daily Usage

### Receiving Your Paper
Every morning at 6 AM, you'll get:
- **Telegram**: A formatted message with headlines and links
- **Email**: A formatted HTML email with full story context

### Giving Feedback
Reply to stories in Telegram with:
- ✅ Reaction for "loved this"
- ❌ Reaction for "not interested"

This trains the AI to better understand your preferences.

### Send to Paper
Found a great story outside your feeds? Forward it to the system:
- **Email**: Forward any newsletter/article to the system email with subject "Add to Paper"
- **Telegram**: Forward a message with caption "Add to Paper"

The system will evaluate it and include it in the next curation cycle.

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm start` | Start the daemon (runs daily at 6 AM) |
| `npm run manual` | Generate and deliver today's paper immediately |
| `npm run status` | Check daemon status and last delivery time |
| `npm run logs` | View recent pipeline logs |
| `npm run fetch` | Manually fetch all RSS feeds |
| `npm run judge` | Run judgment scoring on cached stories |
| `npm run format` | Format and preview today's paper (no send) |
| `npm run feedback` | Process any pending Telegram feedback |
| `npm stop` | Stop the daemon |
| `npm run clean` | Clear cache and logs (careful!) |

## Cost Estimate

Daily Paper uses the Claude API for AI curation. Monthly costs:

- **Base**: ~$270-280/month
  - ~1.2M input tokens/day (feeding Claude candidate stories)
  - ~50K output tokens/day (Claude's judgments)
  - At standard Claude API rates

**Factors that affect cost:**
- Number of RSS feeds (currently 32, easy to adjust)
- Number of candidate stories to judge (currently 150-200/day)
- Claude model used (currently Claude 3 Haiku for cost efficiency)

You can reduce costs by:
- Decreasing the number of feeds
- Pre-filtering stories before sending to Claude
- Using the lighter judgment model

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Daily Paper System                      │
└─────────────────────────────────────────────────────────────┘

┌─ Ingestion ──────────────┐
│ • RSS feed fetcher       │
│ • Newsletter parser      │
│ • Telegram forwarder     │
└──────────────────────────┘
           ↓
┌─ Processing ─────────────┐
│ • Deduplication          │
│ • Quality filter         │
│ • Metadata extraction    │
└──────────────────────────┘
           ↓
┌─ AI Curation ────────────┐
│ • Claude judgment model  │
│ • Weighted scoring       │
│ • Relevance ranking      │
└──────────────────────────┘
           ↓
┌─ Formatting ─────────────┐
│ • Email generator        │
│ • Telegram formatter     │
│ • Link processor         │
└──────────────────────────┘
           ↓
┌─ Delivery ───────────────┐
│ • Telegram Bot API       │
│ • Gmail SMTP             │
│ • Feedback collection    │
└──────────────────────────┘
```

## File Structure

```
daily-paper/
├── README.md
├── LICENSE
├── package.json
├── setup.sh
├── .env (created by setup)
├── config/
│   ├── sources.json          # RSS feed URLs and weights
│   ├── judgment-model.json   # AI scoring weights
│   ├── twitter-researchers.json  # Twitter accounts to monitor
│   └── delivery-schedule.json
├── src/
│   ├── fetch.js             # RSS fetcher
│   ├── parse.js             # Story parser
│   ├── dedup.js             # Deduplication
│   ├── judge.js             # Claude AI judgment
│   ├── format-email.js      # Email formatter
│   ├── format-telegram.js   # Telegram formatter
│   ├── send-telegram.js     # Telegram delivery
│   ├── send-email.js        # Email delivery
│   ├── feedback.js          # Feedback processor
│   └── pipeline.js          # Main orchestration
├── logs/
│   └── daily-paper.log      # Detailed logs
├── cache/
│   ├── stories.json         # Today's candidates
│   ├── judged.json          # Judged stories
│   └── sent.json            # Delivered stories
└── docs/
    ├── SETUP.md
    ├── TROUBLESHOOTING.md
    └── CUSTOMIZATION.md
```

## System Requirements

- macOS 11+ or Linux
- Node.js 16+
- Internet connection
- Accounts: Anthropic (free trial available), Telegram, Gmail

## Next Steps

1. **[Read SETUP.md](docs/SETUP.md)** for detailed setup instructions
2. **[Read CUSTOMIZATION.md](docs/CUSTOMIZATION.md)** to adjust sources and weights
3. **[Read TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** if you hit any issues

## Support

For issues, check the logs:
```bash
npm run logs
```

For common problems, see [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

Made with care by Doug Guttenberg, 2026.
