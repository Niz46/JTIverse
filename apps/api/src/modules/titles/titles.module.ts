import { Module } from "@nestjs/common";
import { TitlesController } from "./titles.controller";
import { TitlesShopController } from "./titles-shop.controller";

@Module({
  controllers: [TitlesController, TitlesShopController],
})
export class TitlesModule {}
