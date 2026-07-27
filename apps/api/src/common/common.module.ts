import { Module, Global } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Marked @Global so every feature module gets PrismaService without
 * each one separately importing CommonModule — reduces import noise
 * across auth/users/content/tokens/titles/comments/rooms modules,
 * all of which need database access.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class CommonModule {}
