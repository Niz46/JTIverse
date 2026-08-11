/**
 * CREATE COMMENT DTO
 * -------------------
 * Mirrors update-profile.dto.ts's pattern: exported constants for
 * validation limits so the controller and any future frontend
 * validation stay in sync with a single source of truth, rather than
 * a magic number duplicated in two places.
 *
 * BODY_MAX_LENGTH matches schema.prisma's `body String @db.VarChar(1000)`
 * exactly. If that column length ever changes, this constant must
 * change with it in the same PR — a mismatch here means either the
 * DB silently truncates something the API already accepted (if this
 * were ever raised above 1000), or the API rejects something the DB
 * would have happily stored (if this were ever lowered without
 * moving the DB down too) — see the schema's own comment about
 * fields that must stay in lockstep across layers.
 */
export const BODY_MAX_LENGTH = 1000;
export const BODY_MIN_LENGTH = 1;

export interface CreateCommentDto {
  body: string;
}
