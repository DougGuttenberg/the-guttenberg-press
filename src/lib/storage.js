import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');

// Ensure all data directories exist
const dirs = ['papers', 'feedback', 'queue', 'logs'];
for (const d of dirs) {
  const dir = join(DATA_DIR, d);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get today's date string in YYYY-MM-DD format.
 */
export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get tomorrow's date string.
 */
export function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/**
 * Get yesterday's date string.
 */
export function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ─── Paper Storage ───

export function savePaper(dateStr, paper) {
  const file = join(DATA_DIR, 'papers', `${dateStr}.json`);
  writeFileSync(file, JSON.stringify(paper, null, 2));
}

export function loadPaper(dateStr) {
  const file = join(DATA_DIR, 'papers', `${dateStr}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function loadTodaysPaper() {
  return loadPaper(todayStr());
}

// ─── Pipeline Intermediate Data ───

export function savePipelineStep(dateStr, stepName, data) {
  const dir = join(DATA_DIR, 'papers', dateStr);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${stepName}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export function loadPipelineStep(dateStr, stepName) {
  const file = join(DATA_DIR, 'papers', dateStr, `${stepName}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8'));
}

// ─── Feedback Storage ───

export function saveFeedback(dateStr, feedback) {
  const file = join(DATA_DIR, 'feedback', `${dateStr}.json`);
  let existing = [];
  if (existsSync(file)) {
    existing = JSON.parse(readFileSync(file, 'utf-8'));
  }
  existing.push(feedback);
  writeFileSync(file, JSON.stringify(existing, null, 2));
}

export function loadFeedback(dateStr) {
  const file = join(DATA_DIR, 'feedback', `${dateStr}.json`);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function loadFeedbackRange(startDate, endDate) {
  const feedback = [];
  const dir = join(DATA_DIR, 'feedback');
  if (!existsSync(dir)) return feedback;

  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  for (const file of files) {
    const dateStr = file.replace('.json', '');
    if (dateStr >= startDate && dateStr <= endDate) {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
      feedback.push(...data);
    }
  }
  return feedback;
}

// ─── Queue Storage (for "Send to Paper" items) ───

export function addToQueue(dateStr, item) {
  const file = join(DATA_DIR, 'queue', `${dateStr}.json`);
  let existing = [];
  if (existsSync(file)) {
    existing = JSON.parse(readFileSync(file, 'utf-8'));
  }
  existing.push(item);
  writeFileSync(file, JSON.stringify(existing, null, 2));
}

export function loadQueue(dateStr) {
  const file = join(DATA_DIR, 'queue', `${dateStr}.json`);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function clearQueue(dateStr) {
  const file = join(DATA_DIR, 'queue', `${dateStr}.json`);
  if (existsSync(file)) {
    writeFileSync(file, '[]');
  }
}

// ─── Judgment Model Weights ───

export function loadWeights() {
  const file = join(PROJECT_ROOT, 'config', 'judgment-model.json');
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function saveWeights(weights) {
  const file = join(PROJECT_ROOT, 'config', 'judgment-model.json');
  weights.last_updated = new Date().toISOString();
  weights.version = (weights.version || 0) + 1;
  writeFileSync(file, JSON.stringify(weights, null, 2));
}

// ─── Message ID Tracking (for feedback matching) ───

export function saveMessageMap(dateStr, map) {
  const file = join(DATA_DIR, 'papers', `${dateStr}-messages.json`);
  writeFileSync(file, JSON.stringify(map, null, 2));
}

export function loadMessageMap(dateStr) {
  const file = join(DATA_DIR, 'papers', `${dateStr}-messages.json`);
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export default {
  todayStr, tomorrowStr, yesterdayStr,
  savePaper, loadPaper, loadTodaysPaper,
  savePipelineStep, loadPipelineStep,
  saveFeedback, loadFeedback, loadFeedbackRange,
  addToQueue, loadQueue, clearQueue,
  loadWeights, saveWeights,
  saveMessageMap, loadMessageMap
};
