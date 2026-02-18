# Daily Paper Customization Guide

Make Daily Paper work perfectly for you by customizing sources, weights, and schedules.

## Quick Start

Most customization is done by editing JSON config files in `config/`. Changes take effect after restart:

```bash
npm stop
npm start
```

To test changes without restarting the daemon:

```bash
npm run manual
```

---

## Adding and Removing RSS Sources

Your news sources are defined in `config/sources.json`.

### View current sources
```bash
cat config/sources.json | head -30
```

### Edit sources
```bash
nano config/sources.json
```

### Format
Each source has:
- `name`: Display name (for your reference)
- `url`: RSS feed URL
- `category`: Where it appears (power, insight, culture, longread, analysis)
- `weight`: How much to favor it (0.0 to 1.0)
- `enabled`: true/false to turn on/off

```json
{
  "sources": [
    {
      "name": "TechCrunch",
      "url": "https://techcrunch.com/feed/",
      "category": "power",
      "weight": 1.0,
      "enabled": true
    },
    {
      "name": "The Verge",
      "url": "https://www.theverge.com/rss/index.xml",
      "category": "power",
      "weight": 0.8,
      "enabled": true
    }
  ]
}
```

### Adding a source

1. Find the RSS feed URL. Most publications have it:
   - Go to the publication's website
   - Look for "RSS" link (usually at the bottom or in the menu)
   - Copy the URL

2. Add to `config/sources.json`:
   ```json
   {
     "name": "Publication Name",
     "url": "https://example.com/feed.xml",
     "category": "power",
     "weight": 1.0,
     "enabled": true
   }
   ```

3. Restart:
   ```bash
   npm stop && npm start
   ```

### Removing a source

Either delete the object or set `enabled: false`:

```json
{
  "name": "Source You Dont Want",
  "enabled": false
}
```

### Weight explanation

Weight (0.0 to 1.0) controls how much Daily Paper prioritizes stories from that source:

- `1.0`: Full priority (highly favor stories from this source)
- `0.8`: High priority
- `0.5`: Normal priority
- `0.3`: Low priority (stories from this source are less likely to appear)
- `0.0`: Never use (even if enabled, stories get lower scores)

### Categories

Stories appear in different sections based on category:

- **power**: High-impact, breaking news, market-moving (headlines, tech, business)
- **insight**: Analysis, deeper dives, research (essays, reports, commentary)
- **culture**: Arts, media, entertainment, society
- **longread**: Long-form journalism (takes 5+ minutes to read)
- **analysis**: Expert analysis, investigations

Daily Paper limits stories per category. See "Section Limits" below.

### Suggested sources to add

**Tech:**
- https://feeds.arstechnica.com/arstechnica/index
- https://www.theregister.com/software/feed/
- https://www.wired.com/feed/rss
- https://www.slashdot.org/slashdot.rss

**Business/Markets:**
- https://feeds.bloomberg.com/markets/news.rss
- https://feeds.reuters.com/reuters/businessNews
- https://feeds.cnbc.com/cnbc/world
- https://feeds.bloomberg.com/wealth/news.rss

**Advertising/Marketing:**
- https://www.adweek.com/feed/
- https://feeds.reuters.com/reuters/companyNews?... (configure for specific companies)
- https://adage.com/feed

**Culture/Media:**
- https://feeds.nytimes.com/services/xml/rss/cnet/culture.xml
- https://www.theguardian.com/culture/rss
- https://feeds.npr.org/1021/rss.xml

**Analysis:**
- https://feeds.bloomberg.com/markets/tools/newsletter.rss
- https://www.economist.com/the-world/rss.xml

---

## Adjusting AI Judgment Weights

The AI judges stories on five dimensions. Control how much each matters in `config/judgment-model.json`.

### View current weights
```bash
cat config/judgment-model.json
```

### Edit weights
```bash
nano config/judgment-model.json
```

### The five dimensions

```json
{
  "weights": {
    "freshness": 0.15,
    "relevance": 0.35,
    "importance": 0.25,
    "impact": 0.15,
    "quality": 0.10
  }
}
```

**freshness** (0.0 to 1.0)
- How recently the story was published
- `0.15` (default): Balanced. Prefers recent news but isn't obsessed with breaking
- Higher (0.25+): Break news alerts. Get stories within hours of publication
- Lower (0.05): Okay with older analysis and roundups if they're good

**relevance** (0.0 to 1.0)
- How well the story matches your interests
- `0.35` (default): High importance. AI learns what you care about
- Higher (0.45+): Highly personalized. Only stories that match your profile
- Lower (0.20): See everything. Less personalized, more diverse

**importance** (0.0 to 1.0)
- Prominence and reach. Is this in major news outlets?
- `0.25` (default): Balanced. Mix of major and niche stories
- Higher (0.35+): Focus on only major news from big publishers
- Lower (0.15): More local and niche stories

**impact** (0.0 to 1.0)
- Business and societal impact. Does this affect people or markets?
- `0.15` (default): Balanced. Some impact-focused, some lighter reads
- Higher (0.25+): Only consequential stories. What moves markets/society
- Lower (0.05): More entertainment and cultural stories

**quality** (0.0 to 1.0)
- Writing quality and source credibility
- `0.10` (default): Don't obsess over it. Prioritize substance over style
- Higher (0.20+): Only well-written, credible sources
- Lower (0.05): Accept lower-quality writing if substance is there

### Example profiles

**Breaking News Hunter:**
```json
{
  "weights": {
    "freshness": 0.40,
    "relevance": 0.20,
    "importance": 0.20,
    "impact": 0.15,
    "quality": 0.05
  }
}
```

**Personalized Reader:**
```json
{
  "weights": {
    "freshness": 0.10,
    "relevance": 0.50,
    "importance": 0.15,
    "impact": 0.15,
    "quality": 0.10
  }
}
```

**Quality-Focused:**
```json
{
  "weights": {
    "freshness": 0.10,
    "relevance": 0.30,
    "importance": 0.20,
    "impact": 0.15,
    "quality": 0.25
  }
}
```

**Impact-Focused (Market Mover):**
```json
{
  "weights": {
    "freshness": 0.20,
    "relevance": 0.25,
    "importance": 0.15,
    "impact": 0.35,
    "quality": 0.05
  }
}
```

**Important:** Weights must sum to 1.0 (100%). If you change one, adjust others to stay balanced.

### Judgment threshold

```json
{
  "judgment_threshold": 0.5
}
```

Stories must score above this to appear (0.0 to 1.0).

- `0.5` (default): Gets 12-15 stories/day
- `0.4`: Gets 15-20 stories/day (less selective)
- `0.6`: Gets 8-12 stories/day (more selective)

### Max stories per day

```json
{
  "max_stories_per_day": 15
}
```

Upper limit on stories included. Even if many score high, only this many appear.

- Default: 15
- If you want fewer: lower to 12
- If you want more: raise to 20

### Surprise quota

```json
{
  "surprise_quota": 0.10
}
```

The AI picks 10% of stories randomly (0.0 to 1.0) to surprise you with interests outside your main profile.

- `0.10` (default): ~1 surprise story per paper
- `0.20`: ~2-3 surprises
- `0.05`: Rarely surprised
- `0.0`: No surprises, pure personalization

---

## Changing Delivery Time

When does your paper arrive each morning?

### macOS

Edit the launch agent:
```bash
nano ~/.launchd-daily-paper.plist
```

Find this section:
```xml
<key>StartCalendarInterval</key>
<dict>
  <key>Hour</key>
  <integer>6</integer>
  <key>Minute</key>
  <integer>0</integer>
</dict>
```

Change `<integer>6</integer>` to your desired hour (0-23):
- `6` = 6:00 AM
- `7` = 7:00 AM
- `8` = 8:00 AM
- `19` = 7:00 PM

Change `<integer>0</integer>` for minutes (usually 0).

Reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.guttenberg.dailypaper.plist
launchctl load ~/Library/LaunchAgents/com.guttenberg.dailypaper.plist
```

### Linux

Edit your crontab:
```bash
crontab -e
```

Find the daily-paper line. The first two numbers are minute and hour:

```
0 6 * * * /path/to/daily-paper/npm run manual
```

Change `0 6` to your desired time:
- `0 6` = 6:00 AM
- `0 7` = 7:00 AM
- `0 8` = 8:00 AM
- `30 6` = 6:30 AM
- `0 19` = 7:00 PM

Save and exit (Ctrl+X, Y, Enter if using nano).

### Verify change
```bash
npm run status
```

Should show new delivery time.

---

## Adding Twitter Researchers

Monitor specific Twitter accounts for stories to include in Daily Paper.

### View current researchers
```bash
cat config/twitter-researchers.json
```

### Edit researchers
```bash
nano config/twitter-researchers.json
```

### Format
```json
{
  "researchers": [
    {
      "handle": "@andrejbauer",
      "name": "Andrej Bauer",
      "category": "analysis",
      "weight": 0.9,
      "enabled": true
    }
  ]
}
```

### Add a researcher

1. Get their Twitter handle (e.g., `@andrejbauer`)
2. Add to the config:
   ```json
   {
     "handle": "@their_handle",
     "name": "Their Name",
     "category": "insight",
     "weight": 0.8,
     "enabled": true
   }
   ```

3. Restart:
   ```bash
   npm stop && npm start
   ```

### Weight

0.0 to 1.0. How much to favor tweets from this person:
- `1.0`: High priority
- `0.5`: Normal
- `0.3`: Lower priority

### Category

Where their tweets appear:
- `power`: Breaking news from this person
- `insight`: Their analysis and thoughts
- `analysis`: Long-form Twitter threads
- `culture`: Culture/society commentary

### Disable a researcher

```json
{
  "handle": "@their_handle",
  "enabled": false
}
```

---

## Section Limits

Control how many stories appear in each section.

Edit `config/sources.json`:

```json
{
  "section_limits": {
    "power": 6,
    "insight": 3,
    "culture": 2,
    "longread": 1,
    "analysis": 2
  }
}
```

This ensures balanced coverage. Adjust if you want more/fewer of certain types.

---

## Interest Keywords

Make the AI better understand what you care about.

Edit `config/judgment-model.json`:

```json
{
  "keywords": {
    "positive": [
      "advertising",
      "marketing",
      "artificial intelligence",
      "ai",
      "creative technology",
      "data science",
      "consumer behavior"
    ],
    "negative": [
      "politics",
      "celebrity gossip",
      "sports",
      "cryptocurrency"
    ],
    "boost": {
      "nvidia": 1.5,
      "openai": 1.4,
      "meta": 1.2
    }
  }
}
```

**positive keywords:**
Stories mentioning these get higher scores. Add things you care about.

**negative keywords:**
Stories mentioning these get lower scores. Add topics to avoid.

**boost:**
Companies/entities to strongly favor. Value is a multiplier:
- `1.5` = boost score by 50%
- `1.0` = neutral
- `0.5` = reduce by 50%

### Examples

For an advertising executive:
```json
{
  "positive": [
    "advertising", "marketing", "campaigns", "creative",
    "brand", "consumer", "ad tech", "media buying",
    "audience", "engagement", "wpp", "publicis", "omnicom"
  ],
  "negative": [
    "politics", "sports", "celebrity"
  ],
  "boost": {
    "meta": 1.3,
    "google": 1.2,
    "amazon": 1.1
  }
}
```

For a tech investor:
```json
{
  "positive": [
    "ai", "artificial intelligence", "startup",
    "venture capital", "ipo", "innovation",
    "technology", "software", "saas"
  ],
  "negative": [
    "sports", "entertainment"
  ],
  "boost": {
    "openai": 1.5,
    "anthropic": 1.5,
    "nvidia": 1.3
  }
}
```

---

## Advanced: Modifying Claude Prompts

The AI uses specific prompts to judge stories. For advanced customization, you can edit these.

**WARNING:** Changing prompts changes how the system works. Test carefully with `npm run manual` before relying on changes.

### Find prompts

Prompts are in `src/judge.js`:

```bash
grep -n "prompt" src/judge.js
```

Look for the Claude prompt that grades stories.

### Example: Make AI stricter

Find the judgment prompt (looks like):

```javascript
const prompt = `You are a news curator. Grade this story on five dimensions...`;
```

Add strictness:

```javascript
const prompt = `You are a demanding news curator with high standards.
Grade this story on five dimensions. Only award high scores to exceptional stories...`;
```

### Example: Add custom instruction

```javascript
const prompt = `You are a news curator for advertising executives.
Focus on stories about: brands, marketing, media, consumer behavior, and ad tech.
Grade this story on five dimensions...`;
```

### Restart after changes
```bash
npm stop && npm start
npm run manual
```

Test the output in your first paper.

---

## Advanced: Custom Feed Preprocessing

If a feed has too much noise, you can preprocess it before it reaches the judgment engine.

Edit `src/parse.js` to add custom filters:

```javascript
// Add before judgment
if (story.title.includes('celebrity')) {
  story.relevance_hint = 'low';
}

if (story.description.includes('earnings report')) {
  story.importance_hint = 'high';
}
```

This signals the AI about certain stories before evaluation.

---

## Testing Your Customizations

After changing config:

1. **Quick test:**
   ```bash
   npm run manual
   ```
   Generates and sends a paper immediately. Check Telegram/email.

2. **Preview without sending:**
   ```bash
   npm run format
   ```
   Shows what the paper would look like, but doesn't send.

3. **Check what stories were judged:**
   ```bash
   cat cache/judged.json | jq '.stories[] | {title, score}' | head -20
   ```
   View the top stories and their scores.

4. **Adjust and re-test:**
   Edit config, then run `npm run manual` again.

---

## Performance Tips

Customizations that affect speed:

**Faster (fewer API calls):**
- Fewer RSS sources
- Higher judgment threshold (fewer stories to evaluate)
- Remove Twitter researchers (they take API calls)

**Slower (more API calls):**
- More RSS sources
- Lower judgment threshold
- Complex interest keywords

Daily Paper is designed to run once per day. Speed matters less than quality.

---

## Reverting to Defaults

If customizations went wrong:

1. **Restore from git:**
   ```bash
   git checkout config/
   ```

2. **Or manually reset:**
   ```bash
   cp config/sources.json.backup config/sources.json
   cp config/judgment-model.json.backup config/judgment-model.json
   ```

3. **Restart:**
   ```bash
   npm stop && npm start
   ```

---

## Questions?

- **How to test changes?** → `npm run manual`
- **How to see effects?** → Check Telegram/email, or `cat cache/judged.json`
- **How to revert?** → `git checkout config/`
- **How to get help?** → Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

Have fun customizing! Daily Paper becomes better the more you tune it to your interests.
