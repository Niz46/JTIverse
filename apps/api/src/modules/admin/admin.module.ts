import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";

/**
 * No providers here beyond the controller itself. PrismaService comes
 * from the @Global() CommonModule — see the comment in auth.module.ts
 * for why this project deliberately never re-declares it per-module.
 */
@Module({
  controllers: [AdminController],
})
export class AdminModule {}
