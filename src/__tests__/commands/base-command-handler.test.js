/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { BaseCommandHandler } from '../../commands/BaseCommandHandler.js';

describe('BaseCommandHandler', () => {
  let baseCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      extractRideId: jest.fn(),
      getRide: jest.fn(),
      isRideCreator: jest.fn()
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideDetails: jest.fn()
    };
    
    // Create BaseCommandHandler instance with mocks
    baseCommandHandler = new BaseCommandHandler(mockRideService, mockMessageFormatter);
  });
  
  describe('constructor', () => {
    it('should initialize with the provided services', () => {
      expect(baseCommandHandler.rideService).toBe(mockRideService);
      expect(baseCommandHandler.messageFormatter).toBe(mockMessageFormatter);
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
      mockRideService.extractRideId.mockReturnValue({ rideId: null, error: 'No ride ID found' });
      
      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx);
      
      // Verify
      expect(result).toEqual({ ride: null, error: 'No ride ID found' });
      expect(mockRideService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });
    
    it('should return error when ride is not found', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' } };
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(null);
      
      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx);
      
      // Verify
      expect(result).toEqual({ ride: null, error: 'Ride #123 not found' });
      expect(mockRideService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
    });
    
    it('should return ride when found and creator check is not required', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' } };
      const mockRide = { id: '123', title: 'Test Ride' };
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(mockRide);
      
      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx);
      
      // Verify
      expect(result).toEqual({ ride: mockRide, error: null });
      expect(mockRideService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.isRideCreator).not.toHaveBeenCalled();
    });
    
    it('should return ride when found and user is the creator', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' }, from: { id: 456 } };
      const mockRide = { id: '123', title: 'Test Ride', createdBy: 456 };
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(mockRide);
      mockRideService.isRideCreator.mockReturnValue(true);
      
      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx, true);
      
      // Verify
      expect(result).toEqual({ ride: mockRide, error: null });
      expect(mockRideService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.isRideCreator).toHaveBeenCalledWith(mockRide, 456);
    });
    
    it('should return error when creator check is required but user is not the creator', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' }, from: { id: 789 } };
      const mockRide = { id: '123', title: 'Test Ride', createdBy: 456 };
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(mockRide);
      mockRideService.isRideCreator.mockReturnValue(false);
      
      // Execute
      const result = await baseCommandHandler.extractRide(mockCtx, true);
      
      // Verify
      expect(result).toEqual({ ride: null, error: 'Only the ride creator can perform this action' });
      expect(mockRideService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.isRideCreator).toHaveBeenCalledWith(mockRide, 789);
    });
    
    it('should handle errors during ride retrieval', async () => {
      // Setup
      const mockCtx = { message: { text: 'some text' } };
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));
      
      // Mock console.error to prevent test output pollution
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      try {
        // Execute
        const result = await baseCommandHandler.extractRide(mockCtx);
        
        // Verify
        expect(result).toEqual({ ride: null, error: 'Error accessing ride data' });
        expect(mockRideService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
        expect(mockRideService.getRide).toHaveBeenCalledWith('123');
        expect(console.error).toHaveBeenCalled();
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });
  });
});
