import "dotenv/config"; // MUST be first import — PrismaService and content services read process.env at construction time
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  // rawBody: true is required by ClerkWebhookController — svix's
  // Webhook.verify() needs the exact, unmodified request bytes to
  // check the HMAC signature. Without this flag, req.rawBody is
  // undefined and every webhook call throws BadRequestException.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Baseline HTTP security headers (HSTS, X-Content-Type-Options,
  // no X-Powered-By, etc). This sat behind nginx with no equivalent
  // header hardening in infra/nginx.conf and nothing here — helmet's
  // defaults are a reasonable floor for an API that will sit behind
  // a public load balancer serving 1000+ concurrent users.
  app.use(helmet());

  app.enableCors({
    origin: process.env.WEB_APP_URL ?? "http://localhost:3000",
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

bootstrap();
