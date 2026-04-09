import dotenv from 'dotenv';
import path from 'node:path';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config as appConfig } from '../src/config.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const defaultSessionFile = path.join(repoRoot, '.e2e', 'telegram-user.session');

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseInteger(name) {
  const rawValue = readRequiredEnv(name);
  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }

  return parsed;
}

function parseChatId(name) {
  const rawValue = readRequiredEnv(name);
  if (!/^-?\d+$/.test(rawValue)) {
    throw new Error(`Environment variable ${name} must be a valid integer chat ID`);
  }

  return rawValue;
}

export function loadE2EConfig() {
  return {
    botToken: appConfig.bot.token || readRequiredEnv('BOT_TOKEN'),
    telegramApiId: parseInteger('E2E_TELEGRAM_API_ID'),
    telegramApiHash: readRequiredEnv('E2E_TELEGRAM_API_HASH'),
    telegramSession: process.env.E2E_TELEGRAM_SESSION || null,
    telegramSessionFile: process.env.E2E_TELEGRAM_SESSION_FILE || defaultSessionFile,
    primaryGroupId: parseChatId('E2E_PRIMARY_GROUP_ID')
  };
}

export async function loadTelegramSession(config = loadE2EConfig()) {
  if (config.telegramSession) {
    return config.telegramSession;
  }

  try {
    await access(config.telegramSessionFile);
  } catch {
    return '';
  }

  const contents = await readFile(config.telegramSessionFile, 'utf8');
  return contents.trim();
}

export async function saveTelegramSession(sessionString, config = loadE2EConfig()) {
  await mkdir(path.dirname(config.telegramSessionFile), { recursive: true });
  await writeFile(config.telegramSessionFile, `${sessionString}\n`, 'utf8');
}

export function maskBotToken(token) {
  if (!token) {
    return '<missing>';
  }

  if (token.length <= 10) {
    return '***';
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

export { defaultSessionFile, repoRoot };
