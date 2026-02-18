import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');

const envFile = path.join(projectDir, '.env');
const papersDir = path.join(projectDir, 'data', 'papers');
const feedbackDir = path.join(projectDir, 'data', 'feedback');
const sourcesFile = path.join(projectDir, 'config', 'sources.json');

function maskValue(value) {
  if (!value) return '(not set)';
  if (value.length <= 4) return '*'.repeat(value.length);
  return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
}

function checkEnv() {
  console.log('Environment Configuration:');
  const requiredKeys = [
    'ANTHROPIC_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'OPENWEATHER_API_KEY',
  ];

  if (!fs.existsSync(envFile)) {
    console.log('  .env file: NOT FOUND');
    return;
  }

  console.log('  .env file: FOUND');
  const envContent = fs.readFileSync(envFile, 'utf-8');
  const envVars = {};

  envContent.split('\n').forEach((line) => {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim();
    }
  });

  requiredKeys.forEach((key) => {
    const status = key in envVars ? '✓' : '✗';
    const value = envVars[key] ? maskValue(envVars[key]) : '(not set)';
    console.log(`    ${status} ${key}: ${value}`);
  });
}

function checkLaunchd() {
  console.log('\nLaunchd Jobs:');
  const jobs = [
    'com.dailypaper.nightly',
    'com.dailypaper.delivery',
    'com.dailypaper.monitor',
  ];

  try {
    const output = execSync('launchctl list', { encoding: 'utf-8' });
    jobs.forEach((job) => {
      const isLoaded = output.includes(job);
      const status = isLoaded ? '✓' : '✗';
      console.log(`  ${status} ${job}`);
    });
  } catch (error) {
    console.log('  ✗ Unable to check launchctl status');
  }
}

function checkLastPaperRun() {
  console.log('\nLast Pipeline Run:');
  if (!fs.existsSync(papersDir)) {
    console.log('  ✗ No papers directory yet');
    return;
  }

  try {
    const files = fs.readdirSync(papersDir);
    if (files.length === 0) {
      console.log('  ✗ No papers generated yet');
      return;
    }

    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    if (jsonFiles.length === 0) {
      console.log('  ✗ No JSON papers found');
      return;
    }

    jsonFiles.sort();
    const latestFile = jsonFiles[jsonFiles.length - 1];
    const filePath = path.join(papersDir, latestFile);
    const stat = fs.statSync(filePath);
    console.log(`  ✓ ${latestFile}`);
    console.log(`    Created: ${stat.birthtime.toLocaleString()}`);
  } catch (error) {
    console.log(`  ✗ Error checking papers: ${error.message}`);
  }
}

function checkLastFeedback() {
  console.log('\nLast Feedback:');
  if (!fs.existsSync(feedbackDir)) {
    console.log('  ✗ No feedback directory yet');
    return;
  }

  try {
    const files = fs.readdirSync(feedbackDir);
    if (files.length === 0) {
      console.log('  ✗ No feedback received yet');
      return;
    }

    files.sort();
    const latestFile = files[files.length - 1];
    const filePath = path.join(feedbackDir, latestFile);
    const stat = fs.statSync(filePath);
    console.log(`  ✓ ${latestFile}`);
    console.log(`    Created: ${stat.birthtime.toLocaleString()}`);
  } catch (error) {
    console.log(`  ✗ Error checking feedback: ${error.message}`);
  }
}

function checkFeeds() {
  console.log('\nNews Feeds:');
  if (!fs.existsSync(sourcesFile)) {
    console.log('  ✗ config/sources.json not found');
    return;
  }

  try {
    const sourcesContent = fs.readFileSync(sourcesFile, 'utf-8');
    const sources = JSON.parse(sourcesContent);
    const feedCount = sources.feeds ? sources.feeds.length : 0;
    console.log(`  ✓ ${feedCount} feeds configured`);

    if (sources.feeds && sources.feeds.length > 0) {
      sources.feeds.slice(0, 5).forEach((feed) => {
        console.log(`    - ${feed.name || feed.url}`);
      });
      if (sources.feeds.length > 5) {
        console.log(`    ... and ${sources.feeds.length - 5} more`);
      }
    }
  } catch (error) {
    console.log(`  ✗ Error reading sources.json: ${error.message}`);
  }
}

console.log('╔════════════════════════════════════════════════╗');
console.log('║         Daily Paper - System Status            ║');
console.log('╚════════════════════════════════════════════════╝\n');

checkEnv();
checkLaunchd();
checkLastPaperRun();
checkLastFeedback();
checkFeeds();

console.log('\n');
