import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

export class TelegramUserClient {
  constructor({ apiId, apiHash, sessionString = '', clientOptions = {} }) {
    if (!apiId || !apiHash) {
      throw new Error('TelegramUserClient requires apiId and apiHash');
    }

    this.stringSession = new StringSession(sessionString);
    this.client = new TelegramClient(
      this.stringSession,
      apiId,
      apiHash,
      {
        connectionRetries: 5,
        ...clientOptions
      }
    );
  }

  async connect() {
    await this.client.connect();
    return this;
  }

  async disconnect() {
    await this.client.disconnect();
  }

  async isAuthorized() {
    return this.client.checkAuthorization();
  }

  async loginWithPrompts({ phoneNumber, phoneCode, password, onError }) {
    await this.client.start({
      phoneNumber,
      phoneCode,
      password,
      onError
    });

    return this.getSessionString();
  }

  getSessionString() {
    return this.stringSession.save();
  }

  async getMe() {
    return this.client.getMe();
  }
}

export function createTelegramUserClient({ telegramApiId, telegramApiHash, telegramSession }) {
  return new TelegramUserClient({
    apiId: telegramApiId,
    apiHash: telegramApiHash,
    sessionString: telegramSession || ''
  });
}
