import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User } from "@prisma/client";
import {
  UpdateProfileDto,
  BIO_MAX_LENGTH,
  VALID_GENDERS,
} from "./dto/update-profile.dto";

/**
 * USERS CONTROLLER
 * -----------------
 * The self-service counterpart to AdminController: a logged-in user
 * viewing and editing THEIR OWN row, not someone else's. Scope is
 * deliberately narrow — see the roadmap in the project summary,
 * "Users module: view and edit own profile: bio, avatar, gender,
 * see which titles they own."
 *
 * Route split, and why it differs from Admin's one-endpoint-per-field
 * pattern:
 *   - GET /users/me and PATCH /users/me are for the AUTHENTICATED
 *     user's own row. No :id param — @CurrentUser() is the only
 *     source of "which user", so there is no way to view or edit
 *     someone else's profile through this route, by construction.
 *   - PATCH /users/me updates bio/avatarUrl/gender together as one
 *     profile save, unlike Admin's ban/role split. Admin splits
 *     because ban and role are independently dangerous (each needs
 *     its own guard logic — can't-ban-an-admin, can't-self-demote —
 *     and its own audit log line). Profile fields carry none of
 *     that risk relative to each other; splitting them would only
 *     add endpoint noise for a plain "save my profile" action.
 *   - GET /users/:id is a separate, PUBLIC, read-only route for
 *     viewing ANY user's public profile (their comment history will
 *     link here once Comments exists) — explicitly trimmed to
 *     public-safe fields, same spirit as PublicUser in packages/types.
 *     This is intentionally a different shape from Admin's
 *     GET /admin/users/:id, which includes moderation-relevant
 *     fields (isBanned, isShadowbanned, email) that must never be
 *     exposed on a public profile route.
 *   - equippedTitleId is NOT editable here. Equipping a title
 *     requires checking the user actually owns it (via UserTitle) —
 *     that ownership-aware logic belongs to the Titles module's
 *     equip/unequip endpoint (roadmap item #2), not a plain profile
 *     PATCH that could otherwise let a user "equip" a title they
 *     never unlocked by just posting an arbitrary id.
 */
@Controller("users")
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The authenticated user's own full profile, including fields that
   * are theirs to see about themselves (tokenBalance, hasCompletedOnboarding)
   * but that a stranger viewing GET /users/:id should not see.
   */
  @Get("me")
  async getMe(@CurrentUser() user: User) {
    const full = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        email: true,
        gender: true,
        avatarUrl: true,
        bio: true,
        tokenBalance: true,
        hasCompletedOnboarding: true,
        role: true,
        createdAt: true,
        equippedTitle: {
          select: {
            id: true,
            title: {
              select: {
                id: true,
                name: true,
                tier: true,
                colorHex: true,
                gradientHex: true,
                isAnimated: true,
              },
            },
          },
        },
        ownedTitles: {
          select: {
            id: true,
            unlockedAt: true,
            title: {
              select: {
                id: true,
                name: true,
                tier: true,
                colorHex: true,
                gradientHex: true,
                isAnimated: true,
                sortOrder: true,
              },
            },
          },
          orderBy: { title: { sortOrder: "asc" } },
        },
        // Deliberately NOT selecting clerkId or passwordHash — internal
        // identity-provider linkage and an unused legacy field, same
        // reasoning AdminController already applies to its own queries.
      },
    });

    // Should be unreachable: ClerkAuthGuard already guarantees the row
    // exists (it throws UnauthorizedException otherwise) before this
    // handler runs. Guarding anyway rather than assuming that
    // invariant can never change, same defensive style RolesGuard
    // uses for its own "should be unreachable" case.
    if (!full) {
      throw new NotFoundException("User record not found");
    }

    return full;
  }

  /**
   * Update the authenticated user's own bio / avatarUrl / gender.
   * All three fields are optional in the body — only the ones present
   * are updated, so a client can PATCH just `{ bio: "..." }` without
   * needing to resend avatarUrl and gender unchanged.
   */
  @Patch("me")
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    const data: {
      bio?: string | null;
      avatarUrl?: string | null;
      gender?: User["gender"];
    } = {};

    if ("bio" in dto) {
      if (dto.bio !== null && typeof dto.bio !== "string") {
        throw new BadRequestException("bio must be a string or null");
      }
      if (dto.bio && dto.bio.length > BIO_MAX_LENGTH) {
        throw new BadRequestException(
          `bio must be ${BIO_MAX_LENGTH} characters or fewer`,
        );
      }
      data.bio = dto.bio;
    }

    if ("avatarUrl" in dto) {
      if (dto.avatarUrl !== null && typeof dto.avatarUrl !== "string") {
        throw new BadRequestException("avatarUrl must be a string or null");
      }
      data.avatarUrl = dto.avatarUrl;
    }

    if (dto.gender !== undefined) {
      if (!VALID_GENDERS.includes(dto.gender)) {
        throw new BadRequestException(`Invalid gender: ${dto.gender}`);
      }
      data.gender = dto.gender;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        "Provide at least one of: bio, avatarUrl, gender",
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        username: true,
        gender: true,
        avatarUrl: true,
        bio: true,
      },
    });

    this.logger.log(
      `User ${updated.username} (${updated.id}) updated profile fields: ${Object.keys(data).join(", ")}`,
    );

    return updated;
  }

  /**
   * Public-safe view of ANY user's profile by id — for viewing other
   * users, once something links here (comment author, room host,
   * leaderboard entry). Explicitly trimmed: no email, no isBanned/
   * isShadowbanned, no tokenBalance breakdown beyond the balance
   * itself, matching PublicUser's shape in packages/types/index.ts.
   */
  @Public()
  @Get(":id")
  async getPublicProfile(@Param("id") id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        gender: true,
        avatarUrl: true,
        bio: true,
        tokenBalance: true,
        role: true,
        createdAt: true,
        equippedTitle: {
          select: {
            title: {
              select: {
                id: true,
                name: true,
                tier: true,
                colorHex: true,
                gradientHex: true,
                isAnimated: true,
                unlockNote: true,
                isDefault: true,
                tokenCost: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`No user with id ${id}`);
    }

    // Flatten equippedTitle from Prisma's { equippedTitle: { title: {...} } }
    // shape into PublicTitle-shaped { equippedTitle: {...} } directly, per
    // packages/types/index.ts. The extra nesting exists in the DB because
    // UserTitle (the join row) is what User.equippedTitle actually points
    // to, not Title itself — see schema.prisma's EquippedTitle relation.
    // That's correct at the DB layer but must not leak into the API
    // response, or the frontend's PublicUser consumers break.
    const { equippedTitle, ...rest } = user;
    return {
      ...rest,
      equippedTitle: equippedTitle?.title ?? null,
    };
  }
}
