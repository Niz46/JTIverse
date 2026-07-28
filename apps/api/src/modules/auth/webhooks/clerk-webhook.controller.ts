import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
  RawBodyRequest,
} from "@nestjs/common";
import { Request } from "express";
import { Webhook } from "svix";
import { Public } from "../decorators/public.decorator";
import { PrismaService } from "../../../common/prisma.service";

/**
 * CLERK WEBHOOK CONTROLLER
 * ------------------------
 * Receives user.created / user.updated / user.deleted events from
 * Clerk so this Postgres database has a User row to attach
 * WatchEvents, Comments, TokenTransactions, etc. to. Clerk itself
 * never sees or stores any of that — it only manages identity.
 *
 * Auth for this endpoint is NOT the ClerkAuthGuard — Clerk's webhook
 * caller isn't a signed-in user, it's Clerk's own server calling
 * yours. It proves authenticity via an HMAC signature (the svix-*
 * headers) instead, verified below using CLERK_WEBHOOK_SECRET.
 * @Public() opts this route out of the global guard — do not remove it,
 * and do not add Clerk-session auth here, since Clerk's webhook caller
 * has no session token to present.
 *
 * REQUIRES rawBody: true in main.ts's NestFactory.create() call — see
 * the flagged section below. svix's Webhook.verify() needs the exact,
 * unmodified request bytes; a signature mismatch here almost always
 * means rawBody isn't wired up yet, not a wrong secret.
 */
@Controller("webhooks/clerk")
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("svix-id") svixId: string,
    @Headers("svix-timestamp") svixTimestamp: string,
    @Headers("svix-signature") svixSignature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException(
        "Raw body not available — check rawBody: true in main.ts",
      );
    }
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException("Missing svix headers");
    }

    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET ?? "");
    let event: { type: string; data: any };

    try {
      event = wh.verify(req.rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as { type: string; data: any };
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${err}`);
      throw new BadRequestException("Invalid webhook signature");
    }

    switch (event.type) {
      case "user.created":
        await this.handleUserCreated(event.data);
        break;
      case "user.updated":
        await this.handleUserUpdated(event.data);
        break;
      case "user.deleted":
        // Deliberately not implemented: hard-deleting the User row
        // would either fail against existing Comments/WatchEvents/
        // TokenTransactions (no onDelete: Cascade set on those
        // relations right now) or, if cascade gets added later,
        // silently erase a user's comment history. Whether Clerk
        // account deletion should soft-ban, anonymize, or truly
        // delete here is a real product decision — not one to
        // guess at silently.
        this.logger.warn(
          `Received user.deleted for Clerk ID ${event.data.id} — no handler implemented, see comment above`,
        );
        break;
      default:
        this.logger.log(`Unhandled Clerk webhook event type: ${event.type}`);
    }

    return { received: true };
  }

  private async handleUserCreated(data: any): Promise<void> {
    const email = data.email_addresses?.[0]?.email_address;
    if (!email) {
      this.logger.error(
        `user.created webhook for ${data.id} has no email address — skipping`,
      );
      return;
    }

    // Not every OAuth provider hands Clerk a username (TikTok and
    // Facebook profiles don't always expose one) — fall back to a
    // slug derived from the Clerk ID so User.username's @unique
    // constraint never blocks account creation.
    const username = data.username ?? `user_${data.id.slice(-8)}`;

    const userId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { clerkId: data.id },
        create: {
          clerkId: data.id,
          email,
          username,
          avatarUrl: data.image_url ?? null,
        },
        update: {}, // create-only path; user.updated handles later changes
      });

      // Auto-grant the default NPC title, per the product spec: every
      // new user starts at NPC until they earn tokens and buy something
      // better. Requires a Title row with isDefault: true to already
      // exist — if you haven't written that seed yet, this no-ops with
      // a warning below rather than failing signup.
      const npcTitle = await tx.title.findFirst({
        where: { isDefault: true },
      });

      if (npcTitle) {
        const userTitle = await tx.userTitle.upsert({
          where: { userId_titleId: { userId: user.id, titleId: npcTitle.id } },
          create: { userId: user.id, titleId: npcTitle.id },
          update: {},
        });

        await tx.user.update({
          where: { id: user.id },
          data: { equippedTitleId: userTitle.id },
        });
      } else {
        this.logger.warn(
          "No Title row has isDefault: true — NPC title not seeded yet. Seed it before going live.",
        );
      }

      return user.id;
    });

    this.logger.log(`Synced new user ${userId} from Clerk`);
  }

  private async handleUserUpdated(data: any): Promise<void> {
    const email = data.email_addresses?.[0]?.email_address;

    await this.prisma.user.updateMany({
      where: { clerkId: data.id },
      data: {
        ...(email ? { email } : {}),
        ...(data.image_url ? { avatarUrl: data.image_url } : {}),
      },
    });
  }
}
