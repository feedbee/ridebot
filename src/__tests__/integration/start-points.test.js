import { jest } from '@jest/globals';
import { createScenarioHarness } from '../../test-setup/scenario-harness.js';

describe('starting points through real bot wiring', () => {
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
  const create = async (extra = '') => {
    await message(`/newride\ntitle: Starts\nwhen: tomorrow 10:00\nmeet: Park\nmeet: Square\n${extra}`.trim());
    return harness.listRides()[0];
  };

  it('shows a separate row, requires participation, preserves choices and displays suffixes without pace groups', async () => {
    const ride = await create();
    expect(ride.meetingPoints).toEqual(['Park', 'Square']);
    const announcement = harness.outbox.replies.find(reply => reply.messageId === ride.messages[0].messageId);
    expect(announcement.options.reply_markup.inline_keyboard[1].map(button => button.text)).toEqual(['S1', 'S2']);
    expect(announcement.richMessage.html).toContain('Meeting point:</p><ul><li>S1: Park</li><li>S2: Square</li></ul>');
    await act(`startpoint:${ride.id}:S2`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('First join');
    await act(`thinking:${ride.id}`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('Choose a starting point');
    await act(`startpoint:${ride.id}:S2`);
    await act(`join:${ride.id}`);
    expect(member(ride).startPoint).toBe('S2');
    expect(harness.outbox.edits.at(-1).text).toContain('[S2]');
    await message(`/listparticipants ${ride.id}`);
    expect(harness.outbox.replies.at(-1).text).toContain('[S2]');
    await act(`skip:${ride.id}`); await act(`join:${ride.id}`);
    expect(member(ride).startPoint).toBeUndefined();
  });

  it('combines missing-choice prompts and retains start points through approval with pace groups', async () => {
    const ride = await create('speed: 20\nspeed: 25\nsettings.requireParticipationApproval: yes');
    const announcement = harness.outbox.replies.find(reply => reply.messageId === ride.messages[0].messageId);
    expect(announcement.options.reply_markup.inline_keyboard[1].map(button => button.text)).toEqual(['A', 'B']);
    expect(announcement.options.reply_markup.inline_keyboard[2].map(button => button.text)).toEqual(['S1', 'S2']);
    await act(`apply:${ride.id}`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('Choose a starting point and a pace group');
    await act(`startpoint:${ride.id}:S1`); await act(`pacegroup:${ride.id}:B`);
    await act(`application:accept:${ride.id}:77`, owner);
    expect(member(ride).startPoint).toBe('S1');
    expect(member(ride).paceGroup).toBe('B');
    expect(harness.outbox.edits.at(-1).text).toContain('[S1]');
    await act(`startpoint:${ride.id}:S2`);
    expect(member(ride).startPoint).toBe('S2');
  });

  it('clears removed positions, hides scalar selections and duplicates meeting data', async () => {
    const ride = await create('meet: Station');
    await act(`join:${ride.id}`); await act(`startpoint:${ride.id}:S3`);
    await message(`/updateride ${ride.id}\nmeet: New Park\nmeet: Square`);
    expect(member(ride).startPoint).toBeUndefined();
    await act(`startpoint:${ride.id}:S1`);
    await message(`/dupride ${ride.id}\nwhen: 2026-10-06T10:00:00Z`);
    const copy = harness.listRides().find(other => other.id !== ride.id);
    expect(copy.meetingPoints).toEqual(['New Park', 'Square']);
    expect(copy.participation.joined.every(person => !person.startPoint)).toBe(true);
    await message(`/updateride ${ride.id}\nmeet: Only Park`);
    expect(member(ride).startPoint).toBeUndefined();
    expect(harness.outbox.edits.at(-1).text).not.toContain('[S1]');
    await act(`startpoint:${ride.id}:S1`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('no longer available');
  });

  it('rejects excessive repeated parameters without creating a ride', async () => {
    await message(`/newride\ntitle: Invalid\nwhen: tomorrow 10:00\n${Array(6).fill('meet: Park').join('\n')}`);
    expect(harness.listRides()).toHaveLength(0);
    expect(harness.outbox.replies.at(-1).text).toContain('five');
  });
  it('parses marked multiline wizard input and keeps points during later editing', async () => {
    await message('/newride'); await message('Wizard Starts');
    await act('wizard:skip', owner); await act('wizard:skip', owner);
    await message('tomorrow 10:00');
    for (let index = 0; index < 5; index++) await act('wizard:skip', owner);
    await message('s6: Park\nNorth gate\nS1: Square');
    expect(harness.outbox.edits.some(edit => edit.richMessage?.html?.includes('<li>S1: Square</li><li>S2: Park<br>North gate</li>'))).toBe(true);
    await act('wizard:skip', owner); await act('wizard:skip', owner);
    await act('wizard:confirm', owner);
    const ride = harness.listRides()[0];
    expect(ride.meetingPoints).toEqual(['Square', 'Park\nNorth gate']);
    await act(`join:${ride.id}`); await act(`startpoint:${ride.id}:S2`);
    await message(`/updateride ${ride.id}`);
    for (let index = 0; index < 12; index++) await act('wizard:keep', owner);
    await act('wizard:confirm', owner);
    expect(harness.getRide(ride.id).meetingPoints).toEqual(ride.meetingPoints);
    expect(member(ride).startPoint).toBe('S2');
  });

  it('supports AI arrays in previews and saves, rejecting excessive arrays', async () => {
    const { AiRideService } = await import('../../services/AiRideService.js');
    const parse = jest.spyOn(AiRideService.prototype, 'parseRideText').mockResolvedValue({ params: {
      title: 'AI Starts', when: 'tomorrow 10:00', meet: ['Park\nGate', 'Square']
    }, error: null });
    await message('/airide two starting points');
    expect(harness.outbox.replies.at(-1).richMessage.html).toContain('<li>S2: Square</li>');
    await act('airide:confirm:42:42', owner);
    expect(harness.listRides()[0].meetingPoints).toEqual(['Park\nGate', 'Square']);
    parse.mockResolvedValue({ params: { title: 'Invalid', when: 'tomorrow 10:00', meet: Array(6).fill('Park') }, error: null });
    await message('/airide too many starting points');
    expect(harness.outbox.replies.at(-1).text).toContain('five');
    await act('airide:confirm:42:42', owner);
    expect(harness.listRides()).toHaveLength(1);
  });

  it('preserves plain multiline wizard text and removes a lone marker from display', async () => {
    const { getWizardFields } = await import('../../wizard/wizardFieldConfig.js');
    const { MessageFormatter } = await import('../../formatters/MessageFormatter.js');
    const fields = getWizardFields('en');
    expect(fields.meet.validator('Intro\nS1: Park').value).toBe('Intro\nS1: Park');
    const formatter = new MessageFormatter();
    const { normalizeMeetingFields } = await import('../../utils/start-points.js');
    const text = formatter.formatRidePreview({ title: 'Solo', ...normalizeMeetingFields({ meetingPoint: 'S99: Park\nGate' }) }, 'en');
    expect(text).toContain('Park');
    expect(text).not.toContain('S99:');
    expect(text).not.toContain('<ul>');
  });

  it('propagates changed choices to shared announcements without sending notifications', async () => {
    const ride = await create();
    await harness.dispatchMessage({ text: `/shareride ${ride.id}`, from: owner, chat: { id: -500, type: 'group' } });
    await act(`join:${ride.id}`);
    const tracked = harness.getRide(ride.id).messages.map(item => item.messageId);
    const repliesBefore = harness.outbox.replies.length;
    const editsBefore = harness.outbox.edits.length;
    await act(`startpoint:${ride.id}:S2`);
    expect(harness.outbox.replies).toHaveLength(repliesBefore);
    for (const id of tracked) {
      expect(harness.outbox.edits.slice(editsBefore)).toContainEqual(expect.objectContaining({
        messageId: id, text: expect.stringContaining('[S2]')
      }));
    }
    await act(`startpoint:${ride.id}:S2`);
    expect(harness.outbox.callbackAnswers.at(-1).text).toContain('already selected');
  });

  it('prompts an accepted applicant for both choices and clears rejected applicants', async () => {
    const ride = await create('speed: 20\nspeed: 25\nsettings.requireParticipationApproval: yes');
    await act(`apply:${ride.id}`);
    await act(`application:accept:${ride.id}:77`, owner);
    expect(harness.outbox.replies.at(-1).text).toContain('Choose a starting point and a pace group');
    await act(`skip:${ride.id}`); await act(`apply:${ride.id}`);
    await act(`startpoint:${ride.id}:S1`);
    await act(`application:reject:${ride.id}:77`, owner);
    expect(member(ride, 'skipped').startPoint).toBeUndefined();
  });

  it('clears meeting points and selections when the wizard field is explicitly cleared', async () => {
    const ride = await create();
    await act(`join:${ride.id}`); await act(`startpoint:${ride.id}:S1`);
    await message(`/updateride ${ride.id}`);
    for (let index = 0; index < 9; index++) await act('wizard:keep', owner);
    await message('-');
    await act('wizard:keep', owner); await act('wizard:keep', owner);
    await act('wizard:confirm', owner);
    expect(harness.getRide(ride.id).meetingPoints).toEqual([]);
    expect(harness.getRide(ride.id).meetingPoint).toBe('');
    expect(member(ride).startPoint).toBeUndefined();
  });

  it.each(['S6: Park\nS1: Square', 'S1:'])('preserves legacy %s in reads, Keep and both duplicate flows', async legacyText => {
    const ride = await create();
    const stored = harness.storage.rides.get(ride.id);
    delete stored.meetingPoints;
    stored.meetingPoint = legacyText;
    await message(`/dupride ${ride.id}\nwhen: 2026-10-06T10:00:00Z`);
    expect(harness.listRides().find(other => other.id !== ride.id).meetingPoints).toEqual([legacyText]);
    await message(`/dupride ${ride.id}`);
    for (let index = 0; index < 12; index++) await act('wizard:keep', owner);
    await act('wizard:confirm', owner);
    expect(harness.listRides()).toHaveLength(3);
    for (const copy of harness.listRides().filter(other => other.id !== ride.id)) {
      expect(copy.meetingPoint).toBe(legacyText);
      expect(copy.meetingPoints).toEqual([legacyText]);
    }
    await message(`/updateride ${ride.id}`);
    expect(harness.outbox.replies.some(reply => reply.text?.includes(legacyText.replace(/\n/g, '<br>')))).toBe(true);
    for (let index = 0; index < 12; index++) await act('wizard:keep', owner);
    await act('wizard:confirm', owner);
    expect(harness.getRide(ride.id).meetingPoint).toBe(legacyText);
    expect(harness.getRide(ride.id).meetingPoints).toEqual([legacyText]);
  });
});
