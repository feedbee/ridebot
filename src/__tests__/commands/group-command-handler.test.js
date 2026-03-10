/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { GroupCommandHandler } from '../../commands/GroupCommandHandler.js';
import { t } from '../../i18n/index.js';

jest.mock('grammy', () => ({
  InlineKeyboard: jest.fn().mockImplementation(() => ({
    text: jest.fn().mockReturnThis(),
    row: jest.fn().mockReturnThis()
  }))
}));

describe.each(['en', 'ru'])('GroupCommandHandler (%s)', (language) => {
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  let handler;
  let mockRideService;
  let mockRideMessagesService;
  let mockGroupManagementService;
  let mockCtx;

  const GROUP_ID = -100123456789;
  const BOT_ID = 999;
  const RIDE_ID = 'abc123';
  const CREATOR_ID = 100;

  const makeRide = (overrides = {}) => ({
    id: RIDE_ID,
    title: 'Test Ride',
    createdBy: CREATOR_ID,
    cancelled: false,
    groupId: null,
    participation: { joined: [], thinking: [], skipped: [] },
    messages: [],
    ...overrides
  });

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn(),
      updateRide: jest.fn().mockResolvedValue({}),
      getRideByGroupId: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn().mockReturnValue({ rideId: RIDE_ID, error: null }),
      createRideMessage: jest.fn().mockResolvedValue({ sentMessage: { message_id: 777 }, updatedRide: {} }),
      updateRideMessages: jest.fn().mockResolvedValue({ success: true })
    };

    mockGroupManagementService = {
      addParticipant: jest.fn().mockResolvedValue({}),
      removeParticipant: jest.fn().mockResolvedValue({})
    };

    mockCtx = {
      lang: language,
      t: jest.fn((key, params = {}) => tr(key, params)),
      from: { id: CREATOR_ID, username: 'creator', first_name: 'Creator', last_name: '' },
      chat: { id: GROUP_ID, type: 'supergroup' },
      message: { message_thread_id: null, text: `/attach #${RIDE_ID}` },
      reply: jest.fn().mockResolvedValue({}),
      api: {
        getMe: jest.fn().mockResolvedValue({ id: BOT_ID }),
        getChatMember: jest.fn().mockResolvedValue({ status: 'administrator', can_invite_users: true }),
        pinChatMessage: jest.fn().mockResolvedValue({})
      }
    };

    handler = new GroupCommandHandler(mockRideService, {}, mockRideMessagesService, mockGroupManagementService);
  });

  // ─── /attach tests ───────────────────────────────────────────────────────────

  describe('handleAttach', () => {
    it('should reject if called in private chat', async () => {
      mockCtx.chat.type = 'private';

      await handler.handleAttach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.notInGroup'));
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });

    it('should reply with error if ride not found', async () => {
      mockRideService.getRide.mockResolvedValue(null);

      await handler.handleAttach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.rideNotFound'));
    });

    it('should reject non-creator', async () => {
      mockCtx.from.id = 999; // not creator
      mockRideService.getRide.mockResolvedValue(makeRide());

      await handler.handleAttach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.notCreator'));
    });

    it('should reject if ride already has a group', async () => {
      mockRideService.getRide.mockResolvedValue(makeRide({ groupId: -100987654321 }));

      await handler.handleAttach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.alreadyAttached'));
    });

    it('should reject if bot is not admin', async () => {
      mockRideService.getRide.mockResolvedValue(makeRide());
      mockCtx.api.getChatMember.mockResolvedValue({ status: 'member' });

      await handler.handleAttach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.botNotAdmin'));
    });

    it('should reject if bot lacks can_invite_users', async () => {
      mockRideService.getRide.mockResolvedValue(makeRide());
      mockCtx.api.getChatMember.mockResolvedValue({ status: 'administrator', can_invite_users: false });

      await handler.handleAttach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.botNeedsAddMembersPermission'));
    });

    it('should attach group, post message, pin it, and reply success', async () => {
      mockRideService.getRide.mockResolvedValue(makeRide());

      await handler.handleAttach(mockCtx);

      expect(mockRideService.updateRide).toHaveBeenCalledWith(RIDE_ID, { groupId: GROUP_ID });
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalled();
      expect(mockCtx.api.pinChatMessage).toHaveBeenCalledWith(GROUP_ID, 777, { disable_notification: true });
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.attachSuccess'));
    });

    it('should add existing joined participants on attach', async () => {
      const ride = makeRide({
        participation: {
          joined: [{ userId: 201, username: 'u1', firstName: 'U1', lastName: '' }],
          thinking: [],
          skipped: []
        }
      });
      mockRideService.getRide.mockResolvedValue(ride);

      await handler.handleAttach(mockCtx);

      expect(mockGroupManagementService.addParticipant).toHaveBeenCalledWith(
        mockCtx.api, GROUP_ID, 201, language
      );
    });

    it('should still succeed if pinning fails', async () => {
      mockRideService.getRide.mockResolvedValue(makeRide());
      mockCtx.api.pinChatMessage.mockRejectedValue(new Error('no pin permission'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await handler.handleAttach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.attachSuccess'));
      consoleSpy.mockRestore();
    });
  });

  // ─── /detach tests ───────────────────────────────────────────────────────────

  describe('handleDetach', () => {
    it('should reject if called in private chat', async () => {
      mockCtx.chat.type = 'private';

      await handler.handleDetach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.notInGroup'));
    });

    it('should reply if no ride is attached to group', async () => {
      mockRideService.getRideByGroupId.mockResolvedValue(null);

      await handler.handleDetach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.noGroupAttached'));
    });

    it('should allow ride creator to detach', async () => {
      mockRideService.getRideByGroupId.mockResolvedValue(makeRide({ groupId: GROUP_ID }));

      await handler.handleDetach(mockCtx);

      expect(mockRideService.updateRide).toHaveBeenCalledWith(RIDE_ID, { groupId: null });
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.detachSuccess'));
    });

    it('should allow group admin (non-creator) to detach', async () => {
      mockCtx.from.id = 777; // not creator
      mockRideService.getRideByGroupId.mockResolvedValue(makeRide({ groupId: GROUP_ID }));
      mockCtx.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await handler.handleDetach(mockCtx);

      expect(mockRideService.updateRide).toHaveBeenCalledWith(RIDE_ID, { groupId: null });
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.detachSuccess'));
    });

    it('should reject non-creator non-admin', async () => {
      mockCtx.from.id = 777; // not creator
      mockRideService.getRideByGroupId.mockResolvedValue(makeRide({ groupId: GROUP_ID }));
      mockCtx.api.getChatMember.mockResolvedValue({ status: 'member' });

      await handler.handleDetach(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.group.notCreator'));
      expect(mockRideService.updateRide).not.toHaveBeenCalled();
    });
  });
});
