/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Mock config so no real API key is needed
jest.mock('../../config.js', () => ({
  config: {
    anthropic: { apiKey: 'test-key' },
    i18n: { defaultLanguage: 'en', fallbackLanguage: 'en' },
    isDev: false,
    dateFormat: { defaultTimezone: 'UTC' }
  }
}));

import { AiRideService } from '../../services/AiRideService.js';

const makeResponse = (text) => ({ content: [{ type: 'text', text }] });

describe('AiRideService', () => {
  let service;
  let mockCreate;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    const mockClient = { messages: { create: mockCreate } };
    service = new AiRideService(mockClient);
  });

  describe('parseRideText', () => {
    it('returns parsed params when AI returns valid JSON', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('{"title":"Evening Ride","when":"tomorrow at 6pm","category":"road","dist":"50"}')
      );

      const { params, error } = await service.parseRideText('Evening road ride tomorrow 6pm 50km');

      expect(error).toBeNull();
      expect(params).toMatchObject({
        title: 'Evening Ride',
        when: 'tomorrow at 6pm',
        category: 'road',
        dist: '50'
      });
    });

    it('strips markdown fences from AI response', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('```json\n{"title":"Morning Ride","when":"Saturday 9am"}\n```')
      );

      const { params, error } = await service.parseRideText('Morning ride Saturday 9am');

      expect(error).toBeNull();
      expect(params.title).toBe('Morning Ride');
    });

    it('returns error when AI returns invalid JSON', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('Sorry, I cannot help with that.')
      );

      const { params, error } = await service.parseRideText('some text');

      expect(params).toBeNull();
      expect(error).toBe('invalid_response');
    });

    it('returns error when Anthropic API throws', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const { params, error } = await service.parseRideText('some text');

      expect(params).toBeNull();
      expect(error).toBe('service_unavailable');
    });

    it('omits empty string fields from returned params', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('{"title":"Ride","when":"tomorrow","organizer":"","dist":""}')
      );

      const { params } = await service.parseRideText('Ride tomorrow');

      expect(params).not.toHaveProperty('organizer');
      expect(params).not.toHaveProperty('dist');
    });

    it('omits null fields from returned params', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('{"title":"Ride","when":"tomorrow","meet":null}')
      );

      const { params } = await service.parseRideText('Ride tomorrow');

      expect(params).not.toHaveProperty('meet');
    });

    it('preserves nested settings from AI output', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('{"title":"Ride","when":"tomorrow","settings":{"notifyParticipation":false}}')
      );

      const { params, error } = await service.parseRideText('Ride tomorrow without participation notifications');

      expect(error).toBeNull();
      expect(params).toMatchObject({
        title: 'Ride',
        when: 'tomorrow',
        settings: {
          notifyParticipation: false
        }
      });
    });

    it('truncates input longer than 2000 chars before sending to API', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('{"title":"Ride","when":"tomorrow"}')
      );

      const longText = 'a'.repeat(3000);
      await service.parseRideText(longText);

      const calledUserMessage = mockCreate.mock.calls[0][0].messages[0].content;
      expect(calledUserMessage.length).toBeLessThanOrEqual(2000);
    });

    it('includes UPDATE MODE context when isUpdate is true', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('{"when":"next Sunday","dist":"80"}')
      );

      await service.parseRideText('change date to next Sunday', { isUpdate: true });

      const calledUserMessage = mockCreate.mock.calls[0][0].messages[0].content;
      expect(calledUserMessage).toContain('UPDATE MODE');
    });

    it('combines originalText and followUpText for re-parse', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('{"title":"Road Ride","when":"tomorrow 9am"}')
      );

      await service.parseRideText('Road ride tomorrow', {
        originalText: 'Road ride 50km',
        followUpText: '9am tomorrow'
      });

      const calledUserMessage = mockCreate.mock.calls[0][0].messages[0].content;
      expect(calledUserMessage).toContain('Road ride 50km');
      expect(calledUserMessage).toContain('9am tomorrow');
    });

    it('uses claude-haiku model', async () => {
      mockCreate.mockResolvedValue(
        makeResponse('{"title":"Ride","when":"tomorrow"}')
      );

      await service.parseRideText('ride tomorrow');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: expect.stringContaining('haiku') })
      );
    });

    describe('dialog mode (dialogMessages option)', () => {
      it('sends numbered messages as combined user message', async () => {
        mockCreate.mockResolvedValue(
          makeResponse('{"title":"Ride","when":"tomorrow 9am","speed":"25-28"}')
        );

        await service.parseRideText('', {
          dialogMessages: ['road ride tomorrow 9am', 'speed 25-28']
        });

        const calledUserMessage = mockCreate.mock.calls[0][0].messages[0].content;
        expect(calledUserMessage).toContain('[1] road ride tomorrow 9am');
        expect(calledUserMessage).toContain('[2] speed 25-28');
      });

      it('includes multi-turn context in system prompt', async () => {
        mockCreate.mockResolvedValue(makeResponse('{"title":"Ride","when":"tomorrow"}'));

        await service.parseRideText('', {
          dialogMessages: ['ride tomorrow']
        });

        const calledSystem = mockCreate.mock.calls[0][0].system;
        expect(calledSystem).toContain('multi-turn');
      });

      it('does NOT include UPDATE MODE when only dialogMessages provided', async () => {
        mockCreate.mockResolvedValue(makeResponse('{"title":"Ride","when":"tomorrow"}'));

        await service.parseRideText('', {
          dialogMessages: ['change speed']
        });

        const calledUserMessage = mockCreate.mock.calls[0][0].messages[0].content;
        expect(calledUserMessage).not.toContain('UPDATE MODE');
      });

      it('truncates individual messages exceeding 2000 chars', async () => {
        mockCreate.mockResolvedValue(makeResponse('{"title":"Ride","when":"tomorrow"}'));

        const longMsg = 'x'.repeat(3000);
        await service.parseRideText('', { dialogMessages: [longMsg] });

        const calledUserMessage = mockCreate.mock.calls[0][0].messages[0].content;
        // [1] prefix + 2000 chars of x
        expect(calledUserMessage.replace('[1] ', '').length).toBeLessThanOrEqual(2000);
      });
    });
  });
});
