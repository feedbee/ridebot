import { jest } from '@jest/globals';
import { createScenarioHarness } from '../../test-setup/scenario-harness.js';

describe('pace groups through real bot wiring', () => {
  const owner = { id: 42, first_name: 'Owner', language_code: 'en' };
  const guest = { id: 77, first_name: 'Guest', language_code: 'en' };
  const chat = { id: 42, type: 'private' };
  let harness;
  const message = text => harness.dispatchMessage({ text, from: owner, chat });
  const act = (data, from = guest) => harness.dispatchCallback({ data, from, chat });
  const member = (ride, state = 'joined') => harness.getRide(ride.id).participation[state].find(p => p.userId === guest.id);
  beforeEach(async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-03T09:00:00Z'));
    harness = await createScenarioHarness();
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
  const create = async extra => {
    await message(`/newride\ntitle: Groups\nwhen: tomorrow 10:00\nspeed: 20-28\ncruisingSpeed: 30\ncruisingSpeed: 25\n${extra || 'cruisingSpeed: 20'}`);
    return harness.listRides()[0];
  };

  it('creates a second button row, groups both statuses, changes and clears selections', async () => {
    const ride = await create();
    const announcement = harness.outbox.replies.find(reply => reply.messageId === ride.messages[0].messageId);
    expect(announcement.options.reply_markup.inline_keyboard[1].map(button => button.text)).toEqual(['A', 'B', 'C']);
    expect(announcement.richMessage.html).toContain('<ul><li>A: ~30 km/h</li>');
    expect(announcement.richMessage.html).not.toContain('<br><ul>');
    await act(`pacegroup:${ride.id}:B`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('First join');
    await act(`thinking:${ride.id}`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('Choose a pace group');
    await act(`pacegroup:${ride.id}:A`);
    expect(member(ride, 'thinking').paceGroup).toBe('A');
    await act(`join:${ride.id}`);
    expect(member(ride).paceGroup).toBe('A');
    await act(`pacegroup:${ride.id}:B`);
    expect(member(ride).paceGroup).toBe('B');
    expect(harness.outbox.edits.at(-1).text).toContain('B (1):');
    await message(`/listparticipants ${ride.id}`);
    expect(harness.outbox.replies.at(-1).text).toContain('B (1):');
    expect(harness.outbox.replies.at(-1).richMessage.html).toContain('<li>B (1):');
    await act(`skip:${ride.id}`); await act(`join:${ride.id}`);
    expect(member(ride).paceGroup).toBeUndefined();
    expect(harness.outbox.edits.at(-1).text).toContain('Without a Group (2):');
  });

  it('keeps a pending applicant group on acceptance and permits a free group change at capacity', async () => {
    const ride = await create('settings.requireParticipationApproval: yes\nsettings.participantLimit: 2');
    await act(`pacegroup:${ride.id}:B`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('First apply');
    await act(`apply:${ride.id}`);
    await act(`pacegroup:${ride.id}:B`);
    const before = harness.outbox.replies.length;
    await act(`application:accept:${ride.id}:77`, owner);
    expect(member(ride).paceGroup).toBe('B');
    await act(`pacegroup:${ride.id}:A`);
    expect(member(ride).paceGroup).toBe('A');
    expect(harness.outbox.replies.length).toBe(before + 1); // only the existing decision notification
    expect(harness.getRide(ride.id).participation.thinking).toHaveLength(0);
  });

  it('rejects excessive lists, updates existing letters, and duplicates without selections', async () => {
    const ride = await create();
    await act(`join:${ride.id}`); await act(`pacegroup:${ride.id}:C`);
    await message(`/updateride ${ride.id}\ncruisingSpeed: 35\ncruisingSpeed: 30`);
    expect(member(ride).paceGroup).toBeUndefined();
    await act(`pacegroup:${ride.id}:C`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('no longer available');
    await message(`/dupride ${ride.id}\nwhen: 2026-10-06T10:00:00Z`);
    const copy = harness.listRides().find(other => other.id !== ride.id);
    expect(copy.cruisingSpeedGroups).toEqual([{ min: 35, max: 35 }, { min: 30, max: 30 }]);
    expect(copy.participation.joined.map(p => p.userId)).toEqual([owner.id]);
    await message(`/newride\ntitle: Invalid\nwhen: tomorrow 10:00\n${Array(6).fill('speed: 25').join('\n')}`);
    expect(harness.listRides()).toHaveLength(2);
    expect(harness.outbox.replies.at(-1).text).toContain('five');
  });

  it('creates groups from multiline wizard input and preserves them on an edit with Keep', async () => {
    await message('/newride'); await message('Wizard Groups');
    await act('wizard:skip', owner); // category
    await act('wizard:skip', owner); // organizer
    await message('tomorrow 10:00');
    for (let index = 0; index < 3; index++) await act('wizard:skip', owner); // route, distance, duration
    await message('30\n25');
    expect(harness.outbox.edits.some(edit => edit.text?.includes('B: ~25 km/h'))).toBe(true);
    expect(harness.outbox.edits.some(edit => edit.richMessage?.html?.includes('<li>B: ~25 km/h</li>'))).toBe(true);
    await message('35\n30\n20');
    for (let index = 0; index < 3; index++) await act('wizard:skip', owner); // meet, chat, info
    await act('wizard:confirm', owner);
    const ride = harness.listRides()[0];
    expect(ride.speedGroups).toHaveLength(2); expect(ride.cruisingSpeedGroups).toHaveLength(3);
    await message(`/updateride ${ride.id}`);
    for (let index = 0; index < 7; index++) await act('wizard:keep', owner);
    expect(harness.outbox.edits.at(-1).richMessage.html).toContain('<li>B: ~25 km/h</li>');
    await act('wizard:keep', owner);
    expect(harness.outbox.edits.at(-1).richMessage.html).toContain('<li>C: ~20 km/h</li>');
    for (let index = 0; index < 4; index++) await act('wizard:keep', owner);
    await act('wizard:confirm', owner);
    expect(harness.getRide(ride.id).speedGroups).toEqual(ride.speedGroups);
    expect(harness.getRide(ride.id).cruisingSpeedGroups).toEqual(ride.cruisingSpeedGroups);
  });

  it('shows and saves AI arrays, then refuses malformed AI output without partial persistence', async () => {
    const { AiRideService } = await import('../../services/AiRideService.js');
    const parse = jest.spyOn(AiRideService.prototype, 'parseRideText').mockResolvedValue({ params: {
      title: 'AI Groups', when: 'tomorrow 10:00', speed: ['25', '20'], cruisingSpeed: '30'
    }, error: null });
    await message('/airide two groups');
    expect(harness.outbox.replies.at(-1).text).toContain('B: ~20 km/h');
    expect(harness.outbox.replies.at(-1).richMessage.html).toContain('<li>B: ~20 km/h</li>');
    await act('airide:confirm:42:42', owner);
    expect(harness.listRides()[0].speedGroups).toHaveLength(2);
    parse.mockResolvedValue({ params: { title: 'Invalid', when: 'tomorrow 10:00', speed: ['25', 'fast'] }, error: null });
    await message('/airide invalid groups');
    expect(harness.outbox.replies.at(-1).text).toContain('element 2');
    await act('airide:confirm:42:42', owner);
    expect(harness.listRides()).toHaveLength(1);
  });

  it('imports the first five Strava groups in source order', async () => {
    const { StravaEventParser } = await import('../../utils/strava-event-parser.js');
    jest.spyOn(StravaEventParser, 'fetchEvent').mockResolvedValue({ id: 2, title: 'Imported',
      start_datetime: '2026-10-04T10:00:00Z', pace_type: 'speed',
      pace_groups: [35, 30, 25, 20, 15, 10].map(pace => ({ pace, range: 1 })) });
    await message('/fromstrava https://www.strava.com/clubs/1/group_events/2');
    const ride = harness.listRides()[0];
    expect(ride.cruisingSpeedGroups.map(speed => speed.min)).toEqual([34, 29, 24, 19, 14]);
    expect(ride.additionalInfo).not.toContain('Pace groups:');
    expect(harness.outbox.replies.find(reply => reply.messageId === ride.messages[0].messageId).text).toContain('E: 14-16 km/h');
  });

  it('propagates selections to every tracked announcement and retains selection on a transient edit error', async () => {
    const ride = await create();
    await harness.dispatchMessage({ text: `/shareride ${ride.id}`, from: owner, chat: { id: -500, type: 'group' } });
    await act(`join:${ride.id}`);
    const tracked = harness.getRide(ride.id).messages.map(item => item.messageId);
    expect(tracked.length).toBeGreaterThan(1);
    const start = harness.outbox.edits.length;
    await act(`pacegroup:${ride.id}:A`);
    for (const id of tracked) {
      expect(harness.outbox.edits.slice(start)).toContainEqual(expect.objectContaining({ messageId: id, text: expect.stringContaining('A (1):') }));
    }
    harness.runtime.middlewares.push(async (ctx, next) => {
      if (ctx.callbackQuery?.data === `pacegroup:${ride.id}:B`) {
        ctx.api.editMessageText.mockRejectedValueOnce(new Error('Temporary transport failure'));
      }
      await next();
    });
    const logger = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(`pacegroup:${ride.id}:B`);
    expect(member(ride).paceGroup).toBe('B');
    expect(harness.getRide(ride.id).messages.map(item => item.messageId)).toEqual(tracked);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('message');
    logger.mockRestore();
  });
});
