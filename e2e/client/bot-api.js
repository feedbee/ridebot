import fetch from 'node-fetch';

export class BotApiClient {
  constructor(botToken) {
    if (!botToken) {
      throw new Error('BotApiClient requires a bot token');
    }

    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async call(method, params = undefined) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: params ? 'POST' : 'GET',
      headers: params ? { 'Content-Type': 'application/json' } : undefined,
      body: params ? JSON.stringify(params) : undefined
    });

    if (!response.ok) {
      throw new Error(`Telegram Bot API request failed: ${method} returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(`Telegram Bot API request failed: ${method} returned ${payload.description || 'unknown error'}`);
    }

    return payload.result;
  }

  async getMe() {
    return this.call('getMe');
  }

  async getBotUsername() {
    const me = await this.getMe();

    if (!me.username) {
      throw new Error('Bot API getMe did not return a username');
    }

    return me.username;
  }
}

export async function resolveBotUsername(botToken) {
  const client = new BotApiClient(botToken);
  return client.getBotUsername();
}
