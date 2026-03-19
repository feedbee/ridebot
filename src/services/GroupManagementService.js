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
   * Sends a single-use invite link via DM. If the user hasn't started the bot (403),
   * notifies the ride creator to forward the link manually.
   * @param {import('grammy').Api} api - Grammy bot API
   * @param {number} groupId - Telegram chat ID of the group
   * @param {number} userId - Telegram user ID to add
   * @param {string} [language] - Language for messages
   * @param {number} [creatorId] - Ride creator's user ID, used as fallback if DM to user fails
   */
  async addParticipant(api, groupId, userId, language, creatorId) {
    let invite;
    try {
      // Unban first so previously-kicked users can accept the invite link
      await api.unbanChatMember(groupId, userId);
      // Telegram Bot API has no method to directly add users to groups.
      // Always send a single-use invite link via DM instead.
      invite = await api.createChatInviteLink(groupId, {
        member_limit: 1,
        expire_date: Math.floor(Date.now() / 1000) + 86400 // 24 hours
      });
    } catch (error) {
      // Group owner is already a member and cannot be banned/unbanned — nothing to do
      if (error?.description?.includes("can't remove chat owner")) return;
      console.error(`GroupManagementService: failed to add user ${userId} to group ${groupId}:`, error);
      return;
    }

    try {
      await api.sendMessage(
        userId,
        this.translate(language, 'commands.group.inviteLinkSent', { link: invite.invite_link })
      );
    } catch (error) {
      if (error?.error_code === 403 && creatorId) {
        // User hasn't started the bot — ask the creator to forward the link manually
        try {
          await api.sendMessage(
            creatorId,
            this.translate(language, 'commands.group.inviteLinkForCreator', { link: invite.invite_link })
          );
        } catch (e) {
          console.warning(`GroupManagementService: failed to notify creator ${creatorId} about invite for user ${userId}:`, e);
        }
        return;
      }
      console.error(`GroupManagementService: failed to send invite link to user ${userId}:`, error);
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
