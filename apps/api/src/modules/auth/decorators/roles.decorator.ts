import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@prisma/client";

export const ROLES_KEY = "roles";

/**
 * Marks a route (or controller) as requiring one of the given roles.
 * Works alongside ClerkAuthGuard, which already runs globally and
 * attaches `request.user` — RolesGuard (see guards/roles.guard.ts)
 * reads that same user and checks `.role` against what's listed here.
 *
 * Usage: @Roles('ADMIN')
 *        @Post('sync/jikan')
 *        async syncJikan() { ... }
 *
 * Do NOT combine with @Public() on the same route — @Public() skips
 * authentication entirely, which means request.user is never set,
 * which means RolesGuard has nothing to check and will reject the
 * request. Public routes are for anonymous browsing; role-gated
 * routes require a real, authenticated, sufficiently-privileged user.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
