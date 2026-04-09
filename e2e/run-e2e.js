import { createTelegramE2EDriverFromEnv } from './client/telegram-e2e-driver.js';
import { runRideLifecycleE2ETest } from './tests/ride-lifecycle.e2e.test.js';

async function main() {
  const driver = await createTelegramE2EDriverFromEnv();

  try {
    const result = await runRideLifecycleE2ETest(driver);
    console.log(`PASS ${result.name}: ${result.rideId} (${result.title})`);
  } finally {
    await driver.disconnect();
  }
}

main().catch(error => {
  console.error('Telegram E2E run failed:', error);
  process.exitCode = 1;
});
