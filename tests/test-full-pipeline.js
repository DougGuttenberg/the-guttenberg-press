import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== THE GUTTENBERG PRESS ===');
console.log('Daily Newspaper Pipeline - End-to-End Test');
console.log('========================================\n');

// Step 1: Load sample data
console.log('STEP 1: Loading sample data files...\n');

let articles, assertions, clusters;

try {
  const articlesPath = path.resolve(__dirname, './sample-data/sample-articles.json');
  const assertionsPath = path.resolve(__dirname, './sample-data/sample-assertions.json');
  const clustersPath = path.resolve(__dirname, './sample-data/sample-clusters.json');

  articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));
  assertions = JSON.parse(fs.readFileSync(assertionsPath, 'utf-8'));
  clusters = JSON.parse(fs.readFileSync(clustersPath, 'utf-8'));

  console.log(`✓ Loaded ${articles.length} articles`);
  console.log(`✓ Loaded ${assertions.length} assertions`);
  console.log(`✓ Loaded ${clusters.length} clusters`);
} catch (error) {
  console.error('✗ Failed to load sample data:', error.message);
  process.exit(1);
}

// Step 2: Verify data structure
console.log('\nSTEP 2: Validating data structure...\n');

let structureValid = true;

// Validate articles
if (!Array.isArray(articles) || articles.length === 0) {
  console.error('✗ Articles data is invalid');
  structureValid = false;
} else {
  const firstArticle = articles[0];
  const hasRequired = firstArticle.source && firstArticle.title && firstArticle.content;
  if (hasRequired) {
    console.log('✓ Articles have required fields');
  } else {
    console.error('✗ Articles missing required fields');
    structureValid = false;
  }
}

// Validate assertions
if (!Array.isArray(assertions) || assertions.length === 0) {
  console.error('✗ Assertions data is invalid');
  structureValid = false;
} else {
  const firstAssertion = assertions[0];
  const hasRequired = firstAssertion.assertion && firstAssertion.confidence && firstAssertion.domains;
  if (hasRequired) {
    console.log('✓ Assertions have required fields');
  } else {
    console.error('✗ Assertions missing required fields');
    structureValid = false;
  }
}

// Validate clusters
if (!Array.isArray(clusters) || clusters.length === 0) {
  console.error('✗ Clusters data is invalid');
  structureValid = false;
} else {
  const firstCluster = clusters[0];
  const hasRequired = firstCluster.cluster_id && firstCluster.headline && Array.isArray(firstCluster.assertions);
  if (hasRequired) {
    console.log('✓ Clusters have required fields');
  } else {
    console.error('✗ Clusters missing required fields');
    structureValid = false;
  }
}

if (!structureValid) {
  console.error('\n✗ Data structure validation failed');
  process.exit(1);
}

// Step 3: Skip Claude-dependent steps, use pre-built data
console.log('\nSTEP 3: Skipping Claude-dependent steps (normalize, cluster, score)...\n');
console.log('✓ Skipped: normalize step (would call Claude API)');
console.log('✓ Skipped: cluster step (would call Claude API)');
console.log('✓ Skipped: score step (would call Claude API)');

// Step 4: Score clusters for ranking (simulated)
console.log('\nSTEP 4: Applying simulated scoring to clusters...\n');

const scoredClusters = clusters.map((cluster, idx) => {
  // Simulate scoring based on cluster characteristics
  let baseScore = 50;

  // Boost score based on assertion count and confidence
  if (cluster.assertions && cluster.assertions.length > 0) {
    const avgConfidence = cluster.assertions.reduce((sum, a) => sum + (a.confidence || 0), 0) / cluster.assertions.length;
    baseScore += avgConfidence * 30;
  }

  // Boost score based on source count
  if (cluster.source_count > 2) {
    baseScore += 10;
  }

  // Boost score if manually boosted
  if (cluster.manual_boost) {
    baseScore += 20;
  }

  // Add randomness
  const randomFactor = (Math.random() - 0.5) * 10;
  const finalScore = Math.min(100, Math.max(0, baseScore + randomFactor));

  // Determine confidence level based on assertion confidence and source count
  let confidenceLevel = 'low';
  if (cluster.assertions && cluster.assertions.length > 0) {
    const avgConfidence = cluster.assertions.reduce((sum, a) => sum + (a.confidence || 0), 0) / cluster.assertions.length;
    if (avgConfidence > 0.9 && cluster.source_count > 1) {
      confidenceLevel = 'high';
    } else if (avgConfidence > 0.8 || cluster.source_count > 1) {
      confidenceLevel = 'medium';
    }
  }

  return {
    ...cluster,
    score: finalScore,
    confidenceLevel: confidenceLevel,
    manualBoost: cluster.manual_boost ? 15 : 0
  };
});

console.log(`✓ Scored ${scoredClusters.length} clusters with confidence levels`);
console.log(`  - High confidence: ${scoredClusters.filter(c => c.confidenceLevel === 'high').length}`);
console.log(`  - Medium confidence: ${scoredClusters.filter(c => c.confidenceLevel === 'medium').length}`);
console.log(`  - Low confidence: ${scoredClusters.filter(c => c.confidenceLevel === 'low').length}`);

// Step 5: Load and run rank-stories module
console.log('\nSTEP 5: Running rank-stories module...\n');

let ranked;
try {
  const rankStoriesModule = await import(path.resolve(__dirname, '../src/rank-stories.js'));
  const rankStories = rankStoriesModule.default;

  ranked = rankStories(scoredClusters);

  if (!ranked || !ranked.sections) {
    throw new Error('rank-stories did not return valid output');
  }

  console.log('✓ Rank-stories executed successfully');
  console.log(`✓ Created ${ranked.sections.length} sections`);

  ranked.sections.forEach(section => {
    console.log(`  - ${section.name}: ${section.stories ? section.stories.length : 0} stories`);
  });
} catch (error) {
  console.error('✗ Rank-stories execution failed:', error.message);
  process.exit(1);
}

// Step 6: Load and run format-paper module
console.log('\nSTEP 6: Running format-paper module...\n');

let formatted;
try {
  const formatPaperModule = await import(path.resolve(__dirname, '../src/format-paper.js'));
  const formatPaper = formatPaperModule.default;

  formatted = formatPaper(ranked);

  if (!formatted || !formatted.text || !formatted.html) {
    throw new Error('format-paper did not return valid output');
  }

  console.log('✓ Format-paper executed successfully');
  console.log(`✓ Generated text output: ${formatted.text.length} characters`);
  console.log(`✓ Generated HTML output: ${formatted.html.length} characters`);
} catch (error) {
  console.error('✗ Format-paper execution failed:', error.message);
  process.exit(1);
}

// Step 7: Verify output structure
console.log('\nSTEP 7: Verifying output structure...\n');

let outputValid = true;

// Check text output
if (formatted.text) {
  const hasNewlines = formatted.text.includes('\n');
  const hasContent = formatted.text.length > 100;
  if (hasNewlines && hasContent) {
    console.log('✓ Text output has expected structure');
  } else {
    console.error('✗ Text output structure invalid');
    outputValid = false;
  }
}

// Check HTML output
if (formatted.html) {
  const hasMarkup = formatted.html.includes('<') && formatted.html.includes('>');
  const hasContent = formatted.html.length > 100;
  if (hasMarkup && hasContent) {
    console.log('✓ HTML output has expected markup');
  } else {
    console.error('✗ HTML output structure invalid');
    outputValid = false;
  }
}

if (!outputValid) {
  console.error('\n✗ Output validation failed');
  process.exit(1);
}

// Step 8: Display formatted newspaper preview
console.log('\nSTEP 8: Publishing preview of formatted newspaper...\n');
console.log('=' * 80);
console.log('');
console.log(formatted.text);
console.log('');
console.log('=' * 80);

// Step 9: Save outputs for inspection
console.log('\nSTEP 9: Saving outputs...\n');

const outputDir = path.resolve(__dirname, './test-output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

try {
  // Save text output
  fs.writeFileSync(
    path.join(outputDir, 'newspaper-output.txt'),
    formatted.text,
    'utf-8'
  );
  console.log('✓ Saved text output to test-output/newspaper-output.txt');

  // Save HTML output
  fs.writeFileSync(
    path.join(outputDir, 'newspaper-output.html'),
    formatted.html,
    'utf-8'
  );
  console.log('✓ Saved HTML output to test-output/newspaper-output.html');

  // Save ranked data
  fs.writeFileSync(
    path.join(outputDir, 'ranked-data.json'),
    JSON.stringify(ranked, null, 2),
    'utf-8'
  );
  console.log('✓ Saved ranked data to test-output/ranked-data.json');
} catch (error) {
  console.error('✗ Failed to save outputs:', error.message);
  process.exit(1);
}

// Final summary
console.log('\n' + '='.repeat(60));
console.log('✓ PIPELINE EXECUTION COMPLETED SUCCESSFULLY');
console.log('='.repeat(60));
console.log(`\nSummary:`);
console.log(`  - Input articles: ${articles.length}`);
console.log(`  - Input assertions: ${assertions.length}`);
console.log(`  - Input clusters: ${clusters.length}`);
console.log(`  - Output sections: ${ranked.sections.length}`);
console.log(`  - Output stories: ${ranked.sections.reduce((sum, s) => sum + (s.stories ? s.stories.length : 0), 0)}`);
console.log(`  - Text output size: ${formatted.text.length} characters`);
console.log(`  - HTML output size: ${formatted.html.length} characters`);
console.log(`\nTest outputs saved to: ${outputDir}`);

process.exit(0);
