import { t } from '../i18n/index.js';
import { config } from '../config.js';

/**
 * Service for managing Telegram group membership in sync with ride participation
 */
export class GroupManagementService {
  translate(language, key, params = {}) {
    return t(language || config.i18n.defaultLanguage, key, params, {
      fallbackLanguage: config.i18n.fallbackLanguage,
      withMissingMarker: config.isDev
    });
  }

  /**
   * Add a participant to the attached group.
   * Attempts direct add first; falls back to a single-use invite link if blocked by privacy settings.
   * @param {import('grammy').Api} api - Grammy bot API
   * @param {number} groupId - Telegram chat ID of the group
   * @param {number} userId - Telegram user ID to add
   * @param {string} [language] - Language for messages
   */
  async addParticipant(api, groupId, userId, language) {
    try {
      // Unban first so previously-kicked users can accept the invite link
      await api.unbanChatMember(groupId, userId);
      // Telegram Bot API has no method to directly add users to groups.
      // Always send a single-use invite link via DM instead.
      const invite = await api.createChatInviteLink(groupId, {
        member_limit: 1,
        expire_date: Math.floor(Date.now() / 1000) + 86400 // 24 hours
      });
      await api.sendMessage(
        userId,
        this.translate(language, 'commands.group.inviteLinkSent', { link: invite.invite_link })
      );
    } catch (error) {
      // Group owner is already a member and cannot be banned/unbanned — nothing to do
      if (error?.description?.includes("can't remove chat owner")) return;
      console.error(`GroupManagementService: failed to add user ${userId} to group ${groupId}:`, error);
    }
  }

  /**
   * Remove a participant from the attached group.
   * Bans then immediately unbans so the user can be re-added later.
   * @param {import('grammy').Api} api - Grammy bot API
   * @param {number} groupId - Telegram chat ID of the group
   * @param {number} userId - Telegram user ID to remove
   */
  async removeParticipant(api, groupId, userId) {
    try {
      await api.banChatMember(groupId, userId);
    } catch (error) {
      console.error(`GroupManagementService: failed to remove user ${userId} from group ${groupId}:`, error);
    }
  }
}
