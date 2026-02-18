import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');
const logsDir = path.join(projectDir, 'data', 'logs');

// Parse command line arguments
const args = process.argv.slice(2);
let lineCount = 50;

args.forEach((arg) => {
  if (arg.startsWith('--lines=')) {
    lineCount = parseInt(arg.split('=')[1], 10);
  }
});

if (!fs.existsSync(logsDir)) {
  console.error(`Logs directory not found: ${logsDir}`);
  process.exit(1);
}

try {
  const files = fs.readdirSync(logsDir).filter((f) => f.endsWith('.log'));

  if (files.length === 0) {
    console.log('No log files found.');
    process.exit(0);
  }

  // Get the most recent log file
  const fileStats = files.map((file) => ({
    name: file,
    time: fs.statSync(path.join(logsDir, file)).mtime.getTime(),
  }));

  fileStats.sort((a, b) => b.time - a.time);
  const latestLogFile = fileStats[0].name;
  const logPath = path.join(logsDir, latestLogFile);

  console.log(`Displaying last ${lineCount} lines of: ${latestLogFile}\n`);
  console.log('─'.repeat(70));

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');
  const lastLines = lines.slice(Math.max(0, lines.length - lineCount));

  console.log(lastLines.join('\n'));
  console.log('─'.repeat(70));
  console.log(
    `\nTotal lines in log: ${lines.length} | Showing: ${Math.min(lineCount, lines.length)}`
  );
} catch (error) {
  console.error('Error reading logs:', error.message);
  process.exit(1);
}
