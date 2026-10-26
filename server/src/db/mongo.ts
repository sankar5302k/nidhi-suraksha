import mongoose from 'mongoose';
import { getEnv } from '../config/env.js';

// Enable Mongoose global query filter sanitization
mongoose.set('sanitizeFilter', true);

let isConnected = false;
let memoryServerInstance: { stop: () => Promise<boolean | void>; getUri: () => string } | null = null;

export async function connectMongo(uriOverride?: string): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const uri = uriOverride || getEnv().MONGODB_URI;

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000,
      autoIndex: true
    });
    isConnected = true;
    return conn;
  } catch (error) {
    // In development mode, if local MongoDB replica set is not running, fall back to embedded memory instance
    if (getEnv().NODE_ENV !== 'production' && !uriOverride) {
      console.warn('[Nidhi Suraksha] Local MongoDB unreachable. Initializing embedded in-memory database for development...');
      try {
        const { MongoMemoryReplSet } = await import('mongodb-memory-server');
        const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        memoryServerInstance = replSet;
        const memUri = replSet.getUri();
        const conn = await mongoose.connect(memUri, { autoIndex: true });
        isConnected = true;
        console.log('[Nidhi Suraksha] Connected to embedded in-memory MongoDB replica set.');
        return conn;
      } catch {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        const memServer = await MongoMemoryServer.create();
        memoryServerInstance = memServer;
        const memUri = memServer.getUri();
        const conn = await mongoose.connect(memUri, { autoIndex: true });
        isConnected = true;
        console.log('[Nidhi Suraksha] Connected to embedded in-memory MongoDB standalone.');
        return conn;
      }
    }
    isConnected = false;
    throw error;
  }
}

export async function disconnectMongo(): Promise<void> {
  if (isConnected || mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
}
