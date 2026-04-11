import { loadE2EConfig, loadTelegramSession } from '../config.js';
import { resolveBotUsername } from './bot-api.js';
import { createTelegramUserClient } from './telegram-user-client.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTimestamp(value) {
  if (value == null) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function normalizePeerId(peerId) {
  return peerId == null ? null : peerId.toString();
}

function expandChatIdVariants(chatId) {
  const normalized = normalizePeerId(chatId);
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);
  const unsigned = normalized.startsWith('-') ? normalized.slice(1) : normalized;

  variants.add(unsigned);
  variants.add(`-${unsigned}`);

  if (!unsigned.startsWith('100')) {
    variants.add(`-100${unsigned}`);
  }

  if (unsigned.startsWith('100')) {
    const withoutPrefix = unsigned.slice(3);
    variants.add(withoutPrefix);
    variants.add(`-${withoutPrefix}`);
    variants.add(`-100${withoutPrefix}`);
  }

  return [...variants];
}

function buildContainsPredicate(contains, predicate) {
  return message => {
    const text = message?.message || '';

    if (contains != null && !text.includes(contains)) {
      return false;
    }

    if (predicate && !predicate(message)) {
      return false;
    }

    return true;
  };
}

export class TelegramE2EDriver {
  constructor({
    botToken,
    primaryGroupId,
    userClient,
    pollingIntervalMs = 1500,
    defaultTimeoutMs = 30000,
    userMessageDelayMs = 350
  }) {
    if (!botToken) {
      throw new Error('TelegramE2EDriver requires a bot token');
    }

    this.botToken = botToken;
    this.primaryGroupId = primaryGroupId;
    this.userClient = userClient;
    this.pollingIntervalMs = pollingIntervalMs;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.userMessageDelayMs = userMessageDelayMs;
    this.chatEntityCache = new Map();
    this.botUsername = null;
    this.botEntity = null;
    this.botPeerId = null;
    this.lastUserMessageAt = 0;
  }

  async connect() {
    await this.userClient.connect();

    if (!(await this.userClient.isAuthorized())) {
      throw new Error('Telegram user session is not authorized. Run npm run e2e:bootstrap-session first.');
    }

    this.botUsername = await resolveBotUsername(this.botToken);
    this.botEntity = await this.userClient.client.getEntity(this.botUsername);
    this.botPeerId = normalizePeerId(
      await this.userClient.client.getPeerId(this.botEntity)
    );

    return this;
  }

  async disconnect() {
    await this.userClient.disconnect();
  }

  async getPrimaryGroupEntity() {
    return this.getChatEntity(this.primaryGroupId);
  }

  async getChatEntity(chatId) {
    const cacheKey = normalizePeerId(chatId);
    if (this.chatEntityCache.has(cacheKey)) {
      return this.chatEntityCache.get(cacheKey);
    }

    const candidateIds = expandChatIdVariants(cacheKey);

    if (cacheKey.startsWith('-')) {
      const entity = await this.resolveChatEntityFromDialogs(candidateIds);
      this.chatEntityCache.set(cacheKey, entity);
      return entity;
    }

    try {
      const entity = await this.userClient.client.getEntity(chatId);
      this.chatEntityCache.set(cacheKey, entity);
      return entity;
    } catch (error) {
      const entity = await this.resolveChatEntityFromDialogs(candidateIds, error);
      this.chatEntityCache.set(cacheKey, entity);
      return entity;
    }
  }

  async resolveChatEntityFromDialogs(candidateIds, originalError = null) {
    const dialogs = await this.userClient.client.getDialogs({ limit: 200 });
    const candidates = new Set(candidateIds);

    for (const dialog of dialogs) {
      const dialogId = normalizePeerId(dialog?.id);
      const entityId = normalizePeerId(dialog?.entity?.id);
      const peerId = dialog?.entity
        ? normalizePeerId(await this.userClient.client.getPeerId(dialog.entity))
        : null;

      if (candidates.has(dialogId) || candidates.has(entityId) || candidates.has(peerId)) {
        return dialog.entity;
      }
    }

    throw originalError || new Error(`Could not resolve Telegram chat entity for ${candidateIds[0]}`);
  }

  async capturePrivateCheckpoint() {
    const message = await this.getLatestMessageFromEntity(this.botEntity);
    return message?.id || 0;
  }

  async captureChatCheckpoint({ chatId }) {
    const message = await this.getLatestMessageInChat({ chatId });
    return message?.id || 0;
  }

  async sendPrivateCommand(text) {
    await this.paceUserMessage();
    return this.userClient.client.sendMessage(this.botEntity, {
      message: text,
      parseMode: undefined
    });
  }

  async sendPrivateText(text) {
    return this.sendPrivateCommand(text);
  }

  async sendMessageToChat({ chatId, text, replyToMessageId }) {
    await this.paceUserMessage();
    const entity = await this.getChatEntity(chatId);
    const sendOptions = {
      message: text,
      parseMode: undefined
    };

    if (replyToMessageId) {
      sendOptions.replyTo = replyToMessageId;
    }

    return this.userClient.client.sendMessage(entity, sendOptions);
  }

  async deleteMessageInChat({ chatId, messageId, revoke = true }) {
    const entity = await this.getChatEntity(chatId);
    await this.userClient.client.deleteMessages(entity, [messageId], { revoke });
  }

  async deletePrivateMessage({ messageId, revoke = true }) {
    await this.userClient.client.deleteMessages(this.botEntity, [messageId], { revoke });
  }

  async getRecentPrivateMessages({ limit = 100 } = {}) {
    const messages = await this.userClient.client.getMessages(this.botEntity, { limit });
    return messages.filter(Boolean);
  }

  async deletePrivateMessagesSince({
    afterMessageId = 0,
    includeBoundary = false,
    limit = 200,
    batchSize = 50,
    revoke = true
  } = {}) {
    const messages = await this.getRecentPrivateMessages({ limit });
    const messageIds = messages
      .filter(message => includeBoundary ? message.id >= afterMessageId : message.id > afterMessageId)
      .map(message => message.id)
      .sort((left, right) => right - left);

    for (let index = 0; index < messageIds.length; index += batchSize) {
      const batch = messageIds.slice(index, index + batchSize);
      await this.userClient.client.deleteMessages(this.botEntity, batch, { revoke });
    }

    return messageIds.length;
  }

  async waitForBotPrivateMessage({
    contains,
    predicate,
    afterMessageId = 0,
    timeoutMs = this.defaultTimeoutMs
  } = {}) {
    return this.waitForBotMessageInEntity({
      entity: this.botEntity,
      contains,
      predicate,
      afterMessageId,
      timeoutMs
    });
  }

  async waitForEditedBotPrivateMessage({
    messageId,
    contains,
    predicate,
    afterEditTimestamp = 0,
    timeoutMs = this.defaultTimeoutMs
  }) {
    return this.waitForEditedBotMessageInEntity({
      entity: this.botEntity,
      messageId,
      contains,
      predicate,
      afterEditTimestamp,
      timeoutMs
    });
  }

  async waitForBotPrivateMessageState({
    messageId,
    contains,
    predicate,
    timeoutMs = this.defaultTimeoutMs
  }) {
    return this.waitForBotMessageStateInEntity({
      entity: this.botEntity,
      messageId,
      contains,
      predicate,
      timeoutMs,
      errorContext: 'private chat'
    });
  }

  async waitForPrivateMessageDeleted({
    messageId,
    timeoutMs = this.defaultTimeoutMs
  }) {
    return this.waitForMessageDeletedInEntity({
      entity: this.botEntity,
      messageId,
      timeoutMs
    });
  }

  async assertNoBotPrivateMessage({
    afterMessageId = 0,
    contains,
    predicate,
    timeoutMs = 3000
  } = {}) {
    return this.assertNoBotMessageInEntity({
      entity: this.botEntity,
      afterMessageId,
      contains,
      predicate,
      timeoutMs
    });
  }

  async waitForBotMessageInChat({
    chatId,
    contains,
    predicate,
    afterMessageId = 0,
    timeoutMs = this.defaultTimeoutMs
  }) {
    const entity = await this.getChatEntity(chatId);

    return this.waitForBotMessageInEntity({
      entity,
      contains,
      predicate,
      afterMessageId,
      timeoutMs
    });
  }

  async waitForEditedBotMessageInChat({
    chatId,
    messageId,
    contains,
    predicate,
    afterEditTimestamp = 0,
    timeoutMs = this.defaultTimeoutMs
  }) {
    const entity = await this.getChatEntity(chatId);
    return this.waitForEditedBotMessageInEntity({
      entity,
      messageId,
      contains,
      predicate,
      afterEditTimestamp,
      timeoutMs,
      errorContext: `chat ${chatId}`
    });
  }

  async waitForMessageDeletedInChat({
    chatId,
    messageId,
    timeoutMs = this.defaultTimeoutMs
  }) {
    const entity = await this.getChatEntity(chatId);
    return this.waitForMessageDeletedInEntity({
      entity,
      messageId,
      timeoutMs,
      errorContext: `chat ${chatId}`
    });
  }

  async clickButtonInPrivateMessage({
    messageId,
    buttonText,
    callbackDataPattern
  }) {
    return this.clickButtonInEntity({
      entity: this.botEntity,
      messageId,
      buttonText,
      callbackDataPattern,
      errorContext: 'private chat'
    });
  }

  async clickButtonInChat({
    chatId,
    messageId,
    buttonText,
    callbackDataPattern
  }) {
    const entity = await this.getChatEntity(chatId);
    return this.clickButtonInEntity({
      entity,
      messageId,
      buttonText,
      callbackDataPattern,
      errorContext: `chat ${chatId}`
    });
  }

  async clickButtonInEntity({
    entity,
    messageId,
    buttonText,
    callbackDataPattern,
    errorContext
  }) {
    const message = await this.getMessageById({ entity, messageId });

    if (!message) {
      throw new Error(`Message ${messageId} was not found in ${errorContext}`);
    }

    if (buttonText) {
      return message.click({ text: buttonText });
    }

    if (callbackDataPattern) {
      const pattern = callbackDataPattern instanceof RegExp
        ? callbackDataPattern
        : new RegExp(callbackDataPattern);

      return message.click({
        filter: button => {
          const data = button?.data ? Buffer.from(button.data).toString('utf8') : '';
          return pattern.test(data);
        }
      });
    }

    throw new Error('clickButtonInChat requires buttonText or callbackDataPattern');
  }

  async getLatestMessageInChat({ chatId, limit = 1 }) {
    const entity = await this.getChatEntity(chatId);
    const messages = await this.userClient.client.getMessages(entity, { limit });
    return messages[0] || null;
  }

  async getPrivateMessageById(messageId) {
    return this.getMessageById({ entity: this.botEntity, messageId });
  }

  async getLatestMessageFromEntity(entity, limit = 1) {
    const messages = await this.userClient.client.getMessages(entity, { limit });
    return messages[0] || null;
  }

  async getRecentBotMessagesInChat({ chatId, limit = 10 }) {
    const entity = await this.getChatEntity(chatId);
    const messages = await this.userClient.client.getMessages(entity, { limit });
    return messages.filter(message => this.isFromBot(message));
  }

  async waitForBotMessageInEntity({
    entity,
    contains,
    predicate,
    afterMessageId = 0,
    timeoutMs = this.defaultTimeoutMs
  }) {
    const matcher = buildContainsPredicate(contains, predicate);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const messages = await this.userClient.client.getMessages(entity, { limit: 20 });
      const matchedMessage = messages.find(message =>
        message.id > afterMessageId &&
        this.isFromBot(message) &&
        matcher(message)
      );

      if (matchedMessage) {
        return matchedMessage;
      }

      await sleep(this.pollingIntervalMs);
    }

    throw new Error(`Timed out waiting for bot message after message ${afterMessageId}`);
  }

  async waitForEditedBotMessageInEntity({
    entity,
    messageId,
    contains,
    predicate,
    afterEditTimestamp = 0,
    timeoutMs = this.defaultTimeoutMs,
    errorContext = 'entity'
  }) {
    const matcher = buildContainsPredicate(contains, predicate);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const message = await this.getMessageById({ entity, messageId });
      const editTimestamp = getTimestamp(message?.editDate);

      if (
        message &&
        this.isFromBot(message) &&
        editTimestamp > afterEditTimestamp &&
        matcher(message)
      ) {
        return message;
      }

      await sleep(this.pollingIntervalMs);
    }

    throw new Error(`Timed out waiting for edited bot message ${messageId} in ${errorContext}`);
  }

  async waitForBotMessageStateInEntity({
    entity,
    messageId,
    contains,
    predicate,
    timeoutMs = this.defaultTimeoutMs,
    errorContext = 'entity'
  }) {
    const matcher = buildContainsPredicate(contains, predicate);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const message = await this.getMessageById({ entity, messageId });

      if (message && this.isFromBot(message) && matcher(message)) {
        return message;
      }

      await sleep(this.pollingIntervalMs);
    }

    throw new Error(`Timed out waiting for bot message ${messageId} state in ${errorContext}`);
  }

  async waitForMessageDeletedInEntity({
    entity,
    messageId,
    timeoutMs = this.defaultTimeoutMs,
    errorContext = 'entity'
  }) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const message = await this.getMessageById({ entity, messageId });

      if (!message) {
        return true;
      }

      await sleep(this.pollingIntervalMs);
    }

    throw new Error(`Timed out waiting for message ${messageId} to be deleted in ${errorContext}`);
  }

  async assertNoBotMessageInEntity({
    entity,
    contains,
    predicate,
    afterMessageId = 0,
    timeoutMs = 3000
  }) {
    const matcher = buildContainsPredicate(contains, predicate);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const messages = await this.userClient.client.getMessages(entity, { limit: 20 });
      const matchedMessage = messages.find(message =>
        message.id > afterMessageId &&
        this.isFromBot(message) &&
        matcher(message)
      );

      if (matchedMessage) {
        throw new Error(`Unexpected bot message ${matchedMessage.id} appeared after ${afterMessageId}`);
      }

      await sleep(this.pollingIntervalMs);
    }

    return true;
  }

  async getMessageById({ entity, messageId }) {
    const messages = await this.userClient.client.getMessages(entity, { ids: messageId });
    return messages[0] || null;
  }

  isFromBot(message) {
    return normalizePeerId(message?.senderId) === this.botPeerId;
  }

  async paceUserMessage() {
    if (!this.userMessageDelayMs) {
      return;
    }

    const now = Date.now();
    const waitMs = this.userMessageDelayMs - (now - this.lastUserMessageAt);

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    this.lastUserMessageAt = Date.now();
  }
}

export async function createTelegramE2EDriverFromEnv(options = {}) {
  const config = loadE2EConfig();
  const sessionString = await loadTelegramSession(config);
  const userClient = createTelegramUserClient({
    ...config,
    telegramSession: sessionString
  });

  const driver = new TelegramE2EDriver({
    botToken: config.botToken,
    primaryGroupId: config.primaryGroupId,
    userClient,
    ...options
  });

  await driver.connect();
  return driver;
}
