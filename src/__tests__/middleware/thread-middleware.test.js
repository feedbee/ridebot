/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { threadMiddleware } from '../../middleware/threadMiddleware.js';

describe('threadMiddleware', () => {
  it('should call next middleware', async () => {
    // Create mock context and next function
    const mockCtx = { message: { message_thread_id: 12345 } };
    const nextMock = jest.fn();
    
    // Apply middleware
    await threadMiddleware(mockCtx, nextMock);
    
    // Verify that next was called
    expect(nextMock).toHaveBeenCalled();
  });
  
  it('should add thread support to reply method when in a topic', async () => {
    // Create a mock context with a message in a topic
    const mockCtx = {
      message: { message_thread_id: 12345 },
      reply: jest.fn().mockImplementation((text, options) => {
        // This mock just returns the options for verification
        return Promise.resolve(options);
      })
    };
    
    // Apply middleware
    await threadMiddleware(mockCtx, jest.fn());
    
    // Call the patched reply method and capture the result
    const result = await mockCtx.reply('Test message', { parse_mode: 'HTML' });
    
    // Verify that message_thread_id was added to options
    expect(result).toHaveProperty('message_thread_id', 12345);
    expect(result).toHaveProperty('parse_mode', 'HTML');
  });
  
  it('should not overwrite existing message_thread_id in options', async () => {
    // Create a mock context with a message in a topic
    const mockCtx = {
      message: { message_thread_id: 12345 },
      reply: jest.fn().mockImplementation((text, options) => {
        // This mock just returns the options for verification
        return Promise.resolve(options);
      })
    };
    
    // Apply middleware
    await threadMiddleware(mockCtx, jest.fn());
    
    // Call the patched reply method with an existing message_thread_id
    const result = await mockCtx.reply('Test message', { 
      parse_mode: 'HTML',
      message_thread_id: 98765 // Different thread ID
    });
    
    // Verify that the original message_thread_id was not overwritten
    expect(result).toHaveProperty('message_thread_id', 98765);
  });
  
  it('should do nothing if not in a topic', async () => {
    // Create a mock context without message_thread_id
    const mockCtx = {
      message: {}, // No message_thread_id
      reply: jest.fn().mockImplementation((text, options) => {
        return Promise.resolve(options);
      })
    };
    
    // Store the original reply method for comparison
    const originalReply = mockCtx.reply;
    
    // Apply middleware
    await threadMiddleware(mockCtx, jest.fn());
    
    // Call the reply method
    const result = await mockCtx.reply('Test message', { parse_mode: 'HTML' });
    
    // Verify that message_thread_id was not added
    expect(result).not.toHaveProperty('message_thread_id');
  });
  
  it('should do nothing if no message in context', async () => {
    // Create a mock context without message
    const mockCtx = {
      // No message property
      reply: jest.fn().mockImplementation((text, options) => {
        return Promise.resolve(options);
      })
    };
    
    // Store the original reply method for comparison
    const originalReply = mockCtx.reply;
    
    // Apply middleware
    await threadMiddleware(mockCtx, jest.fn());
    
    // Call the reply method
    const result = await mockCtx.reply('Test message', { parse_mode: 'HTML' });
    
    // Verify that message_thread_id was not added
    expect(result).not.toHaveProperty('message_thread_id');
  });

  describe('replyWithHTML support', () => {
    it('should add thread support to replyWithHTML method when in a topic', async () => {
      // Create a mock context with replyWithHTML
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        replyWithHTML: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call the patched replyWithHTML method
      const result = await mockCtx.replyWithHTML('Test HTML message', { disable_web_page_preview: true });
      
      // Verify that message_thread_id was added
      expect(result).toHaveProperty('message_thread_id', 12345);
      expect(result).toHaveProperty('disable_web_page_preview', true);
    });

    it('should not overwrite existing message_thread_id in replyWithHTML', async () => {
      // Create a mock context with replyWithHTML
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        replyWithHTML: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call with existing message_thread_id
      const result = await mockCtx.replyWithHTML('Test', { message_thread_id: 99999 });
      
      // Verify the original message_thread_id was preserved
      expect(result).toHaveProperty('message_thread_id', 99999);
    });

    it('should handle replyWithHTML with no options', async () => {
      // Create a mock context with replyWithHTML
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        replyWithHTML: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call without options
      const result = await mockCtx.replyWithHTML('Test');
      
      // Verify message_thread_id was added
      expect(result).toHaveProperty('message_thread_id', 12345);
    });
  });

  describe('replyWithMarkdown support', () => {
    it('should add thread support to replyWithMarkdown method when in a topic', async () => {
      // Create a mock context with replyWithMarkdown
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        replyWithMarkdown: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call the patched replyWithMarkdown method
      const result = await mockCtx.replyWithMarkdown('Test *markdown* message', { disable_notification: true });
      
      // Verify that message_thread_id was added
      expect(result).toHaveProperty('message_thread_id', 12345);
      expect(result).toHaveProperty('disable_notification', true);
    });

    it('should not overwrite existing message_thread_id in replyWithMarkdown', async () => {
      // Create a mock context with replyWithMarkdown
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        replyWithMarkdown: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call with existing message_thread_id
      const result = await mockCtx.replyWithMarkdown('Test', { message_thread_id: 88888 });
      
      // Verify the original message_thread_id was preserved
      expect(result).toHaveProperty('message_thread_id', 88888);
    });

    it('should handle replyWithMarkdown with no options', async () => {
      // Create a mock context with replyWithMarkdown
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        replyWithMarkdown: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call without options
      const result = await mockCtx.replyWithMarkdown('Test');
      
      // Verify message_thread_id was added
      expect(result).toHaveProperty('message_thread_id', 12345);
    });
  });

  describe('editMessageText support', () => {
    it('should add thread support to editMessageText method when in a topic', async () => {
      // Create a mock context with editMessageText
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        editMessageText: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call the patched editMessageText method
      const result = await mockCtx.editMessageText('Updated message', { parse_mode: 'HTML' });
      
      // Verify that message_thread_id was added
      expect(result).toHaveProperty('message_thread_id', 12345);
      expect(result).toHaveProperty('parse_mode', 'HTML');
    });

    it('should not overwrite existing message_thread_id in editMessageText', async () => {
      // Create a mock context with editMessageText
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        editMessageText: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call with existing message_thread_id
      const result = await mockCtx.editMessageText('Updated', { message_thread_id: 77777 });
      
      // Verify the original message_thread_id was preserved
      expect(result).toHaveProperty('message_thread_id', 77777);
    });

    it('should handle editMessageText with no options', async () => {
      // Create a mock context with editMessageText
      const mockCtx = {
        message: { message_thread_id: 12345 },
        reply: jest.fn(),
        editMessageText: jest.fn().mockImplementation((text, options) => {
          return Promise.resolve(options);
        })
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Call without options
      const result = await mockCtx.editMessageText('Updated');
      
      // Verify message_thread_id was added
      expect(result).toHaveProperty('message_thread_id', 12345);
    });
  });

  describe('combined method support', () => {
    it('should add thread support to all methods when they exist', async () => {
      // Create a mock context with all methods
      const mockCtx = {
        message: { message_thread_id: 54321 },
        reply: jest.fn().mockImplementation((text, options) => Promise.resolve(options)),
        replyWithHTML: jest.fn().mockImplementation((text, options) => Promise.resolve(options)),
        replyWithMarkdown: jest.fn().mockImplementation((text, options) => Promise.resolve(options)),
        editMessageText: jest.fn().mockImplementation((text, options) => Promise.resolve(options))
      };
      
      // Apply middleware
      await threadMiddleware(mockCtx, jest.fn());
      
      // Test all methods
      const replyResult = await mockCtx.reply('Test');
      const htmlResult = await mockCtx.replyWithHTML('Test');
      const markdownResult = await mockCtx.replyWithMarkdown('Test');
      const editResult = await mockCtx.editMessageText('Test');
      
      // Verify all have message_thread_id
      expect(replyResult).toHaveProperty('message_thread_id', 54321);
      expect(htmlResult).toHaveProperty('message_thread_id', 54321);
      expect(markdownResult).toHaveProperty('message_thread_id', 54321);
      expect(editResult).toHaveProperty('message_thread_id', 54321);
    });
  });
});
