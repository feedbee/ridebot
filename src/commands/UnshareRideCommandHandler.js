import { InlineKeyboard } from 'grammy';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { SettingsService } from '../services/SettingsService.js';

/** Handler for removing tracked ride announcements without deleting the ride. */
export class UnshareRideCommandHandler extends BaseCommandHandler {
  /** Start an announcement removal flow. */
  async handle(ctx) {
    const { rideId, error } = this.rideMessagesService.extractRideId(
      ctx.message,
      ctx.lang ? { language: ctx.lang } : undefined
    );
    if (!rideId) {
      await this.replyWithCodeExamples(ctx, error);
      return;
    }

    const { ride, error: rideError } = await this.getRideById(ctx, rideId);
    if (rideError) {
      await ctx.reply(rideError);
      return;
    }

    const reference = this.hasExplicitId(ctx.message)
      ? null
      : this.resolveMessageReference(ctx.message.reply_to_message, ctx.chat.id);
    if (!this.hasExplicitId(ctx.message) && !reference) {
      await ctx.reply(this.translate(ctx, 'commands.unshare.unrecognizedAnnouncement'));
      return;
    }

    const scope = reference
      ? { mode: 'm', first: reference.chatId, second: reference.messageId }
      : ctx.chat.type === 'private'
        ? { mode: 'a' }
        : { mode: 's', first: ctx.chat.id, second: ctx.message.message_thread_id ?? 0 };
    const targets = this.selectTargets(ride, ctx.from.id, scope);
    if (targets.length === 0) {
      await ctx.reply(this.translate(ctx, reference
        ? 'commands.unshare.unrecognizedAnnouncement'
        : 'commands.unshare.nothingToDelete'));
      return;
    }

    const callbackSuffix = [scope.mode, scope.first, scope.second]
      .filter(value => value !== undefined)
      .join(':');
    const keyboard = new InlineKeyboard()
      .text(ctx.t('buttons.confirmDelete'), `u:c:${ride.id}:${callbackSuffix}`)
      .text(ctx.t('buttons.cancelDelete'), `u:x:${ride.id}:${callbackSuffix}`);
    const text = this.translate(ctx, 'commands.unshare.confirmation', {
      messages: targets.length,
      chats: new Set(targets.map(message => message.chatId)).size
    });

    if (ctx.chat.type === 'private') {
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }

    try {
      await ctx.api.sendMessage(ctx.from.id, text, { reply_markup: keyboard });
    } catch {
      // A user who never opened the bot cannot own a removable repost.
    }
  }

  /** Resolve and execute a confirmed removal against fresh ride state. */
  async handleConfirmation(ctx) {
    const [, action, rideId, mode, first, second] = ctx.match;
    if (action === 'x') {
      await this.finish(ctx, this.translate(ctx, 'commands.unshare.cancelled'));
      return;
    }

    const { ride, error } = await this.getRideById(ctx, rideId);
    if (error) {
      await this.finish(ctx, error);
      return;
    }

    const scope = { mode, first: first === undefined ? undefined : Number(first), second: second === undefined ? undefined : Number(second) };
    const targets = this.selectTargets(ride, ctx.from.id, scope);
    if (targets.length === 0) {
      await this.finish(ctx, this.translate(ctx, 'commands.unshare.nothingToDelete'));
      return;
    }

    const result = await this.rideMessagesService.unshareRideMessages(ride, ctx.api, targets);
    const removed = result.deletedCount + result.unavailableCount;
    const message = result.failedCount
      ? this.translate(ctx, 'commands.unshare.partial', { removed, failed: result.failedCount })
      : this.translate(ctx, 'commands.unshare.success', { count: removed });
    await this.finish(ctx, message);
  }

  /** Select authorized public announcements in the requested scope. */
  selectTargets(ride, userId, scope) {
    const isCreator = ride.createdBy === userId;
    const canRemove = message => isCreator || (
      SettingsService.getRideSettingsSnapshot(ride).allowReposts && message.publishedBy === userId
    );
    return (ride.messages || []).filter(message => {
      if (message.chatId > 0 || !canRemove(message)) return false;
      if (scope.mode === 'a') return true;
      if (scope.mode === 's') {
        return message.chatId === scope.first &&
          (message.messageThreadId ?? 0) === scope.second;
      }
      return message.chatId === scope.first && message.messageId === scope.second;
    });
  }

  /** Check whether the command itself contains an ID. */
  hasExplicitId(message) {
    const text = message.text || '';
    return /^\/\w+(?:@\w+)?\s+#?\w+/i.test(text.split('\n')[0]) || /(?:^|\n)\s*id\s*:/i.test(text);
  }

  /** Map a direct reply or a Telegram forward to its original message coordinates. */
  resolveMessageReference(message, currentChatId) {
    if (!message) return null;
    const origin = message.forward_origin;
    if (origin) {
      return origin.chat?.id && origin.message_id
        ? { chatId: origin.chat.id, messageId: origin.message_id }
        : null;
    }
    if (message.forward_from_chat) {
      return message.forward_from_message_id
        ? { chatId: message.forward_from_chat.id, messageId: message.forward_from_message_id }
        : null;
    }
    return message.message_id ? { chatId: currentChatId, messageId: message.message_id } : null;
  }

  /** Delete the confirmation prompt and answer its callback. */
  async finish(ctx, message) {
    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.error('Error deleting unshare confirmation:', error);
    }
    await ctx.answerCallbackQuery(message);
  }
}
