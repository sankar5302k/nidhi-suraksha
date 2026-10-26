import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../../src/db/mongo.js';

let mongod: MongoMemoryServer | null = null;

export async function setupTestDb(): Promise<void> {
  // Increase timeout if downloading binary
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await connectMongo(uri);
}

export async function teardownTestDb(): Promise<void> {
  await disconnectMongo();
  if (mongod) {
    await mongod.stop();
  }
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}
