/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { createScenarioHarness } from '../../test-setup/scenario-harness.js';
import { t } from '../../i18n/index.js';

process.env.SUPPRESS_JEST_WARNINGS = '1';

const tr = (key, params = {}) => t('en', key, params, { fallbackLanguage: 'en' });

describe('Scenario Harness Integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-10T09:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a ride from inline /newride params and posts the ride message', async () => {
    const harness = await createScenarioHarness();

    await harness.dispatchMessage({
      text: '/newride\ntitle: Sunrise Ride\nwhen: tomorrow 11:00\nmeet: River Park',
      chat: { id: 501, type: 'private' },
      from: { id: 42, first_name: 'Alex', last_name: 'Rider', username: 'alex' },
    });

    const rides = harness.listRides();
    expect(rides).toHaveLength(1);

    const [ride] = rides;
    expect(ride.title).toBe('Sunrise Ride');
    expect(ride.createdBy).toBe(42);
    expect(ride.meetingPoint).toBe('River Park');
    expect(ride.messages).toHaveLength(1);
    expect(ride.participation.joined).toEqual([
      expect.objectContaining({
        userId: 42,
        username: 'alex',
        firstName: 'Alex',
        lastName: 'Rider',
      }),
    ]);

    expect(harness.outbox.replies).toHaveLength(1);
    expect(harness.outbox.replies[0].text).toContain('Sunrise Ride');
    expect(harness.outbox.replies[0].options.parse_mode).toBe('HTML');
    expect(harness.outbox.replies[0].options.reply_markup.inline_keyboard[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: `join:${ride.id}` }),
        expect.objectContaining({ callback_data: `thinking:${ride.id}` }),
        expect.objectContaining({ callback_data: `skip:${ride.id}` }),
      ])
    );
    expect(harness.outbox.replies[0].options.reply_markup.inline_keyboard[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: `rideowner:update:${ride.id}` }),
        expect.objectContaining({ callback_data: `rideowner:duplicate:${ride.id}` }),
        expect.objectContaining({ callback_data: `rideowner:delete:${ride.id}` }),
      ])
    );
    expect(harness.outbox.replies[0].options.reply_markup.inline_keyboard[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: `rideowner:cancel:${ride.id}` }),
        expect.objectContaining({ callback_data: `rideowner:participants:${ride.id}` }),
        expect.objectContaining({ callback_data: `rideowner:settings:${ride.id}` }),
      ])
    );
  });

  it('starts the update wizard from creator owner button callback', async () => {
    const harness = await createScenarioHarness();
    const owner = { id: 42, first_name: 'Alex', last_name: 'Rider', username: 'alex' };
    const chat = { id: 501, type: 'private' };

    await harness.dispatchMessage({
      text: '/newride\ntitle: Sunrise Ride\nwhen: tomorrow 11:00',
      chat,
      from: owner,
    });

    const [ride] = harness.listRides();
    const trackedMessage = ride.messages[0];

    await harness.dispatchCallback({
      data: `rideowner:update:${ride.id}`,
      chat,
      from: owner,
      message: {
        message_id: trackedMessage.messageId,
        text: harness.outbox.replies[0].text,
        chat,
        from: { id: 0, is_bot: true, username: 'testbot' },
      },
    });

    expect(harness.outbox.replies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chatId: chat.id,
          text: expect.stringContaining('Sunrise Ride'),
          options: expect.objectContaining({ parse_mode: 'HTML' }),
        }),
      ])
    );
    expect(harness.outbox.callbackAnswers).toContainEqual({ text: null });
  });

  it('shows participants list and swaps cancel button to resume after owner callback cancellation', async () => {
    const harness = await createScenarioHarness();
    const owner = { id: 88, first_name: 'Ira', last_name: 'Owner', username: 'ira' };
    const guest = { id: 99, first_name: 'Sam', last_name: 'Guest', username: 'sam' };
    const chat = { id: 1201, type: 'private' };

    await harness.dispatchMessage({
      text: '/newride\ntitle: Owner Ride\nwhen: tomorrow 08:00',
      chat,
      from: owner,
    });

    const [ride] = harness.listRides();
    const trackedMessage = ride.messages[0];

    await harness.dispatchCallback({
      data: `join:${ride.id}`,
      chat,
      from: guest,
      message: {
        message_id: trackedMessage.messageId,
        text: harness.outbox.replies[0].text,
        chat,
        from: { id: 0, is_bot: true, username: 'testbot' },
      },
    });

    await harness.dispatchCallback({
      data: `rideowner:participants:${ride.id}`,
      chat,
      from: owner,
      message: {
        message_id: trackedMessage.messageId,
        text: harness.outbox.replies[0].text,
        chat,
        from: { id: 0, is_bot: true, username: 'testbot' },
      },
    });

    expect(harness.outbox.replies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chatId: chat.id,
          text: expect.stringContaining('Sam Guest (@sam)'),
        }),
      ])
    );

    await harness.dispatchCallback({
      data: `rideowner:cancel:${ride.id}`,
      chat,
      from: owner,
      message: {
        message_id: trackedMessage.messageId,
        text: harness.outbox.replies[0].text,
        chat,
        from: { id: 0, is_bot: true, username: 'testbot' },
      },
    });

    const latestEdit = harness.outbox.edits[harness.outbox.edits.length - 1];
    expect(latestEdit.options.reply_markup.inline_keyboard[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: `rideowner:update:${ride.id}` }),
        expect.objectContaining({ callback_data: `rideowner:duplicate:${ride.id}` }),
        expect.objectContaining({ callback_data: `rideowner:delete:${ride.id}` }),
      ])
    );
    expect(latestEdit.options.reply_markup.inline_keyboard[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: `rideowner:resume:${ride.id}` }),
        expect.objectContaining({ callback_data: `rideowner:participants:${ride.id}` }),
        expect.objectContaining({ callback_data: `rideowner:settings:${ride.id}` }),
      ])
    );
  });

  it('handles a join callback through real bot wiring and updates the stored ride message', async () => {
    const harness = await createScenarioHarness();

    await harness.dispatchMessage({
      text: '/newride\ntitle: Coffee Ride\nwhen: tomorrow 08:30',
      chat: { id: 777, type: 'private' },
      from: { id: 10, first_name: 'Mila', last_name: 'Owner', username: 'mila' },
    });

    const [ride] = harness.listRides();
    const trackedMessage = ride.messages[0];

    await harness.dispatchCallback({
      data: `join:${ride.id}`,
      chat: { id: 777, type: 'private' },
      from: { id: 99, first_name: 'Sam', last_name: 'Guest', username: 'sam' },
      message: {
        message_id: trackedMessage.messageId,
        text: harness.outbox.replies[0].text,
        chat: { id: trackedMessage.chatId, type: 'private' },
        from: { id: 0, is_bot: true, username: 'testbot' },
      },
    });

    const updatedRide = harness.getRide(ride.id);
    expect(updatedRide.participation.joined).toHaveLength(2);
    expect(updatedRide.participation.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 10,
          username: 'mila',
          firstName: 'Mila',
          lastName: 'Owner',
        }),
        expect.objectContaining({
          userId: 99,
          username: 'sam',
          firstName: 'Sam',
          lastName: 'Guest',
        }),
      ])
    );

    expect(harness.outbox.edits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          via: 'api.editMessageText',
          chatId: trackedMessage.chatId,
          messageId: trackedMessage.messageId,
          text: expect.stringContaining('Sam'),
        }),
      ])
    );
    expect(harness.outbox.callbackAnswers).toContainEqual({
      text: 'You have joined the ride!',
    });
  });

  it('supports create, update, cancel, and resume through real command wiring', async () => {
    const harness = await createScenarioHarness();
    const owner = { id: 55, first_name: 'Nina', last_name: 'Owner', username: 'nina' };
    const chat = { id: 808, type: 'private' };

    await harness.dispatchMessage({
      text: '/newride\ntitle: Tempo Ride\nwhen: tomorrow 07:30\nmeet: City Hall',
      chat,
      from: owner,
    });

    let [ride] = harness.listRides();
    const trackedMessage = ride.messages[0];

    await harness.dispatchMessage({
      text: `/updateride #${ride.id}\ntitle: Tempo Ride Updated\nmeet: North Gate`,
      chat,
      from: owner,
    });

    ride = harness.getRide(ride.id);
    expect(ride.title).toBe('Tempo Ride Updated');
    expect(ride.meetingPoint).toBe('North Gate');
    expect(harness.outbox.edits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          via: 'api.editMessageText',
          chatId: trackedMessage.chatId,
          messageId: trackedMessage.messageId,
          text: expect.stringContaining('Tempo Ride Updated'),
        }),
      ])
    );
    expect(harness.outbox.replies).toContainEqual(
      expect.objectContaining({
        chatId: chat.id,
        text: tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.updated'),
          count: 1,
        }),
      })
    );

    await harness.dispatchMessage({
      text: `/cancelride #${ride.id}`,
      chat,
      from: owner,
    });

    ride = harness.getRide(ride.id);
    expect(ride.cancelled).toBe(true);
    expect(harness.outbox.replies).toContainEqual(
      expect.objectContaining({
        chatId: chat.id,
        text: tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.cancelled'),
          count: 1,
        }),
      })
    );

    await harness.dispatchMessage({
      text: `/resumeride #${ride.id}`,
      chat,
      from: owner,
    });

    ride = harness.getRide(ride.id);
    expect(ride.cancelled).toBe(false);
    expect(harness.outbox.replies).toContainEqual(
      expect.objectContaining({
        chatId: chat.id,
        text: tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.resumed'),
          count: 1,
        }),
      })
    );
  });

  it('blocks a non-owner from updating another user ride', async () => {
    const harness = await createScenarioHarness();
    const owner = { id: 11, first_name: 'Owner', last_name: 'One', username: 'owner1' };
    const otherUser = { id: 22, first_name: 'Other', last_name: 'User', username: 'other' };
    const chat = { id: 909, type: 'private' };

    await harness.dispatchMessage({
      text: '/newride\ntitle: Private Ride\nwhen: tomorrow 09:15',
      chat,
      from: owner,
    });

    const [ride] = harness.listRides();

    await harness.dispatchMessage({
      text: `/updateride #${ride.id}\ntitle: Hijacked Ride`,
      chat,
      from: otherUser,
    });

    const unchangedRide = harness.getRide(ride.id);
    expect(unchangedRide.title).toBe('Private Ride');
    expect(harness.outbox.replies).toContainEqual(
      expect.objectContaining({
        chatId: chat.id,
        text: tr('commands.update.onlyCreator'),
      })
    );
  });

  it('deletes a ride after confirmation callback and removes tracked messages', async () => {
    const harness = await createScenarioHarness();
    const owner = { id: 77, first_name: 'Dana', last_name: 'Owner', username: 'dana' };
    const chat = { id: 1001, type: 'private' };

    await harness.dispatchMessage({
      text: '/newride\ntitle: Delete Me\nwhen: tomorrow 06:45',
      chat,
      from: owner,
    });

    const [ride] = harness.listRides();
    const trackedMessage = ride.messages[0];

    await harness.dispatchMessage({
      text: `/deleteride #${ride.id}`,
      chat,
      from: owner,
    });

    const confirmationReply = harness.outbox.replies[harness.outbox.replies.length - 1];
    expect(confirmationReply.options.reply_markup.inline_keyboard[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: `delete:confirm:${ride.id}:message` }),
        expect.objectContaining({ callback_data: `delete:cancel:${ride.id}:message` }),
      ])
    );

    await harness.dispatchCallback({
      data: `delete:confirm:${ride.id}:message`,
      chat,
      from: owner,
      message: {
        message_id: confirmationReply.messageId,
        text: confirmationReply.text,
        chat,
        from: { id: 0, is_bot: true, username: 'testbot' },
      },
    });

    expect(harness.getRide(ride.id)).toBeNull();
    expect(harness.outbox.deletes).toContainEqual({
      chatId: trackedMessage.chatId,
      messageId: trackedMessage.messageId,
    });
    expect(harness.outbox.deletes).toContainEqual({
      chatId: chat.id,
      messageId: confirmationReply.messageId,
    });
    expect(harness.outbox.replies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chatId: chat.id,
          text: expect.stringContaining(tr('commands.delete.success')),
        }),
      ])
    );
    expect(harness.outbox.callbackAnswers).toContainEqual({
      text: null,
    });
  });

  it('returns a user-facing error when joining a non-existent ride', async () => {
    const harness = await createScenarioHarness();
    const chat = { id: 1200, type: 'private' };
    const user = { id: 333, first_name: 'Kai', last_name: 'User', username: 'kai' };

    await harness.dispatchCallback({
      data: 'join:missingRideId',
      chat,
      from: user,
      message: {
        message_id: 9999,
        text: 'missing ride message',
        chat,
        from: { id: 0, is_bot: true, username: 'testbot' },
      },
    });

    expect(harness.outbox.callbackAnswers).toContainEqual({
      text: tr('commands.participation.rideNotFound'),
    });
  });
});
