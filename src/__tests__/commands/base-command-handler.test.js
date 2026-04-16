/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { BaseCommandHandler } from '../../commands/BaseCommandHandler.js';
import { t } from '../../i18n/index.js';

describe('BaseCommandHandler', () => {
  let baseCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  const tr = (key, params = {}) => t('en', key, params, { fallbackLanguage: 'en' });
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      getRide: jest.fn()
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideDetails: jest.fn()
    };

    // Create mock RideMessagesService
    mockRideMessagesService = {
      extractRideId: jest.fn()
    };
    
    // Create BaseCommandHandler instance with mocks
    baseCommandHandler = new BaseCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
  });
  
  describe('constructor', () => {
    it('should initialize with the provided services', () => {
      expect(baseCommandHandler.rideService).toBe(mockRideService);
      expect(baseCommandHandler.messageFormatter).toBe(mockMessageFormatter);
      expect(baseCommandHandler.rideMessagesService).toBe(mockRideMessagesService);
    });
  });
  
  describe('handle', () => {
    it('should throw an error when called directly', async () => {
      await expect(baseCommandHandler.handle()).rejects.toThrow('Method not implemented');
    });
  });
  
  describe('extractRide', () => {
    it('should return error when ride ID extraction fails', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' } };
      mockRideMessagesService.extractRideId.mockReturnValue({
        rideId: null,
        error: tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'command' })
      });

      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx);

      // Verify
      expect(result).toEqual({
        ride: null,
        error: tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'command' })
      });
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });
    
    it('should return error when ride is not found', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' }, from: { id: 789 } };
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(null);

      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx);

      // Verify
      expect(result).toEqual({ ride: null, error: tr('commands.common.rideNotFoundById', { id: '123' }) });
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
    });
    
    it('should return ride when found', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' }, from: { id: 456 } };
      const mockRide = { id: '123', title: 'Test Ride', createdBy: 456 };
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(mockRide);

      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx);

      // Verify
      expect(result).toEqual({ ride: mockRide, error: null });
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
    });
    
    it('should handle errors during ride retrieval', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' } };
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));

      // Mock console.error to prevent test output pollution
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      try {
        // Execute
        const result = await baseCommandHandler.extractRide(mockCtx);

        // Verify
        expect(result).toEqual({ ride: null, error: tr('commands.common.errorAccessingRideData') });
        expect(mockRideService.getRide).toHaveBeenCalledWith('123');
        expect(console.error).toHaveBeenCalled();
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });

    it('should extract ride using callback mode', async () => {
      const mockCtx = { match: ['rideowner:update:123', '123'] };
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 456 });

      const result = await baseCommandHandler.extractRide(mockCtx, 'callback');

      expect(result).toEqual({ ride: { id: '123', createdBy: 456 }, error: null });
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
    });

    it('should return callback extraction error when callback ride ID is missing', async () => {
      const result = await baseCommandHandler.extractRide({ match: [] }, 'callback');

      expect(result).toEqual({
        ride: null,
        error: tr('commands.common.errorAccessingRideData')
      });
    });

    it('should support custom callback match index', async () => {
      const mockCtx = { match: ['delete:confirm:123:callback', 'confirm', '123', 'callback'] };
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 456 });

      const result = await baseCommandHandler.extractRide(mockCtx, 'callback', 2);

      expect(result).toEqual({ ride: { id: '123', createdBy: 456 }, error: null });
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
    });
  });

  describe('extractRideWithCreatorCheck', () => {
    it('should enforce creator check when requested', async () => {
      const mockCtx = { message: { text: 'some text' }, from: { id: 456 } };
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 999 });

      const result = await baseCommandHandler.extractRideWithCreatorCheck(mockCtx, 'commands.delete.onlyCreator');

      expect(result).toEqual({ ride: null, error: tr('commands.delete.onlyCreator') });
    });

    it('should support callback mode', async () => {
      const mockCtx = { match: ['rideowner:update:123', '123'], from: { id: 456 } };
      const mockRide = { id: '123', createdBy: 456 };
      mockRideService.getRide.mockResolvedValue(mockRide);

      const result = await baseCommandHandler.extractRideWithCreatorCheck(
        mockCtx,
        'commands.common.onlyCreatorAction',
        'callback'
      );

      expect(result).toEqual({ ride: mockRide, error: null });
    });

    it('should support callback mode with custom match index', async () => {
      const mockCtx = {
        match: ['delete:confirm:123:callback', 'confirm', '123', 'callback'],
        from: { id: 456 }
      };
      const mockRide = { id: '123', createdBy: 456 };
      mockRideService.getRide.mockResolvedValue(mockRide);

      const result = await baseCommandHandler.extractRideWithCreatorCheck(
        mockCtx,
        'commands.delete.onlyCreator',
        'callback',
        2
      );

      expect(result).toEqual({ ride: mockRide, error: null });
    });
  });

  describe('isRideCreator', () => {
    it('should return true when user is the creator of a ride', () => {
      const ride = { id: 'abc123', createdBy: 456 };
      expect(baseCommandHandler.isRideCreator(ride, 456)).toBe(true);
    });
    
    it('should return false when user is not the creator of a ride', () => {
      const ride = { id: 'abc123', createdBy: 456 };
      expect(baseCommandHandler.isRideCreator(ride, 789)).toBe(false);
    });
  });
});
