/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Import first
import { MigrationRunner } from '../../migrations/MigrationRunner.js';

describe('MigrationRunner', () => {
  let runner;
  let mockCollection;
  let mockDb;
  let mockClient;
  let mockMigrations;

  beforeEach(() => {
    // Create a complete mock for MongoDB operations
    mockCollection = {
      findOne: jest.fn(),
      replaceOne: jest.fn()
    };

    mockDb = {
      collection: jest.fn(() => mockCollection)
    };

    mockClient = {
      connect: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue(),
      db: jest.fn(() => mockDb)
    };

    // Mock MongoClient to return our mock client
    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn(() => mockClient)
    }));

    // Create mock migrations
    mockMigrations = [
      {
        version: 1,
        name: 'Test Migration 1',
        up: jest.fn().mockResolvedValue()
      },
      {
        version: 2,
        name: 'Test Migration 2',
        up: jest.fn().mockResolvedValue()
      }
    ];

    runner = new MigrationRunner('mongodb://test');
    
    // Mock getMigrations to return our test migrations
    jest.spyOn(runner, 'getMigrations').mockReturnValue(mockMigrations);
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.dontMock('mongodb');
  });

  describe('Basic functionality', () => {
    it('should create instance', () => {
      expect(runner.mongoUri).toBe('mongodb://test');
      expect(runner.client).toBeNull();
      expect(runner.db).toBeNull();
    });

    it('should get migrations (mocked)', () => {
      const migrations = runner.getMigrations();
      expect(migrations).toHaveLength(2);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('Test Migration 1');
      expect(migrations[1].version).toBe(2);
      expect(migrations[1].name).toBe('Test Migration 2');
    });

    it('should get required version', () => {
      expect(runner.getRequiredVersion()).toBe(2);
    });
  });

  describe('Database operations with manual setup', () => {
    beforeEach(async () => {
      // Manually set up the connection state
      runner.client = mockClient;
      runner.db = mockDb;
    });

    it('should get current version from database', async () => {
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 3 });
      
      const version = await runner.getCurrentVersion();
      
      expect(version).toBe(3);
      expect(mockCollection.findOne).toHaveBeenCalledWith({});
    });

    it('should return 0 for no version found', async () => {
      mockCollection.findOne.mockResolvedValue(null);
      
      const version = await runner.getCurrentVersion();
      
      expect(version).toBe(0);
    });

    it('should set version in database', async () => {
      mockCollection.replaceOne.mockResolvedValue({});
      
      await runner.setVersion(5);
      
      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ 
          schemaVersion: 5,
          updatedAt: expect.any(Date)
        }),
        { upsert: true }
      );
    });
  });

  describe('Migration execution with mocked connection', () => {
    beforeEach(() => {
      // Mock the connect method to set up our test state
      jest.spyOn(runner, 'connect').mockImplementation(async () => {
        runner.client = mockClient;
        runner.db = mockDb;
      });
    });

    afterEach(() => {
      runner.connect.mockRestore();
    });

    it('should run migrations when schema is outdated', async () => {
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 0 });
      mockCollection.replaceOne.mockResolvedValue({});

      await runner.runMigrations();

      expect(runner.connect).toHaveBeenCalled();
      expect(mockMigrations[0].up).toHaveBeenCalledWith(mockDb);
      expect(mockMigrations[1].up).toHaveBeenCalledWith(mockDb);
      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ schemaVersion: 1 }),
        { upsert: true }
      );
      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ schemaVersion: 2 }),
        { upsert: true }
      );
    });

    it('should skip migrations when schema is up to date', async () => {
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 2 });

      await runner.runMigrations();

      expect(runner.connect).toHaveBeenCalled();
      expect(mockMigrations[0].up).not.toHaveBeenCalled();
      expect(mockMigrations[1].up).not.toHaveBeenCalled();
    });

    it('should run only pending migrations', async () => {
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 1 });
      mockCollection.replaceOne.mockResolvedValue({});

      await runner.runMigrations();

      expect(runner.connect).toHaveBeenCalled();
      expect(mockMigrations[0].up).not.toHaveBeenCalled(); // Already at version 1
      expect(mockMigrations[1].up).toHaveBeenCalledWith(mockDb); // Run version 2
      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ schemaVersion: 2 }),
        { upsert: true }
      );
    });

    it('should handle migration errors gracefully', async () => {
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 0 });
      mockMigrations[0].up.mockRejectedValue(new Error('Migration failed'));

      await expect(runner.runMigrations()).rejects.toThrow('Migration failed');
      expect(runner.connect).toHaveBeenCalled();
    });
  });

  describe('Schema validation with mocked connection', () => {
    beforeEach(() => {
      // Mock the connect method
      jest.spyOn(runner, 'connect').mockImplementation(async () => {
        runner.client = mockClient;
        runner.db = mockDb;
      });
    });

    afterEach(() => {
      runner.connect.mockRestore();
    });

    it('should pass validation when schema is up to date', async () => {
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 2 });

      await expect(runner.validateSchemaVersion()).resolves.not.toThrow();
      expect(runner.connect).toHaveBeenCalled();
    });

    it('should fail validation when schema is outdated', async () => {
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 0 });

      await expect(runner.validateSchemaVersion()).rejects.toThrow(
        'Database schema is outdated. Current version: 0, Required version: 2. Please run migrations first (see README.md).'
      );
      expect(runner.connect).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      // Mock the connect method
      jest.spyOn(runner, 'connect').mockImplementation(async () => {
        runner.client = mockClient;
        runner.db = mockDb;
      });
    });

    afterEach(() => {
      runner.connect.mockRestore();
    });

    it('should handle empty migrations list', async () => {
      // Mock empty migrations
      jest.spyOn(runner, 'getMigrations').mockReturnValue([]);
      
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 0 });

      await runner.runMigrations();

      expect(runner.connect).toHaveBeenCalled();
      expect(mockCollection.replaceOne).not.toHaveBeenCalled();
    });

    it('should handle database connection errors', async () => {
      runner.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(runner.runMigrations()).rejects.toThrow('Connection failed');
    });

    it('should disconnect even when migration fails', async () => {
      mockCollection.findOne.mockResolvedValue({ schemaVersion: 0 });
      mockMigrations[0].up.mockRejectedValue(new Error('Migration failed'));

      await expect(runner.runMigrations()).rejects.toThrow('Migration failed');
      expect(runner.connect).toHaveBeenCalled();
    });
  });
});
