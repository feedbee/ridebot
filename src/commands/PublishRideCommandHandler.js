import { InlineKeyboard } from 'grammy';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { config } from '../config.js';
import { escapeHtml } from '../utils/html-escape.js';

const RECENT_DESTINATIONS_LIMIT = 5;

/**
 * Handles publication of a creator's ride to one of their recent destinations.
 */
export class PublishRideCommandHandler extends BaseCommandHandler {
  /**
   * Show the recent destination menu from a private creator ride card.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleMenu(ctx) {
    if (ctx.chat?.type !== 'private') {
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.publish.privateOnly'));
      return;
    }

    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      'commands.common.onlyCreatorAction',
      'callback'
    );
    if (error) {
      await ctx.answerCallbackQuery(error);
      return;
    }
    if (ride.cancelled) {
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.share.cannotRepostCancelled'));
      return;
    }

    await ctx.answerCallbackQuery();
    const destinations = await this.getHydratedDestinations(ctx);
    const menu = this.buildMenu(ctx, ride, destinations);
    await ctx.replyWithRichMessage({ html: menu.html }, { reply_markup: menu.keyboard });
  }

  /**
   * Publish a ride after a numbered destination button is selected.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handlePublish(ctx) {
    if (ctx.chat?.type !== 'private') {
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.publish.privateOnly'));
      return;
    }

    const rideId = ctx.match?.[1];
    const chatId = Number(ctx.match?.[2]);
    const threadValue = ctx.match?.[3];
    const messageThreadId = threadValue === 'main' ? null : Number(threadValue);

    const { ride, error } = await this.getRideById(ctx, rideId);
    if (error || !this.isRideCreator(ride, ctx.from.id)) {
      await ctx.answerCallbackQuery(error || this.translate(ctx, 'commands.common.onlyCreatorAction'));
      return;
    }
    if (ride.cancelled) {
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.share.cannotRepostCancelled'));
      return;
    }

    const destinations = await this.getHydratedDestinations(ctx);
    const destination = destinations.find(candidate =>
      candidate.chatId === chatId &&
      (candidate.messageThreadId ?? null) === messageThreadId
    );
    if (!destination) {
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.publish.destinationExpired'));
      return;
    }

    const cleanup = await this.rideMessagesService.cleanupRideMessagesForScope(
      ride,
      ctx,
      chatId,
      messageThreadId,
      config.maxRideMessagesPerChatThread
    );
    if (!cleanup.success) {
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.share.announcementLimitCleanupFailed'));
      return;
    }

    let result;
    try {
      result = await this.rideMessagesService.createRideMessageInTarget(
        cleanup.updatedRide,
        ctx,
        { ...destination, publishedBy: ctx.from.id }
      );
    } catch (publicationError) {
      console.error('Error publishing ride from recent destinations:', publicationError);
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.share.failedToPost'));
      return;
    }

    await ctx.answerCallbackQuery();
    const updatedDestinations = await this.getHydratedDestinations(ctx);
    const menu = this.buildMenu(ctx, result.updatedRide, updatedDestinations);
    await ctx.editMessageText({ html: menu.html }, { reply_markup: menu.keyboard });
  }

  /**
   * Close the recent destinations menu.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleClose(ctx) {
    if (ctx.chat?.type !== 'private') {
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.publish.privateOnly'));
      return;
    }

    await ctx.deleteMessage();
    await ctx.answerCallbackQuery();
  }

  /**
   * Build the Rich HTML menu and its inline keyboard.
   * @param {import('grammy').Context} ctx
   * @param {Object} ride
   * @param {Array<Object>} destinations
   * @returns {{html: string, keyboard: InlineKeyboard}}
   */
  buildMenu(ctx, ride, destinations) {
    const publishedMessages = (ride.messages || []).filter(message => !message.isForCreator);
    const publishedDestinationKeys = new Set(
      publishedMessages.map(message => this.getDestinationKey(message))
    );
    const destinationByKey = new Map(
      destinations.map(destination => [this.getDestinationKey(destination), destination])
    );

    const botUsername = ctx.me?.username ? `@${ctx.me.username}` : '';
    const shareCommand = `/shareride${botUsername} #${ride.id}`;
    const blocks = [
      `<h3>${escapeHtml(this.translate(ctx, 'commands.publish.introTitle'))}</h3>` +
      `<p>${this.translate(ctx, 'commands.publish.introText', {
        command: escapeHtml(shareCommand)
      })}</p>`
    ];
    blocks.push(this.buildPublishedBlock(ctx, publishedMessages, destinationByKey));

    const destinationLines = destinations.map(destination => {
      const label = this.formatDestinationLabel(ctx, destination);
      const link = this.buildDestinationLink(destination);
      const check = publishedDestinationKeys.has(this.getDestinationKey(destination)) ? '✅ ' : '';
      return link
        ? `<li>${check}<a href="${escapeHtml(link)}">${label}</a></li>`
        : `<li>${check}${label}</li>`;
    });
    blocks.push(
      `<h3>${escapeHtml(this.translate(ctx, 'commands.publish.chooseDestination'))}</h3>` +
      (destinationLines.length > 0
        ? `<ol>${destinationLines.join('')}</ol>`
        : `<ul><li>${escapeHtml(this.translate(ctx, 'commands.publish.noRecentPublications'))}</li></ul>`)
    );
    if (destinations.length > 0) {
      blocks.push(
        `<p>&#160;</p>` +
        `<p><i>${escapeHtml(this.translate(ctx, 'commands.publish.publicationHint'))}</i></p>`
      );
    }

    const keyboard = new InlineKeyboard();
    destinations.forEach((destination, index) => {
      keyboard.text(
        String(index + 1),
        `ridepublish:${ride.id}:${destination.chatId}:${destination.messageThreadId ?? 'main'}`
      );
    });
    if (destinations.length > 0) keyboard.row();
    keyboard.text(this.translate(ctx, 'buttons.close'), 'ridepublish:close');

    return { html: blocks.join('\n\n'), keyboard };
  }

  /**
   * Render existing tracked announcements grouped by chat/topic.
   * @param {import('grammy').Context} ctx
   * @param {Array<Object>} messages
   * @param {Map<string, Object>} destinationByKey
   * @returns {string}
   */
  buildPublishedBlock(ctx, messages, destinationByKey) {
    const heading = `<h3>${escapeHtml(this.translate(ctx, 'commands.publish.publishedTitle'))}</h3>`;
    if (messages.length === 0) {
      return heading +
        `<ul><li>${escapeHtml(this.translate(ctx, 'commands.publish.notPublishedYet'))}</li></ul>`;
    }

    const groups = new Map();
    for (const message of messages) {
      const key = this.getDestinationKey(message);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(message);
    }

    const lines = Array.from(groups.entries()).map(([key, groupedMessages]) => {
      const displayDestination = { ...groupedMessages[0], ...destinationByKey.get(key) };
      const label = this.formatDestinationLabel(ctx, displayDestination);
      const links = groupedMessages.map((message, index) => {
        const link = this.buildMessageLink({ ...displayDestination, messageId: message.messageId });
        return link ? `<a href="${escapeHtml(link)}">[${index + 1}]</a>` : `[${index + 1}]`;
      });
      return `<li>${label} ${links.join(' ')}</li>`;
    });

    return heading + `<ul>${lines.join('')}</ul>`;
  }

  /** @param {Object} destination @returns {string} */
  getDestinationKey(destination) {
    return `${destination.chatId}:${destination.messageThreadId ?? 'main'}`;
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {Object} destination
   * @returns {string}
   */
  formatDestinationLabel(ctx, destination) {
    const title = escapeHtml(destination.chatTitle || this.translate(ctx, 'commands.publish.unknownChat'));
    return destination.messageThreadId
      ? `${title} / ${escapeHtml(this.translate(ctx, 'commands.publish.threadLabel'))} #${destination.messageThreadId}`
      : title;
  }

  /**
   * Load recent destinations and refresh chat display data when Telegram allows it.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<Array<Object>>}
   */
  async getHydratedDestinations(ctx) {
    const destinations = await this.rideService.getRecentPublicationDestinations(
      ctx.from.id,
      RECENT_DESTINATIONS_LIMIT
    );

    return Promise.all(destinations.map(async destination => {
      try {
        const chat = await ctx.api.getChat(destination.chatId);
        return {
          ...destination,
          chatTitle: chat.title || destination.chatTitle,
          chatUsername: chat.username || destination.chatUsername
        };
      } catch {
        return destination;
      }
    }));
  }

  /**
   * Build a Telegram link to the previously published message or forum topic.
   * @param {Object} destination
   * @returns {string|null}
   */
  buildDestinationLink(destination) {
    const targetMessageId = destination.messageThreadId || destination.messageId;
    if (!targetMessageId) return null;
    if (destination.chatUsername) {
      return `https://t.me/${destination.chatUsername}/${targetMessageId}`;
    }

    const chatId = String(destination.chatId);
    if (!chatId.startsWith('-100')) return null;
    return `https://t.me/c/${chatId.slice(4)}/${targetMessageId}`;
  }

  /**
   * Build a direct link to one tracked announcement, including its topic path.
   * @param {Object} message
   * @returns {string|null}
   */
  buildMessageLink(message) {
    if (!message.messageId) return null;
    const path = message.messageThreadId
      ? `${message.messageThreadId}/${message.messageId}`
      : String(message.messageId);
    if (message.chatUsername) return `https://t.me/${message.chatUsername}/${path}`;

    const chatId = String(message.chatId);
    if (!chatId.startsWith('-100')) return null;
    return `https://t.me/c/${chatId.slice(4)}/${path}`;
  }
}
