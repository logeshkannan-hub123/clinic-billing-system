import MongoStore from "connect-mongo";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { loadSessionTimeoutCache } from "./services/clinicSettingsService.js";

async function main(): Promise<void> {
  await connectDb();
  await loadSessionTimeoutCache();

  const app = createApp({
    sessionStore: MongoStore.create({ mongoUrl: env.mongoUri, collectionName: "sessions" }),
  });

  app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
  });
}

main().catch((error: unknown) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
