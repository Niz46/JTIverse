import "dotenv/config"; // MUST be first import — PrismaService and content services read process.env at construction time
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.WEB_APP_URL ?? "http://localhost:3000",
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

bootstrap();
