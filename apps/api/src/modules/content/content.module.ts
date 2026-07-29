import { Module } from "@nestjs/common";
import { JikanService } from "./jikan/jikan.service";
import { AniListService } from "./jikan/anilist/anilist.service";
import { TmdbService } from "./tmdb/tmdb.service";
import { ContentSyncProcessor } from "../../jobs/content-sync.processor";
import { ContentController } from "./content.controller";
import { QueueModule } from "../../common/queue.module";

@Module({
  imports: [QueueModule],
  controllers: [ContentController],
  providers: [JikanService, AniListService, TmdbService, ContentSyncProcessor],
  exports: [JikanService, AniListService, TmdbService],
})
export class ContentModule {}
