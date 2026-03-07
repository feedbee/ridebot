/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { MessageFormatter } from '../../formatters/MessageFormatter.js';
import { config } from '../../config.js';
import { DateParser } from '../../utils/date-parser.js';
import { t } from '../../i18n/index.js';

// Mock the grammy module
jest.mock('grammy', () => {
  return {
    InlineKeyboard: jest.fn().mockImplementation(() => {
      return {
        text: jest.fn().mockReturnThis(),
        row: jest.fn().mockReturnThis()
      };
    })
  };
});

describe('MessageFormatter', () => {
  let messageFormatter;
  let originalMaxParticipantsDisplay;
  let originalDefaultLanguage;
  const tr = (language, key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    messageFormatter = new MessageFormatter();
    // Save original config value
    originalMaxParticipantsDisplay = config.maxParticipantsDisplay;
    originalDefaultLanguage = config.i18n.defaultLanguage;
  });

  afterEach(() => {
    // Restore original config value
    config.maxParticipantsDisplay = originalMaxParticipantsDisplay;
    config.i18n.defaultLanguage = originalDefaultLanguage;
  });
  
  describe('formatRideWithKeyboard', () => {
    it('should return formatted message with keyboard', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location'
      };
      
      const participants = [
        { userId: 456, firstName: 'Test', lastName: 'User', username: 'testuser' }
      ];
      
      // Mock the formatRideMessage and getRideKeyboard methods
      messageFormatter.formatRideMessage = jest.fn().mockReturnValue('Formatted message');
      messageFormatter.getRideKeyboard = jest.fn().mockReturnValue({ inline_keyboard: [] });
      
      // Execute
      const result = messageFormatter.formatRideWithKeyboard(ride, participants);
      
      // Verify
      expect(messageFormatter.formatRideMessage).toHaveBeenCalledWith(ride, participants, {});
      expect(messageFormatter.getRideKeyboard).toHaveBeenCalledWith(ride, 'en');
      expect(result).toEqual({
        message: 'Formatted message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
    });
  });
  
  describe('getRideKeyboard', () => {
    it('should return an InlineKeyboard instance', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        cancelled: false
      };
      
      // Execute
      const result = messageFormatter.getRideKeyboard(ride);
      
      // Verify
      expect(result).toBeDefined();
    });
    
    it('should handle cancelled rides', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        cancelled: true
      };
      
      // Execute
      const result = messageFormatter.getRideKeyboard(ride);
      
      // Verify
      expect(result).toBeDefined();
    });
  });
  
  describe('formatRideMessage', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should format ride message with all fields', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 120,
        speedMin: 25,
        speedMax: 30,
        cancelled: false,
        additionalInfo: 'Bring lights and a jacket'
      };
      
      const participants = [
        { userId: 456, firstName: 'Test', lastName: 'User', username: 'testuser' }
      ];
      
      // Mock the formatDuration and formatSpeedRange methods
      messageFormatter.formatDuration = jest.fn().mockReturnValue('2 h');
      messageFormatter.formatSpeedRange = jest.fn().mockReturnValue('25-30 km/h');
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participants);
      
      // Verify
      expect(result).toContain('Test Ride');
      expect(result).toContain('Test Location');
      expect(result).toContain('https://example.com/route');
      expect(result).toContain('50 km');
      expect(result).toContain('Ride #123');
      expect(result).toContain('Bring lights and a jacket');
      expect(messageFormatter.formatDuration).toHaveBeenCalledWith(120, 'en');
      expect(messageFormatter.formatSpeedRange).toHaveBeenCalledWith(25, 30, 'en');
    });
    
    it.each(['en', 'ru'])('should format ride message with cancelled status (%s)', (language) => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        cancelled: true
      };
      
      const participants = [];
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participants, { lang: language });
      
      // Verify
      expect(result).toContain(tr(language, 'templates.cancelled'));
      expect(result).toContain(tr(language, 'formatter.noOneJoinedYet'));
      expect(result).toContain(tr(language, 'templates.cancelledMessage'));
    });
    
    it.each(['en', 'ru'])('should handle empty optional fields (%s)', (language) => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        cancelled: false,
        additionalInfo: null
      };
      
      const participants = [];
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participants, { lang: language });
      
      // Verify
      expect(result).not.toContain(tr(language, 'formatter.labels.meetingPoint'));
      expect(result).not.toContain(tr(language, 'formatter.labels.route'));
      expect(result).not.toContain(tr(language, 'formatter.labels.distance'));
      expect(result).not.toContain(tr(language, 'formatter.labels.duration'));
      expect(result).not.toContain(tr(language, 'formatter.labels.speed'));
    });
    
    it('should format participants correctly', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = {
        joined: [
          { userId: 456, firstName: 'Test1', lastName: 'User1', username: 'testuser1' },
          { userId: 789, firstName: 'Test2', lastName: 'User2' }, // No username
          { userId: 101112, username: 'testuser3' } // Legacy format
        ],
        thinking: [],
        skipped: []
      };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation);
      
      // Verify
      expect(result).toContain('<a href="tg://user?id=456">Test1 User1 (@testuser1)</a>');
      expect(result).toContain('<a href="tg://user?id=789">Test2 User2</a>');
      expect(result).toContain('<a href="tg://user?id=101112">@testuser3</a>');
    });

    it('should format date using the selected message language', () => {
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };

      const formatSpy = jest.spyOn(DateParser, 'formatDateTime');
      messageFormatter.formatRideMessage(ride, { joined: [], thinking: [], skipped: [] }, { lang: 'ru' });

      expect(formatSpy).toHaveBeenCalledWith(ride.date, 'ru');
    });

    it.each(['en', 'ru'])('should truncate participants when there are more than MAX_PARTICIPANTS_DISPLAY (%s)', (language) => {
      // Setup
      config.maxParticipantsDisplay = 3; // Set a specific limit for this test
      
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = {
        joined: [
          { userId: 1, firstName: 'User1', lastName: 'One', username: 'user1' },
          { userId: 2, firstName: 'User2', lastName: 'Two', username: 'user2' },
          { userId: 3, firstName: 'User3', lastName: 'Three', username: 'user3' },
          { userId: 4, firstName: 'User4', lastName: 'Four', username: 'user4' },
          { userId: 5, firstName: 'User5', lastName: 'Five', username: 'user5' }
        ],
        thinking: [],
        skipped: []
      };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation, { lang: language });
      
      // Verify - should show first 3 participants and "and 2 more"
      expect(result).toContain('<a href="tg://user?id=1">User1 One (@user1)</a>');
      expect(result).toContain('<a href="tg://user?id=2">User2 Two (@user2)</a>');
      expect(result).toContain('<a href="tg://user?id=3">User3 Three (@user3)</a>');
      expect(result).toContain(tr(language, 'formatter.andMoreParticipants', { displayedList: '', count: 2 }).trim());
      
      // Should not contain the 4th and 5th participants
      expect(result).not.toContain('User4 Four');
      expect(result).not.toContain('User5 Five');
    });

    it('should show all participants when count is exactly MAX_PARTICIPANTS_DISPLAY', () => {
      // Setup
      config.maxParticipantsDisplay = 3; // Set a specific limit for this test
      
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = {
        joined: [
          { userId: 1, firstName: 'User1', lastName: 'One', username: 'user1' },
          { userId: 2, firstName: 'User2', lastName: 'Two', username: 'user2' },
          { userId: 3, firstName: 'User3', lastName: 'Three', username: 'user3' }
        ],
        thinking: [],
        skipped: []
      };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation);
      
      // Verify - should show all 3 participants without truncation
      expect(result).toContain('<a href="tg://user?id=1">User1 One (@user1)</a>');
      expect(result).toContain('<a href="tg://user?id=2">User2 Two (@user2)</a>');
      expect(result).toContain('<a href="tg://user?id=3">User3 Three (@user3)</a>');
      expect(result).not.toContain('and');
      expect(result).not.toContain('more');
    });

    it.each(['en', 'ru'])('should respect the configured maxParticipantsDisplay value (%s)', (language) => {
      // Setup - test with different limit values
      config.maxParticipantsDisplay = 2;
      
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = {
        joined: [
          { userId: 1, firstName: 'User1', lastName: 'One', username: 'user1' },
          { userId: 2, firstName: 'User2', lastName: 'Two', username: 'user2' },
          { userId: 3, firstName: 'User3', lastName: 'Three', username: 'user3' },
          { userId: 4, firstName: 'User4', lastName: 'Four', username: 'user4' }
        ],
        thinking: [],
        skipped: []
      };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation, { lang: language });
      
      // Verify - should show first 2 participants and "and 2 more"
      expect(result).toContain('<a href="tg://user?id=1">User1 One (@user1)</a>');
      expect(result).toContain('<a href="tg://user?id=2">User2 Two (@user2)</a>');
      expect(result).toContain(tr(language, 'formatter.andMoreParticipants', { displayedList: '', count: 2 }).trim());
      
      // Should not contain the 3rd and 4th participants
      expect(result).not.toContain('User3 Three');
      expect(result).not.toContain('User4 Four');
    });

    it.each(['en', 'ru'])('should always show Joined section even with no participants (%s)', (language) => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = {
        joined: [],
        thinking: [],
        skipped: []
      };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation, { lang: language });
      
      // Verify - should always show Joined section
      expect(result).toContain(`🚴 ${tr(language, 'formatter.participation.joined')} (0): ${tr(language, 'formatter.noOneJoinedYet')}`);
      expect(result).not.toContain(`🤔 ${tr(language, 'formatter.participation.thinking')}`);
      expect(result).not.toContain(`🙅 ${tr(language, 'formatter.participation.notInterested')}`);
    });

    it.each(['en', 'ru'])('should show Thinking section only when there are thinking participants (%s)', (language) => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = {
        joined: [],
        thinking: [
          { userId: 1, firstName: 'Thinker', lastName: 'One', username: 'thinker1' }
        ],
        skipped: []
      };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation, { lang: language });
      
      // Verify - should show Thinking section
      expect(result).toContain(`🚴 ${tr(language, 'formatter.participation.joined')} (0): ${tr(language, 'formatter.noOneJoinedYet')}`);
      expect(result).toContain(`🤔 ${tr(language, 'formatter.participation.thinking')} (1): <a href="tg://user?id=1">Thinker One (@thinker1)</a>`);
      expect(result).not.toContain(`🙅 ${tr(language, 'formatter.participation.notInterested')}`);
    });

    it.each(['en', 'ru'])('should show Not interested section only when there are skipped participants (%s)', (language) => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = {
        joined: [],
        thinking: [],
        skipped: [
          { userId: 1, firstName: 'Skipper', lastName: 'One', username: 'skipper1' },
          { userId: 2, firstName: 'Skipper', lastName: 'Two', username: 'skipper2' }
        ]
      };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation, { lang: language });
      
      // Verify - should show Not interested section with count only
      expect(result).toContain(`🚴 ${tr(language, 'formatter.participation.joined')} (0): ${tr(language, 'formatter.noOneJoinedYet')}`);
      expect(result).not.toContain(`🤔 ${tr(language, 'formatter.participation.thinking')}`);
      expect(result).toContain(`🙅 ${tr(language, 'formatter.participation.notInterested')}: 2`);
      // Should not show individual names for not interested
      expect(result).not.toContain('Skipper One');
      expect(result).not.toContain('Skipper Two');
    });

    it.each(['en', 'ru'])('should show all sections when all categories have participants (%s)', (language) => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = {
        joined: [
          { userId: 1, firstName: 'Joiner', lastName: 'One', username: 'joiner1' }
        ],
        thinking: [
          { userId: 2, firstName: 'Thinker', lastName: 'One', username: 'thinker1' }
        ],
        skipped: [
          { userId: 3, firstName: 'Skipper', lastName: 'One', username: 'skipper1' }
        ]
      };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation, { lang: language });
      
      // Verify - should show all sections
      expect(result).toContain(`🚴 ${tr(language, 'formatter.participation.joined')} (1): <a href="tg://user?id=1">Joiner One (@joiner1)</a>`);
      expect(result).toContain(`🤔 ${tr(language, 'formatter.participation.thinking')} (1): <a href="tg://user?id=2">Thinker One (@thinker1)</a>`);
      expect(result).toContain(`🙅 ${tr(language, 'formatter.participation.notInterested')}: 1`);
    });

    it.each(['en', 'ru'])('should include share line for ride creator (%s)', (language) => {
      // Setup
      const ride = {
        id: 'abc123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = { joined: [], thinking: [], skipped: [] };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation, { isForCreator: true, lang: language });
      
      // Verify - should include share line with correct spacing
      expect(result).toContain(tr(language, 'formatter.shareLine', { id: 'abc123' }));
      expect(result).toContain('🎫 #Ride #abc123');
      // Should have one empty line before and one after the share line
      expect(result).toContain(`\n\n${tr(language, 'formatter.shareLine', { id: 'abc123' })}\n\n🎫 #Ride #abc123`);
    });

    it.each(['en', 'ru'])('should not include share line for non-creator (%s)', (language) => {
      // Setup
      const ride = {
        id: 'abc123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participation = { joined: [], thinking: [], skipped: [] };
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participation, { isForCreator: false, lang: language });
      
      // Verify - should not include share line and have correct spacing
      expect(result).not.toContain(tr(language, 'formatter.shareLine', { id: 'abc123' }));
      expect(result).toContain('🎫 #Ride #abc123');
      // Should have only one empty line before the #Ride line
      expect(result).toMatch(/\n\n🎫 #Ride #abc123/);
    });
  });
  
  describe('formatRidesList', () => {
    it.each(['en', 'ru'])('should format a list of rides (%s)', (language) => {
      config.i18n.defaultLanguage = language;
      // Setup
      const rides = [
        {
          id: '123',
          title: 'Test Ride 1',
          date: new Date('2025-03-30T10:00:00Z'),
          meetingPoint: 'Location 1'
        },
        {
          id: '456',
          title: 'Test Ride 2',
          date: new Date('2025-03-31T11:00:00Z'),
          cancelled: true
        }
      ];
      
      // Execute
      const result = messageFormatter.formatRidesList(rides, 0, 1);
      
      // Verify
      expect(result).toContain(tr(language, 'formatter.yourRidesTitle'));
      expect(result).toContain('Test Ride 1');
      expect(result).toContain('Location 1');
      expect(result).toContain('Test Ride 2');
      expect(result).toContain(tr(language, 'templates.cancelled').replace('❌ ', ''));
      expect(result).toContain('Ride #123');
      expect(result).toContain('Ride #456');
    });
    
    it.each(['en', 'ru'])('should handle empty rides list (%s)', (language) => {
      config.i18n.defaultLanguage = language;
      // Execute
      const result = messageFormatter.formatRidesList([], 0, 0);
      
      // Verify
      expect(result).toBe(tr(language, 'formatter.noCreatedRides'));
    });
    
    it.each(['en', 'ru'])('should include pagination info when there are multiple pages (%s)', (language) => {
      config.i18n.defaultLanguage = language;
      // Setup
      const rides = [
        {
          id: '123',
          title: 'Test Ride',
          date: new Date('2025-03-30T10:00:00Z')
        }
      ];
      
      // Execute
      const result = messageFormatter.formatRidesList(rides, 2, 3);
      
      // Verify
      expect(result).toContain(tr(language, 'formatter.pageLabel', { page: 2, totalPages: 3 }));
    });
  });
  
  describe('formatDuration', () => {
    it.each(['en', 'ru'])('should format duration less than an hour (%s)', (language) => {
      expect(messageFormatter.formatDuration(45, language)).toBe(`45 ${tr(language, 'formatter.units.min')}`);
    });
    
    it.each(['en', 'ru'])('should format duration of exact hours (%s)', (language) => {
      expect(messageFormatter.formatDuration(120, language)).toBe(`2 ${tr(language, 'formatter.units.hour')}`);
    });
    
    it.each(['en', 'ru'])('should format duration with hours and minutes (%s)', (language) => {
      expect(messageFormatter.formatDuration(125, language)).toBe(`2 ${tr(language, 'formatter.units.hour')} 5 ${tr(language, 'formatter.units.min')}`);
    });
  });
  
  describe('formatSpeedRange', () => {
    it.each(['en', 'ru'])('should format speed range with min and max (%s)', (language) => {
      expect(messageFormatter.formatSpeedRange(25, 30, language)).toBe(`25-30 ${tr(language, 'formatter.units.kmh')}`);
    });

    it.each(['en', 'ru'])('should format average speed (min === max) (%s)', (language) => {
      expect(messageFormatter.formatSpeedRange(25, 25, language)).toBe(`~25 ${tr(language, 'formatter.units.kmh')}`);
    });

    it.each(['en', 'ru'])('should format speed range with only min (%s)', (language) => {
      expect(messageFormatter.formatSpeedRange(25, null, language)).toBe(`25+ ${tr(language, 'formatter.units.kmh')}`);
    });

    it.each(['en', 'ru'])('should format speed range with only max (%s)', (language) => {
      expect(messageFormatter.formatSpeedRange(null, 30, language)).toBe(tr(language, 'formatter.upToSpeed', { max: 30 }));
    });
  });
});
