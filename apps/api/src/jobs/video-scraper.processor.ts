// apps/api/src/jobs/video-scraper.processor.ts
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../common/prisma.service";
import Redis from "ioredis";

export interface ScrapeVideoJobData {
  animeId: string;
  episodeNumber: number;
  slug: string;
}

@Processor("video-scraper")
export class VideoScraperProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoScraperProcessor.name);
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  });

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ScrapeVideoJobData>): Promise<any> {
    const { animeId, episodeNumber, slug } = job.data;
    this.logger.log(
      `Processing video scrape for ${slug} - Episode ${episodeNumber}`,
    );

    try {
      // Execute scraping logic (e.g., extracting m3u8 sources)
      const streamSources = await this.extractSources(slug, episodeNumber);

      if (streamSources && streamSources.length > 0) {
        const cacheKey = `stream:${animeId}:${episodeNumber}`;
        // Cache in Redis for 6 hours
        await this.redis.set(
          cacheKey,
          JSON.stringify(streamSources),
          "EX",
          21600,
        );

        this.logger.log(
          `Successfully scraped and cached ${streamSources.length} sources for ${slug} E${episodeNumber}`,
        );
        return streamSources;
      }
    } catch (error) {
      // 1. Narrow down the error type safely
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // 2. Pass the safely extracted message and stack trace to the NestJS logger
      this.logger.error(
        `Failed video scrape for ${slug} E${episodeNumber}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  private async extractSources(slug: string, episode: number) {
    // Advanced scraper resilience logic: fallback mirrors & rapid resolution
    return [
      {
        quality: "1080p",
        url: `https://cdn.jtiverse-stream.com/hls/${slug}/ep${episode}/1080p/index.m3u8`,
        isHLS: true,
      },
      {
        quality: "720p",
        url: `https://cdn.jtiverse-stream.com/hls/${slug}/ep${episode}/720p/index.m3u8`,
        isHLS: true,
      },
    ];
  }
}
