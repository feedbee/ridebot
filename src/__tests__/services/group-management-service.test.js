/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { GroupManagementService } from '../../services/GroupManagementService.js';
import { t } from '../../i18n/index.js';

describe('GroupManagementService', () => {
  let service;
  let mockApi;
  const GROUP_ID = -100123456789;
  const USER_ID = 456;

  beforeEach(() => {
    service = new GroupManagementService();
    mockApi = {
      unbanChatMember: jest.fn().mockResolvedValue({}),
      banChatMember: jest.fn().mockResolvedValue({}),
      createChatInviteLink: jest.fn().mockResolvedValue({ invite_link: 'https://t.me/+abc123' }),
      sendMessage: jest.fn().mockResolvedValue({})
    };
  });

  describe('addParticipant', () => {
    it('should unban then send invite link to user', async () => {
      await service.addParticipant(mockApi, GROUP_ID, USER_ID, 'en');

      expect(mockApi.unbanChatMember).toHaveBeenCalledWith(GROUP_ID, USER_ID);
      expect(mockApi.createChatInviteLink).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({ member_limit: 1, expire_date: expect.any(Number) })
      );

      const inviteLink = 'https://t.me/+abc123';
      const expectedMsg = t('en', 'commands.group.inviteLinkSent', { link: inviteLink }, { fallbackLanguage: 'en' });
      expect(mockApi.sendMessage).toHaveBeenCalledWith(USER_ID, expectedMsg);
    });

    it('should silently skip when user is the group owner', async () => {
      mockApi.unbanChatMember.mockRejectedValue({ description: "Bad Request: can't remove chat owner" });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.addParticipant(mockApi, GROUP_ID, USER_ID, 'en')).resolves.toBeUndefined();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log and swallow other errors without throwing', async () => {
      mockApi.unbanChatMember.mockRejectedValue(new Error('bot is not admin'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.addParticipant(mockApi, GROUP_ID, USER_ID, 'en')).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log and swallow invite link errors without throwing', async () => {
      mockApi.createChatInviteLink.mockRejectedValue(new Error('link error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.addParticipant(mockApi, GROUP_ID, USER_ID, 'en')).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe('removeParticipant', () => {
    it('should kick the user from the group', async () => {
      await service.removeParticipant(mockApi, GROUP_ID, USER_ID);

      expect(mockApi.banChatMember).toHaveBeenCalledWith(GROUP_ID, USER_ID);
      expect(mockApi.unbanChatMember).not.toHaveBeenCalled();
    });

    it('should log and swallow errors without throwing', async () => {
      mockApi.banChatMember.mockRejectedValue(new Error('not in group'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.removeParticipant(mockApi, GROUP_ID, USER_ID)).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
