import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";

/**
 * No providers here beyond the controller itself, same reasoning as
 * AdminModule: PrismaService comes from the @Global() CommonModule,
 * and re-declaring it here would spin up a second PrismaClient / a
 * second connection pool against DATABASE_URL's connection_limit=20
 * cap — see the comment in auth.module.ts for the full explanation
 * of why that already caused a real double-connect bug once.
 */
@Module({
  controllers: [UsersController],
})
export class UsersModule {}
