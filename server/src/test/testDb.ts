import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongoServer: MongoMemoryReplSet | undefined;

export async function connectTestDb(): Promise<void> {
  // A single-node replica set (not a standalone instance) so tests can
  // exercise real MongoDB transactions — needed for payment-recording's
  // concurrency-safety tests.
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
}

export async function clearTestDb(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
  await mongoServer?.stop();
  mongoServer = undefined;
}
