#!/usr/bin/env node

/**
 * Migration script for MongoDB schema updates
 * 
 * Usage:
 *   node scripts/migrate.js
 *   docker run --rm -e MONGODB_URI=mongodb://... bike-ride-bot npm run migrate
 */

import { MigrationRunner } from '../src/migrations/MigrationRunner.js';
import { config } from '../src/config.js';

async function main() {
  if (!config.mongodb?.uri) {
    console.error('Error: MONGODB_URI environment variable is required');
    process.exit(1);
  }
  
  console.log('Starting database migration...');
  console.log(`MongoDB URI: ${config.mongodb.uri.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials in logs
  
  const runner = new MigrationRunner(config.mongodb.uri);
  
  try {
    await runner.runMigrations();
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
