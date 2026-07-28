import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { verifyToken } from "@clerk/backend";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { PrismaService } from "../../../common/prisma.service";

/**
 * CLERK AUTH GUARD
 * ----------------
 * Applied globally (see AuthModule) via APP_GUARD, so every route is
 * protected by default. Routes that should stay open to anonymous
 * users opt out with @Public().
 *
 * This guard does NOT talk to Google/Facebook/TikTok — Clerk's
 * frontend SDK in apps/web handles the actual OAuth redirect dance
 * with each provider. All this guard does is verify the session
 * token Clerk issued after that dance completed, regardless of
 * which provider (or plain email/password) the user signed in with.
 * One verification path here, no per-provider code in this codebase.
 *
 * authorizedParties is set below per Clerk's own security guidance —
 * without it, a token issued for a different origin sharing your
 * root domain could be replayed against this API. Set
 * CLERK_AUTHORIZED_PARTIES in .env to your real frontend origin(s)
 * before production; it's a placeholder below until you do.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw new UnauthorizedException("No token provided");
    }

    let clerkUserId: string;
    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
        authorizedParties: (process.env.CLERK_AUTHORIZED_PARTIES ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      clerkUserId = payload.sub;
    } catch (err) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    // Look up the local User row by clerkId rather than re-fetching from
    // Clerk's API on every request — that would add a network round trip
    // to every authenticated call. The webhook (clerk-webhook.controller.ts)
    // is what keeps this row in sync.
    const user = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      // Token is valid but no local row exists yet — this can happen in
      // the brief window between Clerk creating the account and the
      // user.created webhook landing. Reject rather than silently
      // creating a partial user row here; the webhook is the one place
      // user creation happens, so every user gets the same setup
      // (NPC title, etc.) regardless of which code path created them.
      throw new UnauthorizedException(
        "User not yet synced — try again shortly",
      );
    }

    if (user.isBanned) {
      throw new UnauthorizedException("Account banned");
    }

    (request as any).user = user;
    return true;
  }
}
