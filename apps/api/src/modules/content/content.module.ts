import { Module } from "@nestjs/common";
import { JikanService } from "./jikan/jikan.service";
import { AniListService } from "./anilist/anilist.service";
import { TmdbService } from "./tmdb/tmdb.service";
import { ContentSyncProcessor } from "../../jobs/content-sync.processor";
import { ContentController } from "./content.controller"

@Module({
  controllers: [ContentController],
  providers: [JikanService, AniListService, TmdbService, ContentSyncProcessor],
  exports: [JikanService, AniListService, TmdbService],
})
export class ContentModule {}
