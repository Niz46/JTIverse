import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * PRISMA SERVICE
 * --------------
 * Prisma 7 requires the runtime PrismaClient to receive an explicit
 * `adapter` — this is the counterpart to prisma.config.ts, which only
 * covers the CLI (migrate/studio). Both must read DATABASE_URL from
 * the same place, or you'll get the confusing situation where
 * `migrate dev` succeeds against one database while the running app
 * silently talks to another (e.g. local vs. .env mismatch).
 *
 * Every module in this project imports THIS service, not a raw
 * `new PrismaClient()` — keeping the adapter wiring in one place
 * means a future Prisma config change only needs to happen here.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.",
      );
    }

    const adapter = new PrismaPg({ connectionString });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // $connect() doesn't round-trip with a driver adapter — force one
    // real query so a bad DATABASE_URL throws here, at boot, instead
    // of silently on the first user request.
    await this.$queryRaw`SELECT 1`;
    this.logger.log("Prisma connected via pg adapter");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
