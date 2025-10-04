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
      const migrations = this.getMigrations();
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
    const migrations = this.getMigrations();
    return migrations.length > 0 ? Math.max(...migrations.map(m => m.version)) : 0;
  }

  /**
   * Validate that the database schema is up to date
   * @throws {Error} If schema version is outdated
   */
  async validateSchemaVersion() {
    await this.connect();
    
    try {
      const currentVersion = await this.getCurrentVersion();
      const requiredVersion = this.getRequiredVersion();
      
      if (currentVersion < requiredVersion) {
        const errorMessage = `Database schema is outdated. Current version: ${currentVersion}, Required version: ${requiredVersion}. Please run migrations first (see README.md).`;
        console.error('Schema validation failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      console.log(`Schema validation passed. Current version: ${currentVersion}`);
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Get all available migrations
   * @returns {Array} Array of migration objects
   */
  getMigrations() {
    return [
      {
        version: 1,
        name: 'Add participation states (join/thinking/skip)',
        up: async (db) => {
          // Migration logic will be implemented in separate file
          const { migrateToParticipationStates } = await import('./migrations/001_participation_states.js');
          await migrateToParticipationStates(db);
        }
      }
      // Future migrations can be added here
    ];
  }
}
