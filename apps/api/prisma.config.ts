/// <reference types="node" />
import { defineConfig } from 'prisma/config';
import 'dotenv/config';

/**
 * PRISMA 7 CONFIG
 * ---------------
 * As of Prisma 7, `datasource.url` in schema.prisma is no longer read
 * by the CLI (Migrate/Studio). Connection info now lives here, and the
 * *runtime* PrismaClient additionally needs an explicit `adapter`
 * passed to its constructor — see common/prisma.service.ts. These are
 * two separate configuration points that must both point at the same
 * DATABASE_URL, or CLI commands (migrate, studio) will connect to a
 * different database than the running app does.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // This is the only piece `prisma migrate dev` actually needs from this
  // file. There is no `adapter` field inside `migrations` in Prisma 7's
  // config schema — that was my error in the previous version, and your
  // compiler caught it correctly. The driver adapter only applies to the
  // runtime PrismaClient (see common/prisma.service.ts), not to this CLI
  // config file.
  datasource: {
    url: connectionString,
  },
});