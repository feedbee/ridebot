/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ListRidesCommandHandler } from '../../commands/ListRidesCommandHandler.js';

jest.mock('../../config.js', () => ({
  config: {
    buttons: {
      previous: '« Previous',
      next: 'Next »'
    }
  }
}));

describe('ListRidesCommandHandler', () => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;

  beforeEach(() => {
    mockRideService = {
      getRidesByCreator: jest.fn()
    };

    mockMessageFormatter = {
      formatRidesList: jest.fn().mockReturnValue('Your rides list')
    };

    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
      from: { id: 123 },
      message: { text: '/listrides' },
      match: ['list:2', '2']
    };

    handler = new ListRidesCommandHandler(mockRideService, mockMessageFormatter);
  });

  describe('handle', () => {
    it('shows first page as a normal reply', async () => {
      mockRideService.getRidesByCreator.mockResolvedValue({
        rides: [{ id: '1', title: 'Ride 1' }],
        total: 1
      });

      await handler.handle(mockCtx);

      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 0, 5);
      expect(mockCtx.reply).toHaveBeenCalled();
      expect(mockCtx.editMessageText).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    it('edits message for requested page and answers callback', async () => {
      mockRideService.getRidesByCreator.mockResolvedValue({
        rides: [{ id: '6', title: 'Ride 6' }],
        total: 7
      });

      await handler.handleCallback(mockCtx);

      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 5, 5);
      expect(mockCtx.editMessageText).toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('showRidesList', () => {
    it('formats empty result set safely', async () => {
      mockRideService.getRidesByCreator.mockResolvedValue({ rides: [], total: 0 });

      await handler.showRidesList(mockCtx, 1);

      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith([], 1, 1);
      expect(mockCtx.reply).toHaveBeenCalledWith('Your rides list', expect.objectContaining({ parse_mode: 'HTML' }));
    });

    it('formats middle page with expected pagination values', async () => {
      const rides = [{ id: '6', title: 'Ride 6' }, { id: '7', title: 'Ride 7' }];
      mockRideService.getRidesByCreator.mockResolvedValue({ rides, total: 15 });

      await handler.showRidesList(mockCtx, 2);

      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 5, 5);
      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith(rides, 2, 3);
      expect(mockCtx.reply).toHaveBeenCalled();
    });
  });
});
