/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { checkBotAdminPermissions } from '../../utils/permission-checker.js';

describe('Permission Checker Utils', () => {
  let mockCtx;
  
  beforeEach(() => {
    // Create mock context
    mockCtx = {
      chat: {
        id: 123456789
      },
      api: {
        getMe: jest.fn(),
        getChatMember: jest.fn()
      }
    };
    
    // Spy on console.error
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    // Restore console.error
    console.error.mockRestore();
  });
  
  describe('checkBotAdminPermissions', () => {
    it('should return true when bot is an administrator', async () => {
      // Setup
      mockCtx.api.getMe.mockResolvedValue({ id: 987654321 });
      mockCtx.api.getChatMember.mockResolvedValue({ status: 'administrator' });
      
      // Execute
      const result = await checkBotAdminPermissions(mockCtx);
      
      // Verify
      expect(result).toBe(true);
      expect(mockCtx.api.getMe).toHaveBeenCalled();
      expect(mockCtx.api.getChatMember).toHaveBeenCalledWith(123456789, 987654321);
    });
    
    it('should return true when bot is the creator', async () => {
      // Setup
      mockCtx.api.getMe.mockResolvedValue({ id: 987654321 });
      mockCtx.api.getChatMember.mockResolvedValue({ status: 'creator' });
      
      // Execute
      const result = await checkBotAdminPermissions(mockCtx);
      
      // Verify
      expect(result).toBe(true);
      expect(mockCtx.api.getMe).toHaveBeenCalled();
      expect(mockCtx.api.getChatMember).toHaveBeenCalledWith(123456789, 987654321);
    });
    
    it('should return false when bot is a regular member', async () => {
      // Setup
      mockCtx.api.getMe.mockResolvedValue({ id: 987654321 });
      mockCtx.api.getChatMember.mockResolvedValue({ status: 'member' });
      
      // Execute
      const result = await checkBotAdminPermissions(mockCtx);
      
      // Verify
      expect(result).toBe(false);
      expect(mockCtx.api.getMe).toHaveBeenCalled();
      expect(mockCtx.api.getChatMember).toHaveBeenCalledWith(123456789, 987654321);
    });
    
    it('should return false when getMe throws an error', async () => {
      // Setup
      mockCtx.api.getMe.mockRejectedValue(new Error('API Error'));
      
      // Execute
      const result = await checkBotAdminPermissions(mockCtx);
      
      // Verify
      expect(result).toBe(false);
      expect(mockCtx.api.getMe).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
    
    it('should return false when getChatMember throws an error', async () => {
      // Setup
      mockCtx.api.getMe.mockResolvedValue({ id: 987654321 });
      mockCtx.api.getChatMember.mockRejectedValue(new Error('API Error'));
      
      // Execute
      const result = await checkBotAdminPermissions(mockCtx);
      
      // Verify
      expect(result).toBe(false);
      expect(mockCtx.api.getMe).toHaveBeenCalled();
      expect(mockCtx.api.getChatMember).toHaveBeenCalledWith(123456789, 987654321);
      expect(console.error).toHaveBeenCalled();
    });
  });
});
