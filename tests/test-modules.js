import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test counters
let passCount = 0;
let failCount = 0;
const tests = [];

function logTest(name, passed, message = '') {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${name}${message ? ' - ' + message : ''}`);
  tests.push({ name, passed, message });
  if (passed) {
    passCount++;
  } else {
    failCount++;
  }
}

// Test 1: Check all module files exist
console.log('\n=== MODULE EXISTENCE TESTS ===\n');

const modulePaths = {
  normalize: '../src/normalize.js',
  cluster: '../src/cluster.js',
  score: '../src/score.js',
  rankStories: '../src/rank-stories.js',
  formatPaper: '../src/format-paper.js',
  storage: '../src/storage.js',
  config: '../config.json'
};

for (const [name, relPath] of Object.entries(modulePaths)) {
  const fullPath = path.resolve(__dirname, relPath);
  const exists = fs.existsSync(fullPath);
  logTest(`Module file exists: ${name}`, exists, exists ? '' : `Path: ${fullPath}`);
}

// Test 2: Check that modules export default functions (where applicable)
console.log('\n=== MODULE IMPORT TESTS ===\n');

const moduleFiles = {
  normalize: '../src/normalize.js',
  cluster: '../src/cluster.js',
  score: '../src/score.js',
  rankStories: '../src/rank-stories.js',
  formatPaper: '../src/format-paper.js',
  storage: '../src/storage.js'
};

for (const [name, relPath] of Object.entries(moduleFiles)) {
  try {
    const fullPath = path.resolve(__dirname, relPath);
    if (fs.existsSync(fullPath)) {
      const module = await import(fullPath);
      const hasDefault = typeof module.default === 'function';
      logTest(`Module exports default function: ${name}`, hasDefault);
    }
  } catch (error) {
    logTest(`Module imports without error: ${name}`, false, error.message);
  }
}

// Test 3: Check config file is valid JSON with expected fields
console.log('\n=== CONFIG VALIDATION TESTS ===\n');

try {
  const configPath = path.resolve(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    logTest('Config file parses as valid JSON', true);

    const expectedFields = ['paperName', 'publicationDate', 'sections', 'storage'];
    for (const field of expectedFields) {
      const hasField = field in config;
      logTest(`Config has field: ${field}`, hasField);
    }
  }
} catch (error) {
  logTest('Config file parses as valid JSON', false, error.message);
}

// Test 4: Storage module write/read cycle
console.log('\n=== STORAGE MODULE TESTS ===\n');

try {
  const storageModule = await import(path.resolve(__dirname, '../src/storage.js'));
  const storage = storageModule.default;

  const testDir = path.resolve(__dirname, './storage-test');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testData = {
    test: 'data',
    timestamp: new Date().toISOString(),
    array: [1, 2, 3],
    nested: { key: 'value' }
  };

  const testFile = path.join(testDir, 'test-output.json');

  // Test write
  storage.write(testFile, testData);
  const writeSuccess = fs.existsSync(testFile);
  logTest('Storage.write() creates file', writeSuccess);

  // Test read
  const readData = storage.read(testFile);
  const readSuccess = readData && readData.test === 'data' && readData.nested.key === 'value';
  logTest('Storage.read() retrieves correct data', readSuccess);

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
} catch (error) {
  logTest('Storage module write/read cycle', false, error.message);
}

// Test 5: Rank-stories module with sample data
console.log('\n=== RANK-STORIES MODULE TESTS ===\n');

try {
  const rankStoriesModule = await import(path.resolve(__dirname, '../src/rank-stories.js'));
  const rankStories = rankStoriesModule.default;

  // Load sample clusters
  const clustersPath = path.resolve(__dirname, './sample-data/sample-clusters.json');
  const clustersContent = fs.readFileSync(clustersPath, 'utf-8');
  const clusters = JSON.parse(clustersContent);

  logTest('Sample clusters data loads', Array.isArray(clusters) && clusters.length > 0);

  // Create scored cluster data (simulate scoring)
  const scoredClusters = clusters.map((cluster, idx) => ({
    ...cluster,
    score: Math.random() * 100,
    confidenceLevel: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
    manualBoost: cluster.manual_boost ? 15 : 0
  }));

  // Run ranking
  const ranked = rankStories(scoredClusters);

  logTest('Rank-stories returns output', ranked && typeof ranked === 'object');
  logTest('Rank-stories has sections property', ranked && Array.isArray(ranked.sections));
  logTest('Rank-stories sections are non-empty', ranked && ranked.sections.length > 0);

  // Verify section structure
  if (ranked && ranked.sections && ranked.sections.length > 0) {
    const firstSection = ranked.sections[0];
    const hasRequiredFields = firstSection.name && Array.isArray(firstSection.stories);
    logTest('Rank-stories section has required fields', hasRequiredFields);

    if (firstSection.stories && firstSection.stories.length > 0) {
      const firstStory = firstSection.stories[0];
      const hasScore = 'score' in firstStory;
      logTest('Rank-stories stories have scores', hasScore);
    }
  }

  // Verify confidence labels are set
  const allStories = ranked.sections.flatMap(s => s.stories);
  const hasConfidenceLabels = allStories.every(story => story.confidenceLabel);
  logTest('All stories have confidence labels assigned', hasConfidenceLabels);

} catch (error) {
  logTest('Rank-stories module execution', false, error.message);
}

// Test 6: Format-paper module with sample ranked data
console.log('\n=== FORMAT-PAPER MODULE TESTS ===\n');

try {
  const formatPaperModule = await import(path.resolve(__dirname, '../src/format-paper.js'));
  const formatPaper = formatPaperModule.default;

  // Load and rank sample clusters first
  const clustersPath = path.resolve(__dirname, './sample-data/sample-clusters.json');
  const clustersContent = fs.readFileSync(clustersPath, 'utf-8');
  const clusters = JSON.parse(clustersContent);

  const rankStoriesModule = await import(path.resolve(__dirname, '../src/rank-stories.js'));
  const rankStories = rankStoriesModule.default;

  const scoredClusters = clusters.map((cluster, idx) => ({
    ...cluster,
    score: Math.random() * 100,
    confidenceLevel: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
    manualBoost: cluster.manual_boost ? 15 : 0
  }));

  const ranked = rankStories(scoredClusters);

  // Format the paper
  const formatted = formatPaper(ranked);

  logTest('Format-paper returns output', formatted && typeof formatted === 'object');
  logTest('Format-paper has text property', formatted && typeof formatted.text === 'string');
  logTest('Format-paper has html property', formatted && typeof formatted.html === 'string');

  // Verify text output contains sections
  if (formatted && formatted.text) {
    const textHasSections = formatted.text.includes('Today') || formatted.text.length > 100;
    logTest('Format-paper text output has content', textHasSections);
  }

  // Verify HTML output is valid
  if (formatted && formatted.html) {
    const htmlHasMarkup = formatted.html.includes('<') && formatted.html.includes('>');
    logTest('Format-paper HTML output has markup', htmlHasMarkup);

    const htmlHasSections = formatted.html.includes('section') || formatted.html.includes('h2') || formatted.html.includes('h3');
    logTest('Format-paper HTML output has structural elements', htmlHasSections);
  }

} catch (error) {
  logTest('Format-paper module execution', false, error.message);
}

// Print summary
console.log('\n=== TEST SUMMARY ===\n');
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log(`Total:  ${passCount + failCount}`);

if (failCount > 0) {
  console.log('\nFailed tests:');
  tests.filter(t => !t.passed).forEach(t => {
    console.log(`  - ${t.name}${t.message ? ': ' + t.message : ''}`);
  });
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
  process.exit(0);
}
