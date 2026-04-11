import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import { runTelegramE2E } from './run-e2e.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOT_READY_PATTERN = /Bike Ride Bot v[\d.]+(?:-[^\s]+)? started in development mode/;
const BOT_READY_TIMEOUT_MS = 30000;
const BOT_SHUTDOWN_TIMEOUT_MS = 5000;

function prefixedLog(prefix, message) {
  console.log(`${prefix} ${message}`);
}

function prefixedError(prefix, message) {
  console.error(`${prefix} ${message}`);
}

async function withPrefixedConsole(prefix, callback) {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };

  const wrap = method => (...args) => method(`${prefix} ${args.join(' ')}`);

  console.log = wrap(original.log);
  console.info = wrap(original.info);
  console.warn = wrap(original.warn);
  console.error = wrap(original.error);

  try {
    return await callback();
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  }
}

function pipeProcessOutput(stream, prefix, onLine) {
  const reader = readline.createInterface({ input: stream });
  reader.on('line', line => {
    prefixedLog(prefix, line);
    onLine?.(line);
  });
  return reader;
}

function startBotProcess() {
  return spawn(process.execPath, ['src/index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForBotReady(botProcess) {
  await new Promise((resolve, reject) => {
    let settled = false;

    const finish = callback => value => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };

    const succeed = finish(resolve);
    const fail = finish(reject);

    const onOutputLine = line => {
      if (BOT_READY_PATTERN.test(line)) {
        succeed();
      }
    };

    const stdoutReader = pipeProcessOutput(botProcess.stdout, '[bot]', onOutputLine);
    const stderrReader = pipeProcessOutput(botProcess.stderr, '[bot]', onOutputLine);

    const cleanup = () => {
      stdoutReader.close();
      stderrReader.close();
    };

    const timeout = setTimeout(() => {
      cleanup();
      fail(new Error(`Timed out waiting for bot startup log: ${BOT_READY_PATTERN}`));
    }, BOT_READY_TIMEOUT_MS);

    botProcess.once('error', error => {
      cleanup();
      fail(error);
    });

    botProcess.once('exit', code => {
      cleanup();
      fail(new Error(`Bot process exited before readiness with code ${code}`));
    });
  });
}

async function stopBotProcess(botProcess) {
  if (!botProcess || botProcess.killed || botProcess.exitCode !== null) {
    return;
  }

  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      botProcess.kill('SIGKILL');
    }, BOT_SHUTDOWN_TIMEOUT_MS);

    botProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    botProcess.kill('SIGINT');
  });
}

async function main() {
  prefixedLog('[runner]', 'Starting local dev bot process...');
  const botProcess = startBotProcess();

  try {
    await waitForBotReady(botProcess);
    prefixedLog('[runner]', 'Bot is ready. Starting Telegram E2E suite...');

    await withPrefixedConsole('[e2e]', () => runTelegramE2E());
  } finally {
    prefixedLog('[runner]', 'Stopping local dev bot process...');
    await stopBotProcess(botProcess);
  }
}

main().catch(error => {
  prefixedError('[runner]', `Telegram E2E runner failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
