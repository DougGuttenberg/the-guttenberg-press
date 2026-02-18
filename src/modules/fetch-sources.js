import Parser from 'rss-parser';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkInbox, extractPaperContent } from '../lib/email-client.js';
import { createLogger } from '../lib/logger.js';
import { loadQueue, todayStr } from '../lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('fetch-sources');
const parser = new Parser();

/**
 * Load configuration files
 */
function loadConfig() {
  const sourcesPath = path.resolve(__dirname, '../../config/sources.json');
  const twitterPath = path.resolve(__dirname, '../../config/twitter-researchers.json');

  let rssFeeds = [];
  let espnTeams = [];
  let twitterResearchers = [];
  let twitterBridgeUrl = '';

  try {
    const sourcesData = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
    rssFeeds = sourcesData.rss_feeds || [];
    espnTeams = sourcesData.espn_teams || [];
    logger.info(`Loaded ${rssFeeds.length} RSS feeds and ${espnTeams.length} ESPN teams from config`);
  } catch (error) {
    logger.error(`Failed to load sources.json: ${error.message}`);
  }

  try {
    const twitterData = JSON.parse(fs.readFileSync(twitterPath, 'utf-8'));
    twitterResearchers = (twitterData.researchers || []).map(r => ({
      ...r,
      nitterBridge: twitterData.rss_bridge_base_url || 'https://nitter.net'
    }));
    twitterBridgeUrl = twitterData.rss_bridge_base_url || '';
    logger.info(`Loaded ${twitterResearchers.length} Twitter researchers from config`);
  } catch (error) {
    logger.error(`Failed to load twitter-researchers.json: ${error.message}`);
  }

  return { rssFeeds, espnTeams, twitterResearchers };
}

/**
 * Fetch articles from a single RSS feed
 */
async function fetchRssFeed(feedUrl, sourceName) {
  try {
    const feed = await parser.parseURL(feedUrl);
    const items = feed.items.slice(0, 10);

    const articles = items.map((item) => ({
      source: sourceName || feed.title || 'Unknown Source',
      title: item.title || 'Untitled',
      link: item.link || '',
      published: item.pubDate || new Date().toISOString(),
      content: item.content || item.contentSnippet || item.summary || '',
      retrieved_at: new Date().toISOString(),
      manual_send: false,
      doug_note: null,
      category: 'news',
    }));

    logger.info(`Fetched ${articles.length} articles from ${sourceName}`);
    return articles;
  } catch (error) {
    logger.warn(`Failed to fetch RSS feed "${sourceName}" (${feedUrl}): ${error.message}`);
    return [];
  }
}

/**
 * Fetch ESPN scores for configured teams
 */
async function fetchEspnScores(teamsConfig) {
  const scores = [];

  if (!teamsConfig || !Array.isArray(teamsConfig)) {
    logger.warn('No teams configuration provided for ESPN scores');
    return scores;
  }

  // Deduplicate API calls by sport (e.g., only fetch MLB scoreboard once)
  const sportsFetched = new Set();

  for (const team of teamsConfig) {
    try {
      const { name, sport } = team;
      // ESPN API uses sport name as both sport and league path segment
      const league = sport;

      if (!sport) {
        logger.warn(`Skipping team ${name}: missing sport`);
        continue;
      }

      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport === 'nfl' ? 'football' : sport === 'mlb' ? 'baseball' : sport === 'nba' ? 'basketball' : sport}/${league}/scoreboard`;
      const response = await axios.get(url, { timeout: 10000 });
      const events = response.data.events || [];

      for (const event of events) {
        const competitors = event.competitions[0]?.competitors || [];
        if (competitors.length < 2) continue;

        const homeTeam = competitors.find((c) => c.homeAway === 'home');
        const awayTeam = competitors.find((c) => c.homeAway === 'away');

        if (!homeTeam || !awayTeam) continue;

        const teamName = homeTeam.team?.name || homeTeam.team?.displayName || '';
        const opponentName = awayTeam.team?.name || awayTeam.team?.displayName || '';
        const teamScore = parseInt(homeTeam.score, 10) || 0;
        const opponentScore = parseInt(awayTeam.score, 10) || 0;

        if (
          teamName.toLowerCase().includes(name.toLowerCase()) ||
          teamName === name
        ) {
          scores.push({
            team: teamName,
            opponent: opponentName,
            team_score: teamScore,
            opponent_score: opponentScore,
            won: teamScore > opponentScore,
            sport,
            date: event.date || new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.warn(`Failed to fetch ESPN scores for ${team.name}: ${error.message}`);
    }
  }

  logger.info(`Fetched ${scores.length} ESPN scores`);
  return scores;
}

/**
 * Fetch Twitter researcher posts via Nitter RSS bridge
 */
async function fetchTwitterResearchers(researchers) {
  const articles = [];

  if (!researchers || !Array.isArray(researchers)) {
    logger.warn('No Twitter researchers configuration provided');
    return articles;
  }

  for (const researcher of researchers) {
    try {
      const { name, handle, nitterBridge } = researcher;

      if (!handle || !nitterBridge) {
        logger.warn(`Skipping researcher ${name}: missing handle or nitterBridge`);
        continue;
      }

      const feedUrl = `${nitterBridge}/search/rss?q=from:${handle}`;
      const feed = await parser.parseURL(feedUrl);
      const items = feed.items.slice(0, 10);

      const tweets = items.map((item) => ({
        source: `@${handle} (${name})`,
        title: item.title || 'Untitled Tweet',
        link: item.link || '',
        published: item.pubDate || new Date().toISOString(),
        content: item.content || item.contentSnippet || '',
        retrieved_at: new Date().toISOString(),
        manual_send: false,
        doug_note: null,
        category: 'twitter',
      }));

      articles.push(...tweets);
      logger.info(`Fetched ${tweets.length} tweets from @${handle}`);
    } catch (error) {
      logger.warn(
        `Failed to fetch Twitter researcher "${researcher.name}" (@${researcher.handle}): ${error.message}`
      );
    }
  }

  logger.info(`Fetched ${articles.length} total Twitter articles`);
  return articles;
}

/**
 * Fetch articles from Gmail inbox with "Send to Paper" tag
 */
async function fetchGmailInbox() {
  const articles = [];

  try {
    const emails = await checkInbox();

    if (!emails || !Array.isArray(emails)) {
      logger.warn('No emails returned from checkInbox()');
      return articles;
    }

    for (const email of emails) {
      try {
        const extracted = extractPaperContent(email);

        if (extracted) {
          articles.push({
            source: extracted.source || "Doug's Inbox",
            title: extracted.title || email.subject || 'Untitled Email',
            link: extracted.link || '',
            published: extracted.published || email.date || new Date().toISOString(),
            content: extracted.content || '',
            retrieved_at: new Date().toISOString(),
            manual_send: true,
            doug_note: extracted.doug_note || null,
            category: 'email',
          });
        }
      } catch (error) {
        logger.warn(`Failed to extract content from email: ${error.message}`);
      }
    }

    logger.info(`Fetched ${articles.length} articles from Gmail inbox`);
  } catch (error) {
    logger.error(`Failed to fetch Gmail inbox: ${error.message}`);
  }

  return articles;
}

/**
 * Load "Send to Paper" queue items from storage
 */
function loadQueueItems() {
  const articles = [];

  try {
    const queue = loadQueue(todayStr());

    if (!queue || !Array.isArray(queue)) {
      logger.info('No queue items found for today');
      return articles;
    }

    for (const item of queue) {
      articles.push({
        source: item.source || 'Queue Item',
        title: item.title || 'Untitled',
        link: item.link || '',
        published: item.published || new Date().toISOString(),
        content: item.content || '',
        retrieved_at: new Date().toISOString(),
        manual_send: true,
        doug_note: item.doug_note || null,
        category: item.category || 'queue',
      });
    }

    logger.info(`Loaded ${articles.length} queue items for today`);
  } catch (error) {
    logger.warn(`Failed to load queue items: ${error.message}`);
  }

  return articles;
}

/**
 * Main function to fetch all sources
 */
export default async function fetchSources() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  let allArticles = [];
  let allScores = [];

  logger.info('Starting fetch-sources pipeline...');

  // Load configuration
  const { rssFeeds, espnTeams, twitterResearchers } = loadConfig();

  // Fetch RSS feeds
  if (rssFeeds && rssFeeds.length > 0) {
    logger.info(`Processing ${rssFeeds.length} RSS feeds...`);
    for (const feed of rssFeeds) {
      const articles = await fetchRssFeed(feed.url, feed.name);
      // Tag each article with its configured category
      articles.forEach(a => { a.category = feed.category || 'news'; });
      allArticles.push(...articles);
    }
  }

  // Fetch ESPN scores
  try {
    const scores = await fetchEspnScores(espnTeams);
    allScores.push(...scores);
  } catch (error) {
    logger.warn(`ESPN scores fetching failed: ${error.message}`);
  }

  // Fetch Twitter researchers
  try {
    const twitterArticles = await fetchTwitterResearchers(twitterResearchers);
    allArticles.push(...twitterArticles);
  } catch (error) {
    logger.warn(`Twitter researchers fetching failed: ${error.message}`);
  }

  // Fetch Gmail inbox
  try {
    const gmailArticles = await fetchGmailInbox();
    allArticles.push(...gmailArticles);
  } catch (error) {
    logger.warn(`Gmail inbox fetching failed: ${error.message}`);
  }

  // Load queue items
  try {
    const queueArticles = loadQueueItems();
    allArticles.push(...queueArticles);
  } catch (error) {
    logger.warn(`Queue items loading failed: ${error.message}`);
  }

  const duration = Date.now() - startTime;

  const result = {
    articles: allArticles,
    scores: allScores,
    count: allArticles.length + allScores.length,
    timestamp,
  };

  logger.info(
    `Fetch-sources pipeline completed in ${duration}ms. Fetched ${allArticles.length} articles and ${allScores.length} scores.`
  );

  return result;
}
