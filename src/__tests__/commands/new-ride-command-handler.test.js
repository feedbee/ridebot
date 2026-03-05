/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { NewRideCommandHandler } from '../../commands/NewRideCommandHandler.js';
import { RideParamsHelper } from '../../utils/RideParamsHelper.js';
import { t } from '../../i18n/index.js';

jest.mock('../../utils/RideParamsHelper.js');

RideParamsHelper.parseRideParams = jest.fn();
RideParamsHelper.VALID_PARAMS = {
  title: 'Title of the ride',
  when: 'Date and time of the ride',
  meet: 'Meeting point'
};

describe.each(['en', 'ru'])('NewRideCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockWizard;
  let mockCtx;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    jest.clearAllMocks();

    mockRideService = {
      createRideFromParams: jest.fn()
    };

    mockMessageFormatter = {};

    mockRideMessagesService = {
      createRideMessage: jest.fn().mockResolvedValue({})
    };

    mockWizard = {
      startWizard: jest.fn().mockResolvedValue({})
    };

    mockCtx = {
      message: { text: '/newride' },
      lang: language,
      chat: { id: 789 },
      from: {
        id: 101112,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      },
      reply: jest.fn().mockResolvedValue({})
    };

    handler = new NewRideCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockWizard,
      mockRideMessagesService
    );
  });

  describe('handle', () => {
    it('starts wizard when command has no params', async () => {
      await handler.handle(mockCtx);

      expect(mockWizard.startWizard).toHaveBeenCalledWith(mockCtx, null);
      expect(mockRideService.createRideFromParams).not.toHaveBeenCalled();
    });

    it('starts wizard with prefill data when provided', async () => {
      const prefillData = { title: 'Test Ride' };

      await handler.handle(mockCtx, prefillData);

      expect(mockWizard.startWizard).toHaveBeenCalledWith(mockCtx, prefillData);
    });

    it('creates ride and message when params are valid', async () => {
      mockCtx.message.text = '/newride\ntitle: Test Ride\nwhen: tomorrow 11:00';
      RideParamsHelper.parseRideParams.mockReturnValue({
        params: { title: 'Test Ride', when: 'tomorrow 11:00' },
        unknownParams: []
      });
      const createdRide = { id: '123', title: 'Test Ride' };
      mockRideService.createRideFromParams.mockResolvedValue({ ride: createdRide, error: null });

      await handler.handle(mockCtx);

      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        { title: 'Test Ride', when: 'tomorrow 11:00' },
        789,
        expect.objectContaining({ id: 101112 }),
        { language }
      );
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(createdRide, mockCtx);
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });

    it('shows validation message and stops when unknown params are present', async () => {
      mockCtx.message.text = '/newride\ntitle: Test Ride\nlocation: Somewhere';
      RideParamsHelper.parseRideParams.mockReturnValue({
        params: { title: 'Test Ride' },
        unknownParams: ['location']
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalled();
      expect(mockRideService.createRideFromParams).not.toHaveBeenCalled();
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });
  });

  describe('handleWithParams', () => {
    it('replies with error and does not post message when service returns error', async () => {
      const params = { title: 'Test Ride', when: 'invalid date' };
      mockRideService.createRideFromParams.mockResolvedValue({
        ride: null,
        error: tr('parsers.date.invalidFormat')
      });

      await handler.handleWithParams(mockCtx, params);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('parsers.date.invalidFormat'));
      expect(mockRideMessagesService.createRideMessage).not.toHaveBeenCalled();
    });

    it('creates ride in topic context as regular behavior', async () => {
      const topicCtx = {
        ...mockCtx,
        message: { ...mockCtx.message, message_thread_id: 5678 }
      };
      const params = { title: 'Topic ride', when: 'tomorrow 10:00' };
      const createdRide = { id: '456', title: 'Topic ride' };
      mockRideService.createRideFromParams.mockResolvedValue({ ride: createdRide, error: null });

      await handler.handleWithParams(topicCtx, params);

      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(createdRide, topicCtx);
    });
  });
});
