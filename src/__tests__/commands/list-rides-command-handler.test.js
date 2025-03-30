/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ListRidesCommandHandler } from '../../commands/ListRidesCommandHandler.js';

// Mock the grammy module
jest.mock('grammy', () => {
  return {
    InlineKeyboard: jest.fn().mockImplementation(() => {
      return {
        text: jest.fn().mockReturnThis(),
        length: 0
      };
    })
  };
});

// Mock the config module
jest.mock('../../config.js', () => ({
  config: {
    buttons: {
      previous: '« Previous',
      next: 'Next »'
    }
  }
}));

describe('ListRidesCommandHandler', () => {
  let listRidesCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      getRidesByCreator: jest.fn()
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRidesList: jest.fn().mockReturnValue('Your rides list')
    };
    
    // Create mock Grammy context
    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
      from: { id: 123 },
      message: { text: '/listrides' }
    };
    
    // Create ListRidesCommandHandler instance with mocks
    listRidesCommandHandler = new ListRidesCommandHandler(mockRideService, mockMessageFormatter);
  });
  
  describe('handle', () => {
    it('should show the first page of rides', async () => {
      // Setup - mock the showRidesList method
      listRidesCommandHandler.showRidesList = jest.fn().mockResolvedValue({});
      
      // Execute
      await listRidesCommandHandler.handle(mockCtx);
      
      // Verify
      expect(listRidesCommandHandler.showRidesList).toHaveBeenCalledWith(mockCtx, 1);
    });
  });
  
  describe('handleCallback', () => {
    it('should show the requested page of rides', async () => {
      // Setup
      mockCtx.match = ['list:3', '3'];
      listRidesCommandHandler.showRidesList = jest.fn().mockResolvedValue({});
      
      // Execute
      await listRidesCommandHandler.handleCallback(mockCtx);
      
      // Verify
      expect(listRidesCommandHandler.showRidesList).toHaveBeenCalledWith(mockCtx, 3, true);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
    });
  });
  
  describe('showRidesList', () => {
    it('should display rides with no pagination when only one page exists', async () => {
      // Setup
      const mockRides = [
        { id: '1', title: 'Ride 1' },
        { id: '2', title: 'Ride 2' }
      ];
      mockRideService.getRidesByCreator.mockResolvedValue({ 
        rides: mockRides, 
        total: 2 
      });
      
      // Execute
      await listRidesCommandHandler.showRidesList(mockCtx, 1);
      
      // Verify
      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 0, 5);
      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith(mockRides, 1, 1);
      expect(mockCtx.reply).toHaveBeenCalledWith('Your rides list', {
        parse_mode: 'HTML',
        reply_markup: undefined
      });
    });
    
    it('should display rides with next button on first page when multiple pages exist', async () => {
      // Setup
      const mockRides = [
        { id: '1', title: 'Ride 1' },
        { id: '2', title: 'Ride 2' },
        { id: '3', title: 'Ride 3' },
        { id: '4', title: 'Ride 4' },
        { id: '5', title: 'Ride 5' }
      ];
      mockRideService.getRidesByCreator.mockResolvedValue({ 
        rides: mockRides, 
        total: 7 // Total of 7 rides means 2 pages
      });
      
      // Execute
      await listRidesCommandHandler.showRidesList(mockCtx, 1);
      
      // Verify
      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 0, 5);
      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith(mockRides, 1, 2);
      expect(mockCtx.reply).toHaveBeenCalledWith('Your rides list', expect.objectContaining({
        parse_mode: 'HTML'
      }));
    });
    
    it('should display rides with previous button on last page', async () => {
      // Setup
      const mockRides = [
        { id: '6', title: 'Ride 6' },
        { id: '7', title: 'Ride 7' }
      ];
      mockRideService.getRidesByCreator.mockResolvedValue({ 
        rides: mockRides, 
        total: 7 // Total of 7 rides means 2 pages
      });
      
      // Execute
      await listRidesCommandHandler.showRidesList(mockCtx, 2);
      
      // Verify
      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 5, 5);
      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith(mockRides, 2, 2);
      expect(mockCtx.reply).toHaveBeenCalledWith('Your rides list', expect.objectContaining({
        parse_mode: 'HTML'
      }));
    });
    
    it('should display rides with both navigation buttons on middle page', async () => {
      // Setup
      const mockRides = [
        { id: '6', title: 'Ride 6' },
        { id: '7', title: 'Ride 7' },
        { id: '8', title: 'Ride 8' },
        { id: '9', title: 'Ride 9' },
        { id: '10', title: 'Ride 10' }
      ];
      mockRideService.getRidesByCreator.mockResolvedValue({ 
        rides: mockRides, 
        total: 15 // Total of 15 rides means 3 pages
      });
      
      // Execute
      await listRidesCommandHandler.showRidesList(mockCtx, 2);
      
      // Verify
      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 5, 5);
      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith(mockRides, 2, 3);
      expect(mockCtx.reply).toHaveBeenCalledWith('Your rides list', expect.objectContaining({
        parse_mode: 'HTML'
      }));
    });
    
    it('should edit message when isEdit is true', async () => {
      // Setup
      const mockRides = [
        { id: '1', title: 'Ride 1' },
        { id: '2', title: 'Ride 2' }
      ];
      mockRideService.getRidesByCreator.mockResolvedValue({ 
        rides: mockRides, 
        total: 2 
      });
      
      // Execute
      await listRidesCommandHandler.showRidesList(mockCtx, 1, true);
      
      // Verify
      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 0, 5);
      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith(mockRides, 1, 1);
      expect(mockCtx.editMessageText).toHaveBeenCalledWith('Your rides list', expect.objectContaining({
        parse_mode: 'HTML'
      }));
      expect(mockCtx.reply).not.toHaveBeenCalled();
    });
    
    it('should handle empty rides list', async () => {
      // Setup
      mockRideService.getRidesByCreator.mockResolvedValue({ 
        rides: [], 
        total: 0 
      });
      
      // Execute
      await listRidesCommandHandler.showRidesList(mockCtx, 1);
      
      // Verify
      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 0, 5);
      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith([], 1, 1);
      expect(mockCtx.reply).toHaveBeenCalledWith('Your rides list', {
        parse_mode: 'HTML',
        reply_markup: undefined
      });
    });
  });
});
