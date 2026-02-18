import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const LOG_DIR = join(PROJECT_ROOT, 'data', 'logs');

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] || LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, module, message, data) {
  const ts = timestamp();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${ts}] [${level.toUpperCase()}] [${module}] ${message}${dataStr}`;
}

function writeToFile(line) {
  const today = new Date().toISOString().split('T')[0];
  const logFile = join(LOG_DIR, `${today}.log`);
  try {
    appendFileSync(logFile, line + '\n');
  } catch (err) {
    // Silently fail file logging — console still works
  }
}

export function createLogger(moduleName) {
  return {
    debug(message, data) {
      if (currentLevel <= LEVELS.debug) {
        const line = formatMessage('debug', moduleName, message, data);
        console.log(line);
        writeToFile(line);
      }
    },

    info(message, data) {
      if (currentLevel <= LEVELS.info) {
        const line = formatMessage('info', moduleName, message, data);
        console.log(line);
        writeToFile(line);
      }
    },

    warn(message, data) {
      if (currentLevel <= LEVELS.warn) {
        const line = formatMessage('warn', moduleName, message, data);
        console.warn(line);
        writeToFile(line);
      }
    },

    error(message, data) {
      if (currentLevel <= LEVELS.error) {
        const line = formatMessage('error', moduleName, message, data);
        console.error(line);
        writeToFile(line);
      }
    },

    success(message, data) {
      const line = formatMessage('info', moduleName, `✓ ${message}`, data);
      console.log(line);
      writeToFile(line);
    },

    step(stepNum, total, message) {
      const line = formatMessage('info', moduleName, `[${stepNum}/${total}] ${message}`);
      console.log(line);
      writeToFile(line);
    }
  };
}

export default createLogger;
