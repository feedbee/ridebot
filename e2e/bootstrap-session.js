import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  loadE2EConfig,
  loadTelegramSession,
  maskBotToken,
  saveTelegramSession
} from './config.js';
import { resolveBotUsername } from './client/bot-api.js';
import { createTelegramUserClient } from './client/telegram-user-client.js';

function printHelp() {
  console.log('Bootstrap a persistent Telegram MTProto session for full E2E tests.');
  console.log('');
  console.log('Required environment variables:');
  console.log('- BOT_TOKEN');
  console.log('- E2E_TELEGRAM_API_ID');
  console.log('- E2E_TELEGRAM_API_HASH');
  console.log('- E2E_PRIMARY_GROUP_ID');
  console.log('');
  console.log('Optional environment variables:');
  console.log('- E2E_TELEGRAM_SESSION');
  console.log('- E2E_TELEGRAM_SESSION_FILE');
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const config = loadE2EConfig();
  const sessionString = await loadTelegramSession(config);
  const botUsername = await resolveBotUsername(config.botToken);

  console.log(`Using bot token: ${maskBotToken(config.botToken)}`);
  console.log(`Resolved bot username: @${botUsername}`);
  console.log(`Primary group: ${config.primaryGroupId}`);

  const client = createTelegramUserClient({
    ...config,
    telegramSession: sessionString
  });

  await client.connect();

  if (await client.isAuthorized()) {
    const me = await client.getMe();
    console.log(`Telegram session is already authorized for ${me.username || me.firstName || me.id}`);
    await saveTelegramSession(client.getSessionString(), config);
    await client.disconnect();
    return;
  }

  const rl = createInterface({ input, output });

  try {
    await client.loginWithPrompts({
      phoneNumber: async () => rl.question('Telegram phone number: '),
      phoneCode: async () => rl.question('Telegram login code: '),
      password: async () => rl.question('Telegram 2FA password (leave blank if disabled): '),
      onError: error => {
        throw error;
      }
    });

    await saveTelegramSession(client.getSessionString(), config);
    const me = await client.getMe();
    console.log(`Saved Telegram session for ${me.username || me.firstName || me.id}`);
  } finally {
    rl.close();
    await client.disconnect();
  }
}

main().catch(error => {
  console.error('Failed to bootstrap Telegram E2E session:', error);
  process.exitCode = 1;
});
