import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * ROLES GUARD
 * -----------
 * Runs AFTER ClerkAuthGuard (both are registered as APP_GUARD in
 * AuthModule — Nest runs multiple APP_GUARDs in registration order,
 * so ClerkAuthGuard must be registered first; see auth.module.ts).
 * By the time this guard runs, `request.user` is either a real,
 * synced User row (ClerkAuthGuard attached it) or the request never
 * got this far (ClerkAuthGuard already rejected it).
 *
 * If a route has no @Roles() metadata at all, this guard allows it
 * through — role-checking is opt-in per route, not a second
 * authentication layer every route must declare. Most routes only
 * need ClerkAuthGuard (any logged-in user); only admin/moderator
 * routes need @Roles(...) on top.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // no @Roles() on this route — any authenticated user may proceed
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      // Should be unreachable in practice — ClerkAuthGuard runs first
      // and throws before this point if there's no valid user. Guarding
      // here anyway rather than assuming guard-registration order can
      // never change.
      throw new ForbiddenException('Authentication required');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}