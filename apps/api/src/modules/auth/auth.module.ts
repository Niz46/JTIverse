import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkAuthGuard } from './guards/clerk-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ClerkWebhookController } from './webhooks/clerk-webhook.controller';

/**
 * PrismaService is deliberately NOT listed in this module's providers.
 * CommonModule is marked @Global() and already provides + exports it —
 * adding it again here creates a SECOND PrismaClient instance (and a
 * second Postgres connection pool) scoped to just this module, instead
 * of reusing the single shared one. That's what caused the double
 * "Prisma connected via pg adapter" log line on boot: two separate
 * instances, each independently calling $connect().
 *
 * This matters beyond tidiness — DATABASE_URL now has an explicit
 * connection_limit=20 cap (see .env). Every module that mistakenly
 * declares its own PrismaService eats into that same 20-connection
 * budget with a redundant pool, rather than sharing the one pool
 * across the whole app. Any future module (Users, Titles, Comments,
 * Rooms) should follow this same rule: inject PrismaService via
 * constructor, never re-list it in that module's own providers array.
 *
 * GUARD ORDER MATTERS: Nest runs multiple APP_GUARD providers in the
 * order they're registered in this array. ClerkAuthGuard MUST come
 * before RolesGuard — it's the one that verifies the session token
 * and attaches `request.user`, which RolesGuard then reads to check
 * `.role`. Reversing this order would make RolesGuard run against a
 * request with no user attached yet.
 */
@Module({
  controllers: [ClerkWebhookController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AuthModule {}