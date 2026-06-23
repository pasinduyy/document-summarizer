import {
  DOCUMENT_PROCESSING_QUEUE_NAME,
  PROCESS_DOCUMENT_JOB_NAME,
  ProcessDocumentJobPayload,
} from '@document-summarizer/contracts'
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common'
import { Job, Worker } from 'bullmq'
import { WorkerConfigService } from '../configuration/worker-config.service'
import { DocumentProcessingService } from '../processing/document-processing.service'
import { createWorkerRedisConnectionOptions } from './redis-connection-options'

@Injectable()
export class DocumentProcessingWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DocumentProcessingWorkerService.name)
  private worker: Worker<ProcessDocumentJobPayload> | undefined

  constructor(
    private readonly config: WorkerConfigService,
    private readonly documentProcessing: DocumentProcessingService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Starting BullMQ worker for queue "${DOCUMENT_PROCESSING_QUEUE_NAME}" with concurrency 1`,
    )

    this.worker = new Worker<ProcessDocumentJobPayload>(
      DOCUMENT_PROCESSING_QUEUE_NAME,
      (job) => this.processJob(job),
      {
        connection: createWorkerRedisConnectionOptions(this.config.redisUrl),
        concurrency: 1,
      },
    )

    this.worker.on('error', (error) => {
      this.logger.error(
        `Document processing worker connection error: ${error.message}`,
        error.stack,
      )
    })
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Document processing queue job ${job?.id ?? 'unknown'} failed: ${error.message}`,
        error.stack,
      )
    })

    this.logger.log(`BullMQ worker for queue "${DOCUMENT_PROCESSING_QUEUE_NAME}" is active`)
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Stopping BullMQ document processing worker${signal ? ` (${signal})` : ''}`)

    if (this.worker) {
      await this.worker.close()
      this.worker = undefined
    }

    this.logger.log('BullMQ document processing worker stopped')
  }

  private async processJob(job: Job<ProcessDocumentJobPayload>): Promise<void> {
    if (job.name !== PROCESS_DOCUMENT_JOB_NAME) {
      throw new Error(`Unexpected document processing job name: ${job.name}`)
    }

    const processingJobId = job.data?.processingJobId

    if (typeof processingJobId !== 'string' || !processingJobId.trim()) {
      throw new Error('Document processing job payload must include processingJobId')
    }

    await this.documentProcessing.process(processingJobId)
  }
}
