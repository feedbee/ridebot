/**
 * Middleware to handle message thread IDs in group chats with topics
 * This ensures all command responses are sent to the same topic as the command
 * @param {import('grammy').Context} ctx - Grammy context
 * @param {Function} next - Next middleware function
 */
export async function threadMiddleware(ctx, next) {
  // Only process if we have a context with a message
  if (ctx.message) {
    // Store the message thread ID if present
    const messageThreadId = ctx.message.message_thread_id;
    
    if (messageThreadId) {
      // Store the original reply method
      const originalReply = ctx.reply;
      
      // Override the reply method to include message_thread_id
      ctx.reply = async function(text, options = {}) {
        // Create a new options object to avoid modifying the original
        const newOptions = { ...options };
        
        // Add message_thread_id if not already present
        if (!newOptions.message_thread_id) {
          newOptions.message_thread_id = messageThreadId;
        }
        
        // Call the original reply method with the updated options
        return originalReply.call(this, text, newOptions);
      };
      
      // Store the original replyWithHTML method if it exists
      if (ctx.replyWithHTML) {
        const originalReplyWithHTML = ctx.replyWithHTML;
        
        // Override the replyWithHTML method
        ctx.replyWithHTML = async function(text, options = {}) {
          const newOptions = { ...options };
          
          if (!newOptions.message_thread_id) {
            newOptions.message_thread_id = messageThreadId;
          }
          
          return originalReplyWithHTML.call(this, text, newOptions);
        };
      }
      
      // Store the original replyWithMarkdown method if it exists
      if (ctx.replyWithMarkdown) {
        const originalReplyWithMarkdown = ctx.replyWithMarkdown;
        
        // Override the replyWithMarkdown method
        ctx.replyWithMarkdown = async function(text, options = {}) {
          const newOptions = { ...options };
          
          if (!newOptions.message_thread_id) {
            newOptions.message_thread_id = messageThreadId;
          }
          
          return originalReplyWithMarkdown.call(this, text, newOptions);
        };
      }
      
      // Store the original editMessageText method if it exists
      if (ctx.editMessageText) {
        const originalEditMessageText = ctx.editMessageText;
        
        // Override the editMessageText method
        ctx.editMessageText = async function(text, options = {}) {
          const newOptions = { ...options };
          
          if (!newOptions.message_thread_id) {
            newOptions.message_thread_id = messageThreadId;
          }
          
          return originalEditMessageText.call(this, text, newOptions);
        };
      }
    }
  }
  
  // Continue to the next middleware or handler
  await next();
}
