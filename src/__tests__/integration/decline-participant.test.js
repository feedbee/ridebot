import { jest } from '@jest/globals';
import { setImmediate as realSetImmediate } from 'node:timers';
import { createScenarioHarness } from '../../test-setup/scenario-harness.js';

process.env.SUPPRESS_JEST_WARNINGS = '1';

const owner = { id: 42, first_name: 'Owner', username: 'owner' };
const guest = { id: 77, first_name: 'Guest <&>', last_name: 'Rider', username: 'guest' };
const chat = { id: 42, type: 'private' };

async function setup(moderated = false) {
  const h = await createScenarioHarness();
  await h.dispatchMessage({ text: `/newride\ntitle: Ride\nwhen: tomorrow 11:00\nsettings.requireParticipationApproval: ${moderated ? 'yes' : 'no'}`, from: owner, chat });
  const [ride] = h.listRides();
  await h.dispatchCallback({ data: `join:${ride.id}`, from: guest, chat });
  return { h, ride };
}

function source(menu) {
  return { message_id: menu.messageId, chat, text: menu.text, from: { id: 0, is_bot: true } };
}

describe('Decline participant command', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-10T09:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it.each([false, true])('declines a participant and allows rejoining (moderated: %s)', async (moderated) => {
    const { h, ride } = await setup(moderated);
    const ctx = await h.dispatchMessage({ text: `/declineparticipant #${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    expect(menu.options.reply_markup.inline_keyboard.flat()).toContainEqual({ text: `${moderated ? '📝' : '🚴'} Guest <&> Rider (@guest)`, url: 'tg://user?id=77' });
    expect(h.outbox.deletes).not.toContainEqual({ chatId: chat.id, messageId: ctx.message.message_id });
    await h.dispatchCallback({ data: `decline:user:${ride.id}:77`, from: owner, chat, message: source(menu) });
    expect(h.getRide(ride.id).participation.skipped).toContainEqual(expect.objectContaining({ userId: 77, username: 'guest' }));
    expect(h.outbox.replies.filter(r => r.chatId === guest.id)).toEqual([expect.objectContaining({ text: expect.stringMatching(/participation.*cancelled by the ride creator/i) })]);
    expect(h.outbox.deletes).not.toContainEqual({ chatId: chat.id, messageId: menu.messageId });
    expect(h.outbox.edits.at(-1).messageId).toBe(menu.messageId);
    expect(h.outbox.edits.at(-1).options.reply_markup.inline_keyboard.flat().some(b => b.url === 'tg://user?id=77')).toBe(false);
    expect(h.outbox.callbackAnswers.at(-1).text).toBe('Participant excluded');
    expect(h.outbox.edits.some(edit => edit.messageId === ride.messages[0].messageId)).toBe(true);
    await h.dispatchCallback({ data: `join:${ride.id}`, from: guest, chat });
    expect(h.getRide(ride.id).participation[moderated ? 'thinking' : 'joined']).toContainEqual(expect.objectContaining({ userId: 77 }));
  });

  it('paginates 20 participants per message and closes without changing participation', async () => {
    const { h, ride } = await setup();
    for (let i = 100; i < 139; i++) await h.storage.setParticipation(ride.id, 'joined', { userId: i, firstName: `Rider ${i}`, lastName: '' });
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    const buttons = menu.options.reply_markup.inline_keyboard.flat();
    expect(buttons.filter(b => b.url)).toHaveLength(20);
    expect(buttons.length).toBeLessThanOrEqual(44);
    await h.dispatchCallback({ data: `decline:page:${ride.id}:1`, from: owner, chat, message: source(menu) });
    expect(h.outbox.edits.at(-1)).toMatchObject({ messageId: menu.messageId });
    const middleButtons = h.outbox.edits.at(-1).options.reply_markup.inline_keyboard.flat();
    expect(middleButtons.filter(b => b.url)).toHaveLength(20);
    expect(middleButtons).toHaveLength(44);
    await h.dispatchCallback({ data: `decline:page:${ride.id}:2`, from: owner, chat, message: source(menu) });
    expect(h.outbox.edits.at(-1).options.reply_markup.inline_keyboard.flat().filter(b => b.url)).toHaveLength(1);
    await h.dispatchCallback({ data: `decline:close:${ride.id}`, from: owner, chat, message: source(menu) });
    expect(h.outbox.deletes).toContainEqual({ chatId: chat.id, messageId: menu.messageId });
    expect(h.getRide(ride.id).participation.joined).toHaveLength(41);
  });

  it('checks ownership on command, selection, pagination and close', async () => {
    const { h, ride } = await setup();
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    const deleteCount = h.outbox.deletes.length;
    const editCount = h.outbox.edits.length;
    for (const data of [`decline:user:${ride.id}:77`, `decline:page:${ride.id}:1`, `decline:close:${ride.id}`]) {
      await h.dispatchCallback({ data, from: guest, chat, message: source(menu) });
      expect(h.outbox.callbackAnswers.at(-1).text).toMatch(/creator/i);
    }
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: guest, chat });
    expect(h.outbox.replies.at(-1).text).toMatch(/creator/i);
    expect(h.outbox.deletes).toHaveLength(deleteCount);
    expect(h.outbox.edits).toHaveLength(editCount);
    expect(h.getRide(ride.id).participation.joined).toContainEqual(expect.objectContaining({ userId: 77 }));
  });

  it('supports replying to an announcement in a group', async () => {
    const { h, ride } = await setup();
    const group = { id: -42, type: 'supergroup' };
    await h.dispatchMessage({ text: '/declineparticipant', from: owner, chat: group, replyToMessage: { text: `🎫 #Ride #${ride.id}` } });
    expect(h.outbox.replies.at(-1).options.reply_markup.inline_keyboard.flat()).toContainEqual(expect.objectContaining({ callback_data: `decline:user:${ride.id}:77:0` }));
  });

  it('does not repeat a decline or add an unknown participant', async () => {
    const { h, ride } = await setup();
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    const click = id => h.dispatchCallback({ data: `decline:user:${ride.id}:${id}`, from: owner, chat, message: source(menu) });
    await click(77);
    const announcementEdits = h.outbox.edits.filter(edit => edit.messageId !== menu.messageId).length;
    await click(77);
    await click(999);
    expect(h.outbox.edits.filter(edit => edit.messageId !== menu.messageId)).toHaveLength(announcementEdits);
    expect(h.getRide(ride.id).participation.skipped).toHaveLength(1);
  });

  it('reports a completed decline if menu or announcement updates fail', async () => {
    const { h, ride } = await setup();
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    const handler = h.bot.botConfig.callbacks.find(c => c.pattern.test(`decline:user:${ride.id}:77`));
    const ctx = await h.dispatchMessage({ text: '/noop', from: owner, chat });
    ctx.callbackQuery = { data: `decline:user:${ride.id}:77`, message: source(menu), from: owner };
    ctx.match = ctx.callbackQuery.data.match(handler.pattern);
    ctx.api.editMessageText.mockRejectedValue({ description: 'Temporary failure' });
    ctx.api.deleteMessage.mockRejectedValue({ description: 'Cannot delete' });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await handler.handler(ctx);
      expect(h.getRide(ride.id).participation.skipped).toContainEqual(expect.objectContaining({ userId: 77 }));
      expect(ctx.api.deleteMessage).not.toHaveBeenCalled();
      expect(h.outbox.callbackAnswers.at(-1).text).toMatch(/excluded.*failed/i);
    } finally {
      log.mockRestore(); warn.mockRestore();
    }
  });

  it('omits skipped participants and renders an empty menu after the last participant leaves', async () => {
    const { h, ride } = await setup();
    await h.storage.setParticipation(ride.id, 'skipped', { userId: 90, firstName: 'Skipped' });
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    expect(menu.options.reply_markup.inline_keyboard.flat().some(b => b.url === 'tg://user?id=90')).toBe(false);
    await h.storage.setParticipation(ride.id, 'skipped', { userId: 42, firstName: 'Owner' });
    await h.storage.setParticipation(ride.id, 'skipped', { userId: 77, firstName: 'Guest' });
    await h.dispatchCallback({ data: `decline:page:${ride.id}:999`, from: owner, chat, message: source(menu) });
    expect(h.outbox.edits.at(-1).options.reply_markup.inline_keyboard.flat()).toHaveLength(1);
    expect(h.outbox.edits.at(-1).text).toMatch(/No active participants/);
  });


  it.each([false, true])('excludes multiple users without reopening the menu (moderated: %s)', async moderated => {
    const { h, ride } = await setup(moderated);
    await h.storage.setParticipation(ride.id, 'thinking', { userId: 88, firstName: 'Other' });
    await h.storage.setParticipation(ride.id, 'skipped', { userId: 99, firstName: 'Skipped' });
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    expect(menu.options.reply_markup.inline_keyboard.flat()).toContainEqual({ text: `${moderated ? '📝' : '🤔'} Other`, url: 'tg://user?id=88' });
    expect(menu.options.reply_markup.inline_keyboard.flat()).toContainEqual({ text: '🚴 Owner (@owner)', url: 'tg://user?id=42' });
    const replies = h.outbox.replies.length;
    for (const id of [77, 88, 42]) {
      await h.dispatchCallback({ data: `decline:user:${ride.id}:${id}:0`, from: owner, chat, message: source(menu) });
      const buttons = h.outbox.edits.at(-1).options.reply_markup.inline_keyboard;
      expect(h.outbox.edits.at(-1).messageId).toBe(menu.messageId);
      expect(buttons.flat().some(b => b.url === `tg://user?id=${id}`)).toBe(false);
      expect(buttons.at(-1)).toEqual([{ text: '✖️ Close', callback_data: `decline:close:${ride.id}` }]);
      expect(h.outbox.deletes).not.toContainEqual({ chatId: chat.id, messageId: menu.messageId });
    }
    expect(h.outbox.edits.at(-1).options.reply_markup.inline_keyboard.flat()).toHaveLength(1);
    // Moderated pending declines may notify applicants, but never create another menu.
    expect(h.outbox.replies.slice(replies).some(r => r.options.reply_markup)).toBe(false);
    await h.dispatchCallback({ data: `decline:close:${ride.id}`, from: owner, chat, message: source(menu) });
    expect(h.outbox.deletes).toContainEqual({ chatId: chat.id, messageId: menu.messageId });
  });

  it('keeps the current page after exclusion and falls back when the last page disappears', async () => {
    const { h, ride } = await setup();
    for (let id = 100; id < 140; id++) await h.storage.setParticipation(ride.id, 'joined', { userId: id, firstName: `Rider ${id}` });
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    await h.dispatchCallback({ data: `decline:page:${ride.id}:2`, from: owner, chat, message: source(menu) });
    for (let count = 0; count < 2; count++) {
      const button = h.outbox.edits.at(-1).options.reply_markup.inline_keyboard.flat().find(b => b.callback_data?.startsWith('decline:user:'));
      expect(button.callback_data).toMatch(/:2$/);
      await h.dispatchCallback({ data: button.callback_data, from: owner, chat, message: source(menu) });
    }
    const rows = h.outbox.edits.at(-1).options.reply_markup.inline_keyboard;
    expect(rows.at(-2).some(b => b.text === '2 / 2')).toBe(true);
    expect(rows.at(-1)[0].callback_data).toBe(`decline:close:${ride.id}`);
    expect(rows.flat().filter(b => b.url)).toHaveLength(20);
  });


  it('deactivates the menu when Telegram refuses to delete it on close', async () => {
    const { h, ride } = await setup();
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    const handler = h.bot.botConfig.callbacks.find(c => c.pattern.test(`decline:close:${ride.id}`));
    const ctx = await h.dispatchMessage({ text: '/noop', from: owner, chat });
    ctx.callbackQuery = { data: `decline:close:${ride.id}`, message: source(menu), from: owner };
    ctx.match = ctx.callbackQuery.data.match(handler.pattern);
    ctx.api.deleteMessage.mockRejectedValue({ description: 'Cannot delete' });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await handler.handler(ctx);
      expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({ reply_markup: { inline_keyboard: [] } });
      expect(h.getRide(ride.id).participation.joined).toHaveLength(2);
    } finally {
      log.mockRestore();
    }
  });


  it('completes exclusion and refreshes the menu when the participant cannot receive the DM', async () => {
    const { h, ride } = await setup();
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    const handler = h.bot.botConfig.callbacks.find(c => c.pattern.test(`decline:user:${ride.id}:77:0`));
    const ctx = await h.dispatchMessage({ text: '/noop', from: owner, chat });
    ctx.callbackQuery = { data: `decline:user:${ride.id}:77:0`, message: source(menu), from: owner };
    ctx.match = ctx.callbackQuery.data.match(handler.pattern);
    ctx.api.sendMessage.mockRejectedValue({ error_code: 403, description: 'Bot cannot initiate conversation' });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await handler.handler(ctx);
      expect(ctx.api.sendMessage).toHaveBeenCalledWith(77, expect.stringMatching(/cancelled by the ride creator/), { parse_mode: 'HTML' });
      expect(h.getRide(ride.id).participation.skipped).toContainEqual(expect.objectContaining({ userId: 77 }));
      expect(h.outbox.edits.at(-1).messageId).toBe(menu.messageId);
      expect(h.outbox.callbackAnswers.at(-1).text).toBe('Participant excluded');
    } finally {
      log.mockRestore();
    }
  });


  it.each(['notification', 'announcement', 'rejoin'])('keeps announcements current when overlapping exclusions delay %s delivery', async stage => {
    const { h, ride } = await setup();
    await h.storage.setParticipation(ride.id, 'joined', { userId: 88, firstName: 'Other' });
    // Mongo returns independent snapshots; memory's shared arrays hide stale renders.
    const write = h.storage.setParticipationForRideMode.bind(h.storage);
    jest.spyOn(h.storage, 'setParticipationForRideMode').mockImplementation(async (...args) =>
      structuredClone(await write(...args)));
    await h.dispatchMessage({ text: `/declineparticipant ${ride.id}`, from: owner, chat });
    const menu = h.outbox.replies.at(-1);
    const handler = h.bot.botConfig.callbacks.find(c => c.pattern.test(`decline:user:${ride.id}:77:0`));
    const first = await h.dispatchMessage({ text: '/noop', from: owner, chat });
    first.callbackQuery = { data: `decline:user:${ride.id}:77:0`, message: source(menu), from: owner };
    first.match = first.callbackQuery.data.match(handler.pattern);
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const method = stage === 'notification' ? 'sendMessage' : 'editMessageText';
    const deliver = first.api[method].getMockImplementation();
    first.api[method].mockImplementation(async (...args) => {
      const shouldDelay = stage === 'notification' ? args[0] === guest.id : args[1] === ride.messages[0].messageId;
      if (shouldDelay) { entered(); await gate; }
      return deliver(...args);
    });
    const pending = handler.handler(first);
    await started;
    const second = stage === 'rejoin'
      ? h.dispatchCallback({ data: `join:${ride.id}`, from: guest, chat })
      : h.dispatchCallback({ data: `decline:user:${ride.id}:88:0`, from: owner, chat, message: source(menu) });
    if (stage === 'notification') await second;
    else await new Promise(resolve => realSetImmediate(resolve));
    release();
    await Promise.all([pending, second]);
    expect(h.getRide(ride.id).participation.joined.map(p => p.userId)).toEqual(stage === 'rejoin' ? [42, 88, 77] : [42]);
    const lastAnnouncement = h.outbox.edits.filter(edit => edit.messageId === ride.messages[0].messageId).at(-1);
    if (stage === 'rejoin') {
      expect(lastAnnouncement.text).toContain('tg://user?id=77');
      expect(lastAnnouncement.text).toContain('tg://user?id=88');
    } else {
      expect(lastAnnouncement.text).not.toContain('tg://user?id=77');
      expect(lastAnnouncement.text).not.toContain('tg://user?id=88');
      expect(h.outbox.edits.at(-1).options.reply_markup.inline_keyboard.flat().filter(b => b.url)).toHaveLength(1);
    }
  });

});
