import { Bot as GrammyBot, webhookCallback } from 'grammy';

/**
 * Thin adapter over grammy-specific bot operations.
 * Keeps framework details out of higher-level bot tests.
 */
export class TelegramGateway {
  constructor(token) {
    this.bot = new GrammyBot(token);
  }

  get api() {
    return this.bot.api;
  }

  use(middleware) {
    return this.bot.use(middleware);
  }

  command(command, handler) {
    return this.bot.command(command, handler);
  }

  callbackQuery(pattern, handler) {
    return this.bot.callbackQuery(pattern, handler);
  }

  on(eventName, handler) {
    return this.bot.on(eventName, handler);
  }

  startPolling() {
    return this.bot.start();
  }

  createWebhookMiddleware() {
    return webhookCallback(this.bot, 'express');
  }
}
