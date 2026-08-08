import {
  Controller,
  Post,
  Param,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User } from "@prisma/client";

/**
 * TITLES CONTROLLER (equip/unequip only — roadmap item #2)
 * ----------------------------------------------------------
 * Deliberately NOT the Titles shop (item #3). This controller has no
 * tokenCost logic and never touches TokenTransaction or
 * User.tokenBalance — it only changes WHICH already-owned title is
 * displayed. Buying a new title (spending tokens against the 75
 * seeded rows, checking unlockNote achievement gates for the 4
 * gated Mythics) is a separate, larger piece of work that belongs
 * in its own titles-shop endpoint, not folded in here.
 *
 * Why this couldn't live in UsersController's profile PATCH:
 * equippedTitleId is a foreign key to UserTitle (the OWNERSHIP join
 * row), not to Title directly — see schema.prisma's
 * `equippedTitle UserTitle? @relation("EquippedTitle", ...)`. A
 * plain PATCH that accepted an arbitrary id would let a user equip
 * a title they never unlocked just by posting its UserTitle id (or
 * guessing/enumerating one). This endpoint's entire job is closing
 * that gap: verify ownership, THEN equip — never the other order.
 */
@Controller("titles")
export class TitlesController {
  private readonly logger = new Logger(TitlesController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Equip a title the authenticated user already owns.
   * :userTitleId is the UserTitle (ownership row) id, NOT the Title
   * id — this mirrors what equippedTitleId actually points to in the
   * schema, so no id-translation step is needed here or on read.
   */
  @Post(":userTitleId/equip")
  async equip(
    @Param("userTitleId") userTitleId: string,
    @CurrentUser() user: User,
  ) {
    const ownership = await this.prisma.userTitle.findUnique({
      where: { id: userTitleId },
      select: { id: true, userId: true, title: { select: { name: true } } },
    });

    if (!ownership) {
      throw new NotFoundException(`No owned title with id ${userTitleId}`);
    }

    // The core check this whole endpoint exists for: does the CALLER
    // own this UserTitle row, not just "does this row exist somewhere."
    // Comparing against user.id (from the verified session, via
    // ClerkAuthGuard) rather than trusting anything in the request body
    // or URL beyond the id being looked up.
    if (ownership.userId !== user.id) {
      throw new ForbiddenException("You do not own this title");
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { equippedTitleId: ownership.id },
      select: { id: true, username: true, equippedTitleId: true },
    });

    this.logger.log(
      `User ${updated.username} (${updated.id}) equipped title "${ownership.title.name}"`,
    );

    return updated;
  }

  /**
   * Unequip — clears equippedTitleId back to null. Not "equip NPC" or
   * any other fallback: null is a valid, distinct state (no title
   * shown), and forcing a fallback title here would be a product
   * decision this endpoint shouldn't make silently. If "always show
   * something" turns out to be the desired UX, that's a rendering
   * choice for the frontend/comment-badge layer, not a write here.
   */
  @Post("unequip")
  async unequip(@CurrentUser() user: User) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { equippedTitleId: null },
      select: { id: true, username: true, equippedTitleId: true },
    });

    this.logger.log(
      `User ${updated.username} (${updated.id}) unequipped title`,
    );

    return updated;
  }
}
