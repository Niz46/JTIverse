import { Controller, Get, Param, Query } from "@nestjs/common";
import { RecommendationsService } from "./recommendations.service";
import { Public } from "../auth/decorators/public.decorator";

@Controller("content/:id/recommendations")
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Public()
  @Get()
  async get(@Param("id") id: string, @Query("limit") limit = "10") {
    const capped = Math.min(20, Math.max(1, Number(limit)));
    return this.recommendations.getSimilar(id, capped);
  }
}
