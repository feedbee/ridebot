import { config } from './config.js';
import { Bot } from './core/Bot.js';
import { MemoryStorage } from './storage/memory.js';
import { MongoDBStorage } from './storage/mongodb.js';

async function main() {
  const storage = config.isDev ? new MemoryStorage() : new MongoDBStorage();
  const bot = new Bot(storage);
  
  try {
    await bot.start();
    console.log(`Bot started in ${config.isDev ? 'development' : 'production'} mode`);
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main(); 
