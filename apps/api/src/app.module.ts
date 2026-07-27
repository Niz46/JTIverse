import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { QueueModule } from "./common/queue.module";
import { ContentModule } from "./modules/content/content.module";

@Module({
  imports: [CommonModule, QueueModule, ContentModule],
})
export class AppModule {}
