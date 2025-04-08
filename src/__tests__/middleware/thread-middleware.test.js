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
});
