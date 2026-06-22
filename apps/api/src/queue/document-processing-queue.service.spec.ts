import {
  DOCUMENT_PROCESSING_QUEUE_NAME,
  PROCESS_DOCUMENT_JOB_NAME,
  PROCESSING_JOB_STATUSES,
  ProcessDocumentJobPayload,
} from '@document-summarizer/contracts'
import { Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DatabaseService } from '../database/database.service'
import { DocumentProcessingQueueService } from './document-processing-queue.service'

describe('DocumentProcessingQueueService', () => {
  let queue: {
    add: jest.Mock<(...args: unknown[]) => Promise<unknown>>
    close: jest.Mock<() => Promise<void>>
    on: jest.Mock<(...args: unknown[]) => unknown>
  }
  let database: {
    processingJob: {
      updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>
    }
  }
  let service: DocumentProcessingQueueService

  beforeEach(() => {
    queue = {
      add: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
      close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      on: jest.fn(),
    }
    database = {
      processingJob: {
        updateMany: jest
          .fn<(...args: unknown[]) => Promise<{ count: number }>>()
          .mockResolvedValue({ count: 1 }),
      },
    }
    service = new DocumentProcessingQueueService(
      queue as unknown as Queue<ProcessDocumentJobPayload>,
      database as unknown as DatabaseService,
    )

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('publishes with the expected queue job name, payload, and job ID', async () => {
    await expect(service.tryPublish('processing-job-1')).resolves.toBe(true)

    expect(queue.add).toHaveBeenCalledWith(
      PROCESS_DOCUMENT_JOB_NAME,
      { processingJobId: 'processing-job-1' },
      { jobId: 'processing-job-1' },
    )
    expect(DOCUMENT_PROCESSING_QUEUE_NAME).toBe('document-processing')
  })

  it('marks only a pending processing job as queued after publishing', async () => {
    await service.tryPublish('processing-job-1')

    expect(database.processingJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'processing-job-1',
        status: PROCESSING_JOB_STATUSES.PENDING,
      },
      data: {
        status: PROCESSING_JOB_STATUSES.QUEUED,
      },
    })
  })

  it('returns false without updating the database when queue.add rejects', async () => {
    queue.add.mockRejectedValue(new Error('Redis unavailable'))

    await expect(service.tryPublish('processing-job-1')).resolves.toBe(false)

    expect(database.processingJob.updateMany).not.toHaveBeenCalled()
  })

  it('returns false when the database update rejects after queue.add', async () => {
    database.processingJob.updateMany.mockRejectedValue(new Error('PostgreSQL unavailable'))

    await expect(service.tryPublish('processing-job-1')).resolves.toBe(false)

    expect(queue.add).toHaveBeenCalledTimes(1)
  })
})
