import { MongoClient } from 'mongodb';

/**
 * Migration runner for MongoDB schema updates
 */
export class MigrationRunner {
  constructor(mongoUri) {
    this.mongoUri = mongoUri;
    this.client = null;
    this.db = null;
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    this.client = new MongoClient(this.mongoUri);
    await this.client.connect();
    this.db = this.client.db();
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    if (this.client) {
      await this.client.close();
    }
  }

  /**
   * Get current schema version
   * @returns {Promise<number>} Current schema version
   */
  async getCurrentVersion() {
    const metaDoc = await this.db.collection('meta').findOne({});
    return metaDoc ? metaDoc.schemaVersion : 0;
  }

  /**
   * Set schema version
   * @param {number} version - Schema version to set
   */
  async setVersion(version) {
    await this.db.collection('meta').replaceOne(
      {},
      { schemaVersion: version, updatedAt: new Date() },
      { upsert: true }
    );
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    await this.connect();

    try {
      const currentVersion = await this.getCurrentVersion();
      const migrations = MigrationRunner.getMigrations();
      const pendingMigrations = migrations.filter(m => m.version > currentVersion);

      console.log(`Current schema version: ${currentVersion}`);
      console.log(`Found ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        console.log(`Running migration ${migration.version}: ${migration.name}`);
        await migration.up(this.db);
        await this.setVersion(migration.version);
        console.log(`✓ Migration ${migration.version} completed`);
      }

      if (pendingMigrations.length === 0) {
        console.log('No migrations to run');
      } else {
        console.log(`All migrations completed. Schema version: ${await this.getCurrentVersion()}`);
      }
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Get the required schema version (latest migration version)
   * @returns {number} Required schema version
   */
  getRequiredVersion() {
    const migrations = MigrationRunner.getMigrations();
    return migrations.length > 0 ? Math.max(...migrations.map(m => m.version)) : 0;
  }

  /**
   * Validate that a given schema version meets the required version.
   * Contains all comparison logic and error messages.
   * @param {number} currentVersion - The current schema version from the database
   * @throws {Error} If the schema version is outdated
   */
  static validateVersion(currentVersion) {
    const migrations = MigrationRunner.getMigrations();
    const requiredVersion = migrations.length > 0 ? Math.max(...migrations.map(m => m.version)) : 0;
    if (currentVersion < requiredVersion) {
      const errorMessage = `Database schema is outdated. Current version: ${currentVersion}, Required version: ${requiredVersion}. Please run migrations first (see README.md).`;
      console.error('Schema validation failed:', errorMessage);
      throw new Error(errorMessage);
    }
    console.log(`Schema validation passed. Current version: ${currentVersion}`);
  }

  /**
   * Get all available migrations
   * @returns {Array} Array of migration objects
   */
  static getMigrations() {
    return [
      {
        version: 1,
        name: 'Add participation states (join/thinking/skip)',
        up: async (db) => {
          // Migration logic will be implemented in separate file
          const { migrateToParticipationStates } = await import('./migrations/001_participation_states.js');
          await migrateToParticipationStates(db);
        }
      },
      {
        version: 2,
        name: 'Normalize category values to canonical codes',
        up: async (db) => {
          const { migrateCategoryToCodes } = await import('./migrations/002_category_codes.js');
          await migrateCategoryToCodes(db);
        }
      }
      // Future migrations can be added here
    ];
  }
}
