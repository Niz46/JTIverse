import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route (or an entire controller) as not requiring
 * authentication. Use on read-only public endpoints — e.g.
 * ContentController's GET routes, which anonymous visitors should
 * be able to browse before signing up.
 *
 * Usage: @Public()
 *        @Get()
 *        async list() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);