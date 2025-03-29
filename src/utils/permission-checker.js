/**
 * Utility functions for checking bot permissions
 */

/**
 * Check if the bot has admin permissions in a chat
 * @param {import('grammy').Context} ctx - Grammy context
 * @returns {Promise<boolean>} - True if the bot has admin permissions, false otherwise
 */
export async function checkBotAdminPermissions(ctx) {
  try {
    // Get the bot's ID
    const botInfo = await ctx.api.getMe();
    const botId = botInfo.id;
    
    // Get the chat member info for the bot
    const chatMember = await ctx.api.getChatMember(ctx.chat.id, botId);
    
    // Check if the bot has admin permissions
    return ['administrator', 'creator'].includes(chatMember.status);
  } catch (error) {
    console.error('Error checking bot permissions:', error);
    return false;
  }
}
