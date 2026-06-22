import {
  DOCUMENT_PROCESSING_QUEUE_NAME,
  ProcessDocumentJobPayload,
} from '@document-summarizer/contracts'
import { Module } from '@nestjs/common'
import { Queue } from 'bullmq'
import { AppConfigService } from '../configuration/app-config.service'
import { DatabaseModule } from '../database/database.module'
import { DocumentProcessingQueueService } from './document-processing-queue.service'
import { PendingJobRecoveryService } from './pending-job-recovery.service'
import { DOCUMENT_PROCESSING_QUEUE } from './queue.constants'
import { createRedisConnectionOptions } from './redis-connection-options'

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: DOCUMENT_PROCESSING_QUEUE,
      useFactory: (config: AppConfigService) =>
        new Queue<ProcessDocumentJobPayload>(DOCUMENT_PROCESSING_QUEUE_NAME, {
          connection: createRedisConnectionOptions(config.redisUrl),
        }),
      inject: [AppConfigService],
    },
    DocumentProcessingQueueService,
    PendingJobRecoveryService,
  ],
  exports: [DocumentProcessingQueueService],
})
export class QueueModule {}
