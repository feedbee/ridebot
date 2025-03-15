import { RideWizard } from '../../wizard/RideWizard.js';
import { config } from '../../config.js';

// Mock storage implementation
class MockStorage {
  constructor() {
    this.rides = new Map();
    this.participants = new Map();
    this.nextId = 1;
  }

  async createRide(ride) {
    const id = this.nextId++;
    const newRide = { ...ride, id: id.toString(), participants: [] };
    this.rides.set(id.toString(), newRide);
    return newRide;
  }

  async updateRide(rideId, updates) {
    const ride = this.rides.get(rideId);
    if (!ride) throw new Error('Ride not found');
    const updated = { ...ride, ...updates };
    this.rides.set(rideId, updated);
    return updated;
  }

  async getParticipants(rideId) {
    return this.participants.get(rideId) || [];
  }
}

// Mock context factory
const createMockContext = (userId = 123, chatId = 456) => {
  const messages = [];
  const deletedMessages = [];
  const editedMessages = [];
  let lastCallbackAnswer = null;

  return {
    from: { id: userId },
    chat: { id: chatId },
    message: { message_id: 1 },
    match: [],
    reply: async (text, extra = {}) => {
      const messageId = messages.length + 1;
      const message = { message_id: messageId, text, ...extra };
      messages.push(message);
      return message;
    },
    api: {
      deleteMessage: async (chatId, messageId) => {
        deletedMessages.push({ chatId, messageId });
        return true;
      },
      editMessageText: async (chatId, messageId, text, extra = {}) => {
        const message = { chatId, messageId, text, ...extra };
        editedMessages.push(message);
        return message;
      }
    },
    deleteMessage: async () => {
      deletedMessages.push({ chatId, messageId: 1 });
      return true;
    },
    answerCallbackQuery: async (text) => {
      lastCallbackAnswer = text;
      return true;
    },
    _test: {
      messages,
      deletedMessages,
      editedMessages,
      getLastCallbackAnswer: () => lastCallbackAnswer,
      reset: () => {
        messages.length = 0;
        deletedMessages.length = 0;
        editedMessages.length = 0;
        lastCallbackAnswer = null;
      }
    }
  };
};

describe('RideWizard', () => {
  let wizard;
  let storage;
  let ctx;

  beforeEach(() => {
    storage = new MockStorage();
    wizard = new RideWizard(storage);
    ctx = createMockContext();
  });

  afterEach(() => {
    ctx._test.reset();
  });

  describe('Wizard State Management', () => {
    test('should start a new wizard session', async () => {
      await wizard.startWizard(ctx);
      expect(ctx._test.messages[0].text).toContain('Please enter the ride title');
    });

    test('should prevent starting multiple wizards', async () => {
      await wizard.startWizard(ctx);
      await wizard.startWizard(ctx);
      expect(ctx._test.messages[1].text).toContain('Please complete or cancel');
    });

    test('should handle wizard cancellation', async () => {
      await wizard.startWizard(ctx);
      ctx.match = ['wizard:cancel', 'cancel'];
      await wizard.handleWizardAction(ctx);
      expect(ctx._test.messages[1].text).toBe('Ride creation cancelled');
    });
  });

  describe('Wizard Navigation', () => {
    test('should handle back button navigation', async () => {
      await wizard.startWizard(ctx);
      
      // Move to date step
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);
      
      // Go back to title step
      ctx.match = ['wizard:back', 'back'];
      await wizard.handleWizardAction(ctx);
      
      const lastMessage = ctx._test.editedMessages[ctx._test.editedMessages.length - 1];
      expect(lastMessage.text).toContain('Please enter the ride title');
    });

    test('should handle skip button for optional fields', async () => {
      await wizard.startWizard(ctx);
      
      // Fill required fields first
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);
      
      ctx.message = { text: 'tomorrow at 2pm', message_id: 3 };
      await wizard.handleWizardInput(ctx);
      
      // Skip route
      ctx.match = ['wizard:skip', 'skip'];
      await wizard.handleWizardAction(ctx);
      
      const lastMessage = ctx._test.editedMessages[ctx._test.editedMessages.length - 1];
      expect(lastMessage.text).toContain('Please enter the distance');
    });
  });

  describe('Input Handling', () => {
    test('should handle title input', async () => {
      await wizard.startWizard(ctx);
      ctx.message = { text: 'Evening Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);
      
      const lastMessage = ctx._test.editedMessages[ctx._test.editedMessages.length - 1];
      expect(lastMessage.text).toContain('When is the ride?');
    });

    test('should handle date input', async () => {
      await wizard.startWizard(ctx);
      
      // Set title first
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);
      
      // Set date
      ctx.message = { text: 'tomorrow at 2pm', message_id: 3 };
      await wizard.handleWizardInput(ctx);
      
      const lastMessage = ctx._test.editedMessages[ctx._test.editedMessages.length - 1];
      expect(lastMessage.text).toContain('Please enter the route link');
    });

    test('should handle invalid date input', async () => {
      await wizard.startWizard(ctx);
      
      // Set title first
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);
      
      // Set invalid date
      ctx.message = { text: 'not a date', message_id: 3 };
      await wizard.handleWizardInput(ctx);
      
      expect(ctx._test.messages).toHaveLength(2); // Initial message + error message
      expect(ctx._test.messages[1].text).toContain('I couldn\'t understand that date/time format');
    });

    test('should handle route link input', async () => {
      await wizard.startWizard(ctx);
      
      // Fill required fields first
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);
      
      ctx.message = { text: 'tomorrow at 2pm', message_id: 3 };
      await wizard.handleWizardInput(ctx);
      
      // Set route
      ctx.message = { text: 'https://example.com/route', message_id: 4 };
      await wizard.handleWizardInput(ctx);
      
      const lastMessage = ctx._test.editedMessages[ctx._test.editedMessages.length - 1];
      expect(lastMessage.text).toContain('Please enter the distance');
    });
  });

  describe('Ride Creation', () => {
    test('should create a ride with all fields filled', async () => {
      await wizard.startWizard(ctx);
      
      // Fill all fields
      const inputs = [
        { text: 'Evening Ride', step: 'title' },
        { text: 'tomorrow at 6pm', step: 'date' },
        { text: 'https://example.com/route', step: 'route' },
        { text: '50', step: 'distance' },
        { text: '120', step: 'duration' },
        { text: '25-28', step: 'speed' },
        { text: 'City Center', step: 'meet' }
      ];
      
      for (const input of inputs) {
        ctx.message = { text: input.text, message_id: ctx._test.messages.length + 2 };
        await wizard.handleWizardInput(ctx);
      }
      
      // Confirm creation
      ctx.match = ['wizard:confirm', 'confirm'];
      await wizard.handleWizardAction(ctx);
      
      // Verify ride was created
      const createdRide = Array.from(storage.rides.values())[0];
      expect(createdRide).toBeDefined();
      expect(createdRide.title).toBe('Evening Ride');
      expect(createdRide.meetingPoint).toBe('City Center');
      expect(createdRide.speedMin).toBe(25);
      expect(createdRide.speedMax).toBe(28);
    });

    test('should create a ride with minimal required fields', async () => {
      await wizard.startWizard(ctx);
      
      // Fill only required fields
      const inputs = [
        { text: 'Quick Ride', step: 'title' },
        { text: 'tomorrow at 3pm', step: 'date' }
      ];
      
      for (const input of inputs) {
        ctx.message = { text: input.text, message_id: ctx._test.messages.length + 2 };
        await wizard.handleWizardInput(ctx);
      }
      
      // Skip optional fields
      for (let i = 0; i < 5; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }
      
      // Confirm creation
      ctx.match = ['wizard:confirm', 'confirm'];
      await wizard.handleWizardAction(ctx);
      
      // Verify ride was created
      const createdRide = Array.from(storage.rides.values())[0];
      expect(createdRide).toBeDefined();
      expect(createdRide.title).toBe('Quick Ride');
      expect(createdRide.routeLink).toBeUndefined();
      expect(createdRide.distance).toBeUndefined();
    });
  });
}); 
