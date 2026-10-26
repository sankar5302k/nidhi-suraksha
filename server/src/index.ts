import { getEnv } from './config/env.js';
import { connectMongo } from './db/mongo.js';
import { createApp } from './app.js';
import { Fdr } from './models/fdr.js';

async function bootstrap() {
  try {
    // 1. Strict environment validation at startup (fail fast)
    const env = getEnv();
    console.log(`[Nidhi Suraksha] Starting server in ${env.NODE_ENV} mode...`);

    // 2. Connect to MongoDB
    await connectMongo();
    console.log('[Nidhi Suraksha] Connected to MongoDB.');

    // 3. Auto-seed demo data if database is empty
    if (env.NODE_ENV !== 'production' || process.env.AUTO_SEED === 'true') {
      try {
        const count = await Fdr.countDocuments();
        if (count === 0) {
          console.log('[Nidhi Suraksha] Empty database detected. Seeding demo FDRs and institutions...');
          const { seedDatabase } = await import('./scripts/seed.js');
          await seedDatabase();
          console.log('[Nidhi Suraksha] Database auto-seeded successfully with 25 demonstration records.');
        }
      } catch (seedErr) {
        console.warn('[Nidhi Suraksha] Auto-seed warning:', seedErr);
      }
    }

    // 4. Create and start Express server (bind to 0.0.0.0 for Render cloud hosting)
    const app = createApp();
    app.listen(env.PORT, '0.0.0.0', () => {
      console.log(`[Nidhi Suraksha] Portal backend running on port ${env.PORT} (0.0.0.0)`);
      console.log(`[Nidhi Suraksha] Tagline: "Verify. Track. Release."`);
    });
  } catch (error) {
    console.error('[Nidhi Suraksha] Startup failure:', error);
    process.exit(1);
  }
}

// Only run automatically if executed directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
