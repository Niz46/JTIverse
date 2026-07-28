import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { User } from "@prisma/client";

/**
 * Extracts the authenticated User row (attached by ClerkAuthGuard)
 * inside a controller method. Only populated on routes NOT marked
 * @Public() — on a public route, this will be undefined.
 *
 * Usage: @Get('me')
 *        async me(@CurrentUser() user: User) { return user; }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);