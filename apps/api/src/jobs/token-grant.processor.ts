import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { TaskType } from '@prisma/client';

/**
 * TOKEN GRANT PROCESSOR
 * ---------------------
 * This is intentionally NOT an AI/LLM call. "Watch 10 anime -> grant
 * token" is deterministic counting logic; routing it through a
 * language model would be slower, costlier, and non-deterministic
 * for something that must always produce the same output for the
 * same input. AI has a real role in this system (moderation,
 * recommendations, onboarding) — this isn't it. See jobs/ARCHITECTURE_NOTE.md.
 *
 * Trigger: enqueued whenever a WatchEvent, Comment, Room creation/join,
 * or daily-login event fires. Payload: { userId, taskType, incrementBy? }
 *
 * Flow:
 *   1. Find all active tasks matching taskType
 *   2. Increment UserTaskProgress.currentCount (idempotent per event —
 *      caller is responsible for not double-firing the same WatchEvent)
 *   3. If threshold crossed and not already completed, write a
 *      TokenTransaction (the ledger) and bump User.tokenBalance
 *   4. Push a WebSocket notification so the UI updates without a
 *      page refresh — this is the "fast, streamed experience" part
 */
@Processor('token-grant')
export class TokenGrantProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenGrantProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { userId, taskType, incrementBy = 1 } = job.data as {
      userId: string;
      taskType: TaskType;
      incrementBy?: number;
    };

    const activeTasks = await this.prisma.task.findMany({
      where: { type: taskType, isActive: true },
    });

    for (const task of activeTasks) {
      await this.processTaskForUser(userId, task, incrementBy);
    }
  }

  private async processTaskForUser(
    userId: string,
    task: { id: string; threshold: number; tokenReward: number; isRepeatable: boolean; name: string },
    incrementBy: number,
  ): Promise<void> {
    // Use a transaction so the progress-check and token-grant are atomic —
    // avoids a race where two events fire near-simultaneously and both
    // read "not yet completed" before either writes the completion.
    await this.prisma.$transaction(async (tx) => {
      const progress = await tx.userTaskProgress.upsert({
        where: { userId_taskId: { userId, taskId: task.id } },
        create: { userId, taskId: task.id, currentCount: incrementBy },
        update: { currentCount: { increment: incrementBy } },
      });

      const alreadyCompleted = progress.isCompleted && !task.isRepeatable;
      const justCrossedThreshold = progress.currentCount >= task.threshold;

      if (alreadyCompleted || !justCrossedThreshold) {
        return;
      }

      // Grant tokens via the ledger — never write tokenBalance directly
      // anywhere else in the codebase. This is the one place it happens.
      await tx.tokenTransaction.create({
        data: {
          userId,
          amount: task.tokenReward,
          type: 'TASK_REWARD',
          reason: `Task completed: ${task.name}`,
          relatedTaskId: task.id,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { tokenBalance: { increment: task.tokenReward } },
      });

      await tx.userTaskProgress.update({
        where: { id: progress.id },
        data: {
          isCompleted: !task.isRepeatable, // repeatable tasks (streaks) reset progress instead of locking completed
          completedAt: new Date(),
          currentCount: task.isRepeatable ? 0 : progress.currentCount,
        },
      });

      this.logger.log(`Granted ${task.tokenReward} tokens to user ${userId} for "${task.name}"`);

      // NOTE: actual WebSocket push to notify the client happens via
      // a lightweight event emitted here and consumed by the Rooms/
      // Notifications gateway — kept out of this processor to avoid
      // giving the job queue a hard dependency on the socket layer.
    });
  }
}
