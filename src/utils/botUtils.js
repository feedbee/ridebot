/**
 * Utility functions for bot-related operations
 */

/**
 * Get the bot's username dynamically
 * @param {Object} ctx - Grammy context
 * @returns {Promise<string>} Bot username
 */
export async function getBotUsername(ctx) {
  try {
    const botInfo = await ctx.api.getMe();
    return botInfo.username;
  } catch (error) {
    console.error('Error getting bot username:', error);
    return 'botname'; // Fallback to placeholder
  }
}

/**
 * Replace bot name placeholders in text with actual bot username
 * @param {string} text - Text containing bot name placeholders
 * @param {Object} ctx - Grammy context
 * @returns {Promise<string>} Text with substituted bot username
 */
export async function replaceBotUsername(text, ctx) {
  const botUsername = await getBotUsername(ctx);
  return text.replace(/@botname/g, `@${botUsername}`);
}
