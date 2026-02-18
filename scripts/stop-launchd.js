import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');

const jobs = [
  'com.dailypaper.nightly.plist',
  'com.dailypaper.delivery.plist',
  'com.dailypaper.monitor.plist',
];

console.log('Unloading launchd jobs...\n');

jobs.forEach((job) => {
  const plistPath = path.join(launchAgentsDir, job);

  if (fs.existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'inherit' });
      console.log(`✓ Unloaded: ${job}`);
    } catch (error) {
      console.error(`✗ Failed to unload ${job}:`, error.message);
    }
  } else {
    console.log(`✗ Not found: ${job}`);
  }
});

console.log('\n✓ All jobs stopped.');
console.log('To verify: launchctl list | grep dailypaper');
