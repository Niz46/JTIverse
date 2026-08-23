// apps/api/src/worker.ts
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrapWorker() {
  const logger = new Logger("WorkerBootstrap");

  // Creates application context without HTTP server listener
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.enableShutdownHooks();
  logger.log(
    "🚀 JTIverse Worker Process initialized and listening for BullMQ jobs...",
  );
}

bootstrapWorker().catch((err) => {
  console.error("Worker failed to start", err);
  process.exit(1);
});
