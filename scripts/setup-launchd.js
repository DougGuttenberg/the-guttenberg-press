import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Determine project directory dynamically
const projectDir = path.resolve(import.meta.url.replace('file://', ''), '../../');

const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
const logsDir = path.join(projectDir, 'data', 'logs');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Get PATH with homebrew locations
const pathEnv = `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}`;

function createPlist(name, script, schedule) {
  const plistPath = path.join(launchAgentsDir, name);
  const logPath = path.join(logsDir, `${name.replace('.plist', '')}.log`);
  const errorLogPath = path.join(logsDir, `${name.replace('.plist', '')}.error.log`);

  let plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dailypaper.${name.replace('com.dailypaper.', '').replace('.plist', '')}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>${path.join(projectDir, 'src', script)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectDir}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${pathEnv}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${errorLogPath}</string>`;

  if (schedule.startCalendarInterval) {
    plistContent += `
  <key>StartCalendarInterval</key>
  <dict>`;
    Object.entries(schedule.startCalendarInterval).forEach(([key, value]) => {
      plistContent += `
    <key>${key}</key>
    <integer>${value}</integer>`;
    });
    plistContent += `
  </dict>`;
  }

  if (schedule.keepAlive) {
    plistContent += `
  <key>KeepAlive</key>
  <true/>`;
  }

  plistContent += `
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plistContent);
  console.log(`Created: ${plistPath}`);

  return plistPath;
}

const jobs = [
  {
    name: 'com.dailypaper.nightly.plist',
    script: 'run-nightly.js',
    schedule: {
      startCalendarInterval: {
        Hour: 2,
        Minute: 0,
      },
    },
  },
  {
    name: 'com.dailypaper.delivery.plist',
    script: 'run-delivery.js',
    schedule: {
      startCalendarInterval: {
        Hour: 7,
        Minute: 30,
      },
    },
  },
  {
    name: 'com.dailypaper.monitor.plist',
    script: 'run-inbox-monitor.js',
    schedule: {
      keepAlive: true,
    },
  },
];

console.log('Setting up launchd jobs for Daily Paper...\n');

const plistPaths = [];
jobs.forEach((job) => {
  const plistPath = createPlist(job.name, job.script, job.schedule);
  plistPaths.push(plistPath);
});

console.log('\nLoading jobs with launchctl...\n');

plistPaths.forEach((plistPath) => {
  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: 'inherit' });
    console.log(`Loaded: ${path.basename(plistPath)}`);
  } catch (error) {
    console.error(`Failed to load ${path.basename(plistPath)}:`, error.message);
  }
});

console.log('\n✓ Setup complete!\n');
console.log('Job Management:');
console.log('  List jobs:     launchctl list | grep dailypaper');
console.log('  View logs:     node scripts/view-logs.js');
console.log('  Stop jobs:     node scripts/stop-launchd.js');
console.log('  Check status:  node scripts/status.js');
