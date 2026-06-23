import { PROCESSING_JOB_STATUSES } from '@document-summarizer/contracts'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DatabaseService } from '../database/database.service'
import { DocumentProcessingQueueService } from './document-processing-queue.service'
import { PendingJobRecoveryService } from './pending-job-recovery.service'

describe('PendingJobRecoveryService', () => {
  let database: {
    processingJob: {
      findMany: jest.Mock<(...args: unknown[]) => Promise<Array<{ id: string }>>>
    }
  }
  let documentProcessingQueue: {
    tryPublish: jest.Mock<(processingJobId: string) => Promise<boolean>>
  }
  let service: PendingJobRecoveryService

  beforeEach(() => {
    database = {
      processingJob: {
        findMany: jest.fn(),
      },
    }
    documentProcessingQueue = {
      tryPublish: jest.fn<(processingJobId: string) => Promise<boolean>>().mockResolvedValue(true),
    }
    service = new PendingJobRecoveryService(
      database as unknown as DatabaseService,
      documentProcessingQueue as unknown as DocumentProcessingQueueService,
    )

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('fetches at most 100 pending jobs oldest first and publishes each one', async () => {
    database.processingJob.findMany.mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }])

    await service.recoverPendingJobs()

    expect(database.processingJob.findMany).toHaveBeenCalledWith({
      where: { status: PROCESSING_JOB_STATUSES.PENDING },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true },
    })
    expect(documentProcessingQueue.tryPublish).toHaveBeenNthCalledWith(1, 'job-1')
    expect(documentProcessingQueue.tryPublish).toHaveBeenNthCalledWith(2, 'job-2')
  })

  it('continues publishing when a prior publish returns false', async () => {
    database.processingJob.findMany.mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }])
    documentProcessingQueue.tryPublish.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await service.recoverPendingJobs()

    expect(documentProcessingQueue.tryPublish).toHaveBeenCalledTimes(2)
    expect(documentProcessingQueue.tryPublish).toHaveBeenNthCalledWith(2, 'job-2')
  })

  it('ignores a scan requested while a recovery scan is active', async () => {
    let resolveFindMany: ((jobs: Array<{ id: string }>) => void) | undefined
    database.processingJob.findMany.mockImplementation(
      () =>
        new Promise<Array<{ id: string }>>((resolve) => {
          resolveFindMany = resolve
        }),
    )

    const firstScan = service.recoverPendingJobs()
    await service.recoverPendingJobs()

    expect(database.processingJob.findMany).toHaveBeenCalledTimes(1)
    resolveFindMany?.([])
    await firstScan
  })
})
