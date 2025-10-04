import { config } from './config.js';
import { Bot } from './core/Bot.js';
import { MemoryStorage } from './storage/memory.js';
import { MongoDBStorage } from './storage/mongodb.js';
import packageJson from '../package.json' with { type: 'json' };

async function main() {
  const storage = config.isDev ? new MemoryStorage() : new MongoDBStorage();
  const bot = new Bot(storage);
  
  try {
    await bot.start();
    console.log(`🚀 Bike Ride Bot v${packageJson.version} started in ${config.isDev ? 'development' : 'production'} mode`);
  } catch (error) {
    console.error('Failed to start the bot:', error);
    process.exit(1);
  }
}

main(); 
