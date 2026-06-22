import {
  PROCESS_DOCUMENT_JOB_NAME,
  PROCESSING_JOB_STATUSES,
  ProcessDocumentJobPayload,
} from '@document-summarizer/contracts'
import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { Queue } from 'bullmq'
import { DatabaseService } from '../database/database.service'
import { DOCUMENT_PROCESSING_QUEUE } from './queue.constants'

@Injectable()
export class DocumentProcessingQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(DocumentProcessingQueueService.name)

  constructor(
    @Inject(DOCUMENT_PROCESSING_QUEUE)
    private readonly queue: Queue<ProcessDocumentJobPayload>,
    private readonly database: DatabaseService,
  ) {
    this.queue.on('error', (error) => {
      this.logger.error(`Document processing queue connection error: ${error.message}`)
    })
  }

  async tryPublish(processingJobId: string): Promise<boolean> {
    try {
      await this.queue.add(
        PROCESS_DOCUMENT_JOB_NAME,
        { processingJobId },
        { jobId: processingJobId },
      )
      await this.database.processingJob.updateMany({
        where: {
          id: processingJobId,
          status: PROCESSING_JOB_STATUSES.PENDING,
        },
        data: {
          status: PROCESSING_JOB_STATUSES.QUEUED,
        },
      })

      return true
    } catch (error) {
      this.logger.warn(
        `Unable to publish processing job ${processingJobId}: ${this.errorMessage(error)}`,
      )
      return false
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close()
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
