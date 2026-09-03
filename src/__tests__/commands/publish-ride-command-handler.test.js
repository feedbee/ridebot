/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { PublishRideCommandHandler } from '../../commands/PublishRideCommandHandler.js';

describe('PublishRideCommandHandler', () => {
  let handler;
  let rideService;
  let rideMessagesService;
  let ctx;

  beforeEach(() => {
    const currentRide = {
      id: 'ride123',
      createdBy: 42,
      cancelled: false,
      messages: [
        {
          chatId: -1001234567890,
          messageId: 41,
          messageThreadId: 17,
          chatTitle: 'Forum & Friends',
          chatUsername: 'forum_friends',
          isForCreator: false
        },
        {
          chatId: -1001234567890,
          messageId: 42,
          messageThreadId: 17,
          chatTitle: 'Forum & Friends',
          chatUsername: 'forum_friends',
          isForCreator: false
        }
      ]
    };
    rideService = {
      getRide: jest.fn().mockResolvedValue(currentRide),
      getRecentPublicationDestinations: jest.fn().mockResolvedValue([
        {
          chatId: -1001234567890,
          messageId: 91,
          messageThreadId: 17,
          chatTitle: 'Forum & Friends',
          chatUsername: 'forum_friends'
        },
        {
          chatId: -1009876543210,
          messageId: 81,
          chatTitle: 'Road Chat',
          chatUsername: 'road_chat'
        }
      ])
    };
    rideMessagesService = {
      cleanupRideMessagesForScope: jest.fn(async ride => ({ success: true, updatedRide: ride })),
      createRideMessageInTarget: jest.fn().mockResolvedValue({
        sentMessage: { message_id: 100 },
        updatedRide: {
          ...currentRide,
          messages: [
            ...currentRide.messages,
            {
              chatId: -1001234567890,
              messageId: 100,
              messageThreadId: 17,
              chatTitle: 'Forum & Friends',
              chatUsername: 'forum_friends',
              isForCreator: false
            }
          ]
        }
      })
    };
    ctx = {
      chat: { id: 42, type: 'private' },
      from: { id: 42 },
      me: { id: 7, is_bot: true, username: 'ride_test_bot' },
      match: ['rideowner:publish:ride123', 'ride123'],
      api: {
        getChat: jest.fn().mockRejectedValue(new Error('not needed'))
      },
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      reply: jest.fn().mockResolvedValue({ message_id: 55 }),
      replyWithRichMessage: jest.fn().mockResolvedValue({ message_id: 55 }),
      editMessageText: jest.fn().mockResolvedValue(true),
      deleteMessage: jest.fn().mockResolvedValue(true)
    };

    handler = new PublishRideCommandHandler(rideService, {}, rideMessagesService);
  });

  it('shows existing announcements, recent destinations, numbered buttons, and a close row as Rich HTML', async () => {
    await handler.handleMenu(ctx);

    expect(ctx.replyWithRichMessage).toHaveBeenCalledTimes(1);
    const [richMessage, options] = ctx.replyWithRichMessage.mock.calls[0];
    const html = richMessage.html;
    expect(html.startsWith('<h3>Publishing an announcement</h3>')).toBe(true);
    expect(html).toContain(
      '<p>You can publish the announcement in any chat where the bot is present using <code>/shareride@ride_test_bot #ride123</code></p>'
    );
    expect(html).not.toContain('<code>/shareride@ride_test_bot #ride123</code>.');
    expect(html).toContain('<h3>Announcement published in chats:</h3>');
    expect(html).toContain('<ul><li>Forum &amp; Friends / Thread #17 ');
    expect(html).toContain('<a href="https://t.me/forum_friends/17/41">[1]</a>');
    expect(html).toContain('<a href="https://t.me/forum_friends/17/42">[2]</a>');
    expect(html).toContain('<h3>Publish announcement to chats (last 5 publications):</h3>');
    expect(html).toContain('<ol><li>✅ <a href="https://t.me/forum_friends/17">Forum &amp; Friends / Thread #17</a></li>');
    expect(html).toContain('<li><a href="https://t.me/road_chat/81">Road Chat</a></li></ol>');
    expect(html.endsWith(
      '<p>&#160;</p><p><i>Press a button below to publish the announcement in the selected chat. If the announcement is already there, the message will be duplicated.</i></p>'
    )).toBe(true);
    expect(options.reply_markup.inline_keyboard).toEqual([
      [
        expect.objectContaining({ text: '1', callback_data: 'ridepublish:ride123:-1001234567890:17' }),
        expect.objectContaining({ text: '2', callback_data: 'ridepublish:ride123:-1009876543210:main' })
      ],
      [expect.objectContaining({ text: '✖️ Close', callback_data: 'ridepublish:close' })]
    ]);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
  });

  it('shows both empty states and only the close button when there is no publication history', async () => {
    rideService.getRide.mockResolvedValue({ id: 'ride123', createdBy: 42, cancelled: false, messages: [] });
    rideService.getRecentPublicationDestinations.mockResolvedValue([]);

    await handler.handleMenu(ctx);

    const html = ctx.replyWithRichMessage.mock.calls[0][0].html;
    const keyboard = ctx.replyWithRichMessage.mock.calls[0][1].reply_markup.inline_keyboard;
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(html).toContain('<h3>Announcement published in chats:</h3>');
    expect(html).toContain('<ul><li>This announcement has not been published anywhere yet.</li></ul>');
    expect(html).toContain('<h3>Publish announcement to chats (last 5 publications):</h3>');
    expect(html).toContain('<ul><li>You have not published any announcements yet.</li></ul>');
    expect(html).not.toContain('Press a button below');
    expect(keyboard).toEqual([
      [expect.objectContaining({ text: '✖️ Close', callback_data: 'ridepublish:close' })]
    ]);
  });

  it('rejects opening the menu outside a private chat', async () => {
    ctx.chat.type = 'supergroup';

    await handler.handleMenu(ctx);

    expect(rideService.getRide).not.toHaveBeenCalled();
    expect(ctx.replyWithRichMessage).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.any(String));
  });

  it('returns menu access errors through the callback without sending a chat message', async () => {
    ctx.from.id = 99;

    await handler.handleMenu(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.any(String));
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('publishes only to a destination from the current recent list', async () => {
    ctx.match = ['ridepublish:ride123:-1001234567890:17', 'ride123', '-1001234567890', '17'];

    await handler.handlePublish(ctx);

    expect(rideMessagesService.cleanupRideMessagesForScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ride123' }),
      ctx,
      -1001234567890,
      17,
      expect.any(Number)
    );
    expect(rideMessagesService.createRideMessageInTarget).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ride123' }),
      ctx,
      expect.objectContaining({ chatId: -1001234567890, messageThreadId: 17, publishedBy: 42 })
    );
    expect(ctx.deleteMessage).not.toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('https://t.me/forum_friends/17/100') }),
      expect.objectContaining({ reply_markup: expect.any(Object) })
    );
  });

  it('reloads and reorders recent destinations after publishing', async () => {
    const forum = {
      chatId: -1001234567890,
      messageId: 91,
      messageThreadId: 17,
      chatTitle: 'Forum & Friends',
      chatUsername: 'forum_friends'
    };
    const road = {
      chatId: -1009876543210,
      messageId: 81,
      chatTitle: 'Road Chat',
      chatUsername: 'road_chat'
    };
    rideService.getRecentPublicationDestinations
      .mockResolvedValueOnce([forum, road])
      .mockResolvedValueOnce([road, forum]);
    ctx.match = ['ridepublish:ride123:-1001234567890:17', 'ride123', '-1001234567890', '17'];

    await handler.handlePublish(ctx);

    expect(rideService.getRecentPublicationDestinations).toHaveBeenCalledTimes(2);
    const editedKeyboard = ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
    expect(editedKeyboard[0][0]).toEqual(expect.objectContaining({
      text: '1',
      callback_data: 'ridepublish:ride123:-1009876543210:main'
    }));
  });

  it('rejects publishing outside a private chat', async () => {
    ctx.chat.type = 'supergroup';
    ctx.match = ['ridepublish:ride123:-1001234567890:17', 'ride123', '-1001234567890', '17'];

    await handler.handlePublish(ctx);

    expect(rideService.getRide).not.toHaveBeenCalled();
    expect(rideMessagesService.createRideMessageInTarget).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.any(String));
  });

  it('rejects a forged destination callback', async () => {
    ctx.match = ['ridepublish:ride123:-100999:main', 'ride123', '-100999', 'main'];

    await handler.handlePublish(ctx);

    expect(rideMessagesService.createRideMessageInTarget).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.any(String));
  });

  it('rejects another user even when the callback contains a valid destination', async () => {
    ctx.from.id = 99;
    ctx.match = ['ridepublish:ride123:-1001234567890:17', 'ride123', '-1001234567890', '17'];

    await handler.handlePublish(ctx);

    expect(rideMessagesService.createRideMessageInTarget).not.toHaveBeenCalled();
  });

  it('closes the menu with the standard private close action', async () => {
    await handler.handleClose(ctx);

    expect(ctx.deleteMessage).toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
  });
});
