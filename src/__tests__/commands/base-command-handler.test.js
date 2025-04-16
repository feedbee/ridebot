/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { BaseCommandHandler } from '../../commands/BaseCommandHandler.js';

describe('BaseCommandHandler', () => {
  let baseCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  
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
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: null, error: 'No ride ID found' });
      
      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx);
      
      // Verify
      expect(result).toEqual({ ride: null, error: 'No ride ID found' });
      expect(mockRideMessagesService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
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
      expect(result).toEqual({ ride: null, error: 'Ride #123 not found' });
      expect(mockRideMessagesService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
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
      expect(mockRideMessagesService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
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
        expect(result).toEqual({ ride: null, error: 'Error accessing ride data' });
        expect(mockRideMessagesService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
        expect(mockRideService.getRide).toHaveBeenCalledWith('123');
        expect(console.error).toHaveBeenCalled();
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
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
