import { Gender } from "@prisma/client";

/**
 * UPDATE PROFILE DTO
 * -------------------
 * Deliberately just these three fields — bio, avatarUrl, gender.
 * These are the fields a user should be able to self-edit; everything
 * else on User (tokenBalance, role, isBanned, equippedTitleId, etc.)
 * is either derived, admin-only, or has its own dedicated mutation
 * path (equippedTitleId changes via the Titles module's equip/unequip
 * logic once that exists — not here, since equipping requires
 * ownership validation that doesn't belong in a plain profile PATCH).
 *
 * bio maxLength mirrors schema.prisma's `@db.VarChar(280)` exactly —
 * if that column constraint ever changes, update both places.
 *
 * No class-validator decorators: this project has no validation
 * library wired in yet (not in package.json), so validation is done
 * by hand in the controller, matching how AdminController hand-checks
 * its Body() fields (e.g. `typeof banned !== 'boolean'`) rather than
 * assuming a global ValidationPipe exists.
 */
export interface UpdateProfileDto {
  bio?: string | null;
  avatarUrl?: string | null;
  gender?: Gender;
}

export const BIO_MAX_LENGTH = 280;
export const VALID_GENDERS: Gender[] = ["MALE", "FEMALE", "UNSPECIFIED"];
