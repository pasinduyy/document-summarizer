import { PROCESSING_JOB_STATUSES } from '@document-summarizer/contracts'
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { DocumentProcessingQueueService } from './document-processing-queue.service'

const RECOVERY_INTERVAL_MS = 30_000
const RECOVERY_BATCH_SIZE = 100

@Injectable()
export class PendingJobRecoveryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PendingJobRecoveryService.name)
  private interval: NodeJS.Timeout | undefined
  private isRecovering = false

  constructor(
    private readonly database: DatabaseService,
    private readonly documentProcessingQueue: DocumentProcessingQueueService,
  ) {}

  onApplicationBootstrap(): void {
    void this.recoverPendingJobs()
    this.interval = setInterval(() => {
      void this.recoverPendingJobs()
    }, RECOVERY_INTERVAL_MS)
  }

  onApplicationShutdown(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
  }

  async recoverPendingJobs(): Promise<void> {
    if (this.isRecovering) {
      return
    }

    this.isRecovering = true

    try {
      const pendingJobs = await this.database.processingJob.findMany({
        where: { status: PROCESSING_JOB_STATUSES.PENDING },
        orderBy: { createdAt: 'asc' },
        take: RECOVERY_BATCH_SIZE,
        select: { id: true },
      })

      for (const pendingJob of pendingJobs) {
        await this.documentProcessingQueue.tryPublish(pendingJob.id)
      }

      if (pendingJobs.length > 0) {
        this.logger.log(
          `Recovery attempted publishing ${pendingJobs.length} pending processing job(s)`,
        )
      }
    } catch (error) {
      this.logger.error(`Unable to recover pending processing jobs: ${this.errorMessage(error)}`)
    } finally {
      this.isRecovering = false
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
