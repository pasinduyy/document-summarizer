import {
  DOCUMENT_PROCESSING_BACKOFF_DELAY_MS,
  DOCUMENT_PROCESSING_LEASE_DURATION_MS,
  DOCUMENT_PROCESSING_MAX_ATTEMPTS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  PROCESSING_ATTEMPT_STATUSES,
  PROCESSING_JOB_STATUSES,
} from '@document-summarizer/contracts'
import { DocumentStorage } from '@document-summarizer/storage'
import { Logger } from '@nestjs/common'
import { UnrecoverableError } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Readable } from 'node:stream'
import { DatabaseService } from '../database/database.service'
import { DocumentAnalysisResult } from './document-analysis-provider'
import { DOCUMENT_PROCESSING_ERROR_CODES } from './document-processing.error'
import { DocumentProcessingService } from './document-processing.service'
import { DocumentTextExtractorService } from './document-text-extractor.service'

describe('DocumentProcessingService', () => {
  let database: {
    $transaction: jest.Mock<
      (callback: (transaction: unknown) => Promise<unknown>) => Promise<unknown>
    >
  }
  let documentStorage: {
    openReadStream: jest.Mock<(storageKey: string) => Promise<Readable>>
  }
  let documentAnalysis: {
    analyze: jest.Mock<(text: string) => Promise<DocumentAnalysisResult>>
  }
  let service: DocumentProcessingService

  beforeEach(() => {
    database = {
      $transaction:
        jest.fn<(callback: (transaction: unknown) => Promise<unknown>) => Promise<unknown>>(),
    }
    documentStorage = {
      openReadStream: jest.fn<(storageKey: string) => Promise<Readable>>(),
    }
    documentAnalysis = {
      analyze: jest.fn<(text: string) => Promise<DocumentAnalysisResult>>(),
    }
    service = new DocumentProcessingService(
      database as unknown as DatabaseService,
      new DocumentTextExtractorService(documentStorage as unknown as DocumentStorage),
      documentAnalysis,
    )

    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('claims and completes a TXT job delivered while its durable status is pending', async () => {
    const claimTransaction = createClaimTransaction()
    const completionTransaction = createCompletionTransaction()
    mockTransactions(claimTransaction, completionTransaction)
    documentStorage.openReadStream.mockResolvedValue(
      Readable.from(['Invoice INV-1001\n', 'Subtotal: 10.00\nAmount due: 10.00.']),
    )
    documentAnalysis.analyze.mockResolvedValue({
      summary: 'Invoice INV-1001 Subtotal: 10.00 Amount due: 10.00.',
      category: DOCUMENT_CATEGORIES.INVOICE,
      confidence: 0.75,
      providerName: 'mock-rules',
      modelVersion: 'v1',
    })

    await expect(service.process('processing-job-1')).resolves.toBeUndefined()

    expect(claimTransaction.processingJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'processing-job-1',
        status: {
          in: [
            PROCESSING_JOB_STATUSES.PENDING,
            PROCESSING_JOB_STATUSES.QUEUED,
            PROCESSING_JOB_STATUSES.RETRY_SCHEDULED,
          ],
        },
      },
      data: {
        status: PROCESSING_JOB_STATUSES.PROCESSING,
        attemptCount: { increment: 1 },
        leaseExpiresAt: expect.any(Date),
      },
    })
    expect(claimTransaction.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
        status: DOCUMENT_STATUSES.QUEUED,
      },
      data: { status: DOCUMENT_STATUSES.PROCESSING },
    })
    expect(claimTransaction.processingAttempt.create).toHaveBeenCalledWith({
      data: {
        processingJobId: 'processing-job-1',
        attemptNumber: 1,
        status: PROCESSING_ATTEMPT_STATUSES.STARTED,
      },
      select: { id: true },
    })
    expect(claimTransaction.processingAttempt.create).toHaveBeenCalledTimes(1)
    const normalClaim = claimTransaction.processingJob.updateMany.mock.calls[0][0] as {
      data: { leaseExpiresAt: Date }
    }
    expect(normalClaim.data.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(normalClaim.data.leaseExpiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + DOCUMENT_PROCESSING_LEASE_DURATION_MS,
    )
    expect(documentStorage.openReadStream).toHaveBeenCalledWith('storage-key-1')
    expect(documentAnalysis.analyze).toHaveBeenCalledWith(
      'Invoice INV-1001 Subtotal: 10.00 Amount due: 10.00.',
    )
    expect(completionTransaction.documentAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId: 'document-1' },
        create: expect.objectContaining({
          category: DOCUMENT_CATEGORIES.INVOICE,
          providerName: 'mock-rules',
          modelVersion: 'v1',
        }),
      }),
    )
    expect(completionTransaction.processingAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({ status: PROCESSING_ATTEMPT_STATUSES.COMPLETED }),
      }),
    )
    expect(completionTransaction.processingJob.update).toHaveBeenCalledWith({
      where: { id: 'processing-job-1' },
      data: {
        status: PROCESSING_JOB_STATUSES.COMPLETED,
        lastErrorCode: null,
        nextRetryAt: null,
        leaseExpiresAt: null,
      },
    })
    expect(completionTransaction.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'document-1' },
        data: expect.objectContaining({ status: DOCUMENT_STATUSES.COMPLETED }),
      }),
    )
  })

  it('returns successfully for a duplicate delivery without reading or analyzing the document', async () => {
    const claimTransaction = {
      processingJob: {
        updateMany: resolvedMock({ count: 0 }),
        findUnique: resolvedMock(undefined),
      },
    }
    mockTransactions(claimTransaction)

    await expect(service.process('processing-job-1')).resolves.toBeUndefined()

    expect(claimTransaction.processingJob.findUnique).toHaveBeenCalledWith({
      where: { id: 'processing-job-1' },
      select: {
        attemptCount: true,
        documentId: true,
        leaseExpiresAt: true,
        status: true,
      },
    })
    expect(documentStorage.openReadStream).not.toHaveBeenCalled()
    expect(documentAnalysis.analyze).not.toHaveBeenCalled()
    expect(database.$transaction).toHaveBeenCalledTimes(1)
  })

  it('claims a retry-scheduled job for its next attempt', async () => {
    const claimTransaction = createClaimTransaction({ attemptCount: 2 })
    const completionTransaction = createCompletionTransaction()
    mockTransactions(claimTransaction, completionTransaction)
    documentStorage.openReadStream.mockResolvedValue(Readable.from(['retry text']))
    documentAnalysis.analyze.mockResolvedValue({
      summary: 'retry text',
      category: DOCUMENT_CATEGORIES.OTHER,
      confidence: 0.5,
      providerName: 'mock-rules',
      modelVersion: 'v1',
    })

    await expect(service.process('processing-job-1')).resolves.toBeUndefined()

    expect(claimTransaction.processingJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'processing-job-1',
        status: {
          in: [
            PROCESSING_JOB_STATUSES.PENDING,
            PROCESSING_JOB_STATUSES.QUEUED,
            PROCESSING_JOB_STATUSES.RETRY_SCHEDULED,
          ],
        },
      },
      data: {
        status: PROCESSING_JOB_STATUSES.PROCESSING,
        attemptCount: { increment: 1 },
        leaseExpiresAt: expect.any(Date),
      },
    })
    expect(claimTransaction.processingAttempt.create).toHaveBeenCalledWith({
      data: {
        processingJobId: 'processing-job-1',
        attemptNumber: 2,
        status: PROCESSING_ATTEMPT_STATUSES.STARTED,
      },
      select: { id: true },
    })
  })

  it('schedules a retry for a transient error before the final attempt', async () => {
    const claimTransaction = createClaimTransaction()
    const failureTransaction = createFailureTransaction()
    const transientError = new Error('Provider temporarily unavailable')
    mockTransactions(claimTransaction, failureTransaction)
    documentStorage.openReadStream.mockResolvedValue(Readable.from(['retryable text']))
    documentAnalysis.analyze.mockRejectedValue(transientError)

    await expect(service.process('processing-job-1')).rejects.toBe(transientError)

    expect(failureTransaction.processingAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          status: PROCESSING_ATTEMPT_STATUSES.FAILED,
          errorCode: 'PROCESSING_RETRYABLE_FAILURE',
        }),
      }),
    )
    expect(failureTransaction.processingJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'processing-job-1' },
        data: expect.objectContaining({
          status: PROCESSING_JOB_STATUSES.RETRY_SCHEDULED,
          lastErrorCode: 'PROCESSING_RETRYABLE_FAILURE',
          nextRetryAt: expect.any(Date),
          leaseExpiresAt: null,
        }),
      }),
    )
    expect(failureTransaction.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { status: DOCUMENT_STATUSES.QUEUED },
    })

    const attemptUpdate = failureTransaction.processingAttempt.update.mock.calls[0][0] as {
      data: { finishedAt: Date }
    }
    const processingJobUpdate = failureTransaction.processingJob.update.mock.calls[0][0] as {
      data: { nextRetryAt: Date }
    }
    expect(processingJobUpdate.data.nextRetryAt.getTime()).toBe(
      attemptUpdate.data.finishedAt.getTime() + DOCUMENT_PROCESSING_BACKOFF_DELAY_MS,
    )
  })

  it('dead-letters a transient error on the final allowed attempt', async () => {
    const claimTransaction = createClaimTransaction({
      attemptCount: DOCUMENT_PROCESSING_MAX_ATTEMPTS,
    })
    const failureTransaction = createFailureTransaction()
    mockTransactions(claimTransaction, failureTransaction)
    documentStorage.openReadStream.mockResolvedValue(Readable.from(['retryable text']))
    documentAnalysis.analyze.mockRejectedValue(new Error('Provider temporarily unavailable'))

    await expect(service.process('processing-job-1')).rejects.toBeInstanceOf(UnrecoverableError)

    expect(failureTransaction.processingAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          status: PROCESSING_ATTEMPT_STATUSES.FAILED,
          errorCode: 'PROCESSING_RETRY_EXHAUSTED',
        }),
      }),
    )
    expect(failureTransaction.processingJob.update).toHaveBeenCalledWith({
      where: { id: 'processing-job-1' },
      data: {
        status: PROCESSING_JOB_STATUSES.DEAD_LETTERED,
        lastErrorCode: 'PROCESSING_RETRY_EXHAUSTED',
        nextRetryAt: null,
        leaseExpiresAt: null,
      },
    })
    expect(failureTransaction.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { status: DOCUMENT_STATUSES.FAILED },
    })
  })

  it('records terminal extraction failure and throws an unrecoverable queue error', async () => {
    const claimTransaction = createClaimTransaction()
    const failureTransaction = createFailureTransaction()
    mockTransactions(claimTransaction, failureTransaction)
    documentStorage.openReadStream.mockResolvedValue(Readable.from(['  \n\t  ']))

    await expect(service.process('processing-job-1')).rejects.toBeInstanceOf(UnrecoverableError)

    expect(failureTransaction.processingAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          status: PROCESSING_ATTEMPT_STATUSES.FAILED,
          errorCode: DOCUMENT_PROCESSING_ERROR_CODES.EMPTY_DOCUMENT_TEXT,
        }),
      }),
    )
    expect(failureTransaction.processingJob.update).toHaveBeenCalledWith({
      where: { id: 'processing-job-1' },
      data: {
        status: PROCESSING_JOB_STATUSES.DEAD_LETTERED,
        lastErrorCode: DOCUMENT_PROCESSING_ERROR_CODES.EMPTY_DOCUMENT_TEXT,
        nextRetryAt: null,
        leaseExpiresAt: null,
      },
    })
    expect(failureTransaction.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { status: DOCUMENT_STATUSES.FAILED },
    })
  })

  it('does not reclaim a PROCESSING job with a non-expired lease', async () => {
    const claimTransaction = {
      processingJob: {
        updateMany: resolvedMock({ count: 0 }),
        findUnique: resolvedMock({
          attemptCount: 1,
          documentId: 'document-1',
          leaseExpiresAt: new Date(Date.now() + DOCUMENT_PROCESSING_LEASE_DURATION_MS),
          status: PROCESSING_JOB_STATUSES.PROCESSING,
        }),
      },
    }
    mockTransactions(claimTransaction)

    await expect(service.process('processing-job-1')).resolves.toBeUndefined()

    expect(claimTransaction.processingJob.updateMany).toHaveBeenCalledTimes(1)
    expect(documentStorage.openReadStream).not.toHaveBeenCalled()
    expect(documentAnalysis.analyze).not.toHaveBeenCalled()
  })

  it('reclaims an expired PROCESSING lease and begins the next attempt', async () => {
    const claimTransaction = createStaleClaimTransaction()
    const completionTransaction = createCompletionTransaction()
    mockTransactions(claimTransaction, completionTransaction)
    documentStorage.openReadStream.mockResolvedValue(Readable.from(['reclaimed text']))
    documentAnalysis.analyze.mockResolvedValue({
      summary: 'reclaimed text',
      category: DOCUMENT_CATEGORIES.OTHER,
      confidence: 0.5,
      providerName: 'mock-rules',
      modelVersion: 'v1',
    })

    await expect(service.process('processing-job-1')).resolves.toBeUndefined()

    expect(claimTransaction.processingAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        processingJobId: 'processing-job-1',
        attemptNumber: 1,
        status: PROCESSING_ATTEMPT_STATUSES.STARTED,
      },
      data: {
        status: PROCESSING_ATTEMPT_STATUSES.FAILED,
        finishedAt: expect.any(Date),
        errorCode: DOCUMENT_PROCESSING_ERROR_CODES.WORKER_LEASE_EXPIRED,
      },
    })
    expect(claimTransaction.processingJob.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          attemptCount: 1,
          leaseExpiresAt: expect.objectContaining({ lte: expect.any(Date) }),
          status: PROCESSING_JOB_STATUSES.PROCESSING,
        }),
        data: {
          status: PROCESSING_JOB_STATUSES.PROCESSING,
          attemptCount: { increment: 1 },
          leaseExpiresAt: expect.any(Date),
        },
      }),
    )
    expect(claimTransaction.processingAttempt.create).toHaveBeenCalledWith({
      data: {
        processingJobId: 'processing-job-1',
        attemptNumber: 2,
        status: PROCESSING_ATTEMPT_STATUSES.STARTED,
      },
      select: { id: true },
    })
    expect(claimTransaction.document.updateMany).not.toHaveBeenCalled()
  })

  it('allows only one concurrent stale lease reclaim to claim the job', async () => {
    const state = {
      attemptCount: 1,
      leaseExpiresAt: new Date(Date.now() - 1),
      startedAttempt: true,
      status: PROCESSING_JOB_STATUSES.PROCESSING,
    }
    const transaction = {
      processingJob: {
        updateMany: jest.fn(
          async (args: {
            where: { leaseExpiresAt?: { lte: Date }; status?: unknown }
            data: { leaseExpiresAt?: Date; attemptCount?: { increment: number } }
          }) => {
            if (!args.where.leaseExpiresAt) {
              return { count: 0 }
            }

            if (
              state.status === PROCESSING_JOB_STATUSES.PROCESSING &&
              state.leaseExpiresAt <= args.where.leaseExpiresAt.lte
            ) {
              state.attemptCount += args.data.attemptCount?.increment ?? 0
              state.leaseExpiresAt = args.data.leaseExpiresAt ?? state.leaseExpiresAt
              return { count: 1 }
            }

            return { count: 0 }
          },
        ),
        findUnique: jest.fn(async () => ({
          id: 'processing-job-1',
          attemptCount: state.attemptCount,
          documentId: 'document-1',
          leaseExpiresAt: state.leaseExpiresAt,
          status: state.status,
          document: {
            id: 'document-1',
            originalFilename: 'invoice.txt',
            mimeType: 'text/plain',
            storageKey: 'storage-key-1',
          },
        })),
      },
      processingAttempt: {
        updateMany: jest.fn(async () => {
          if (!state.startedAttempt) {
            return { count: 0 }
          }

          state.startedAttempt = false
          return { count: 1 }
        }),
        create: resolvedMock({ id: 'attempt-2' }),
      },
    }
    database.$transaction.mockImplementation((callback) => callback(transaction))
    const claim = service as unknown as {
      claim: (processingJobId: string) => Promise<unknown>
    }

    const claims = await Promise.all([
      claim.claim('processing-job-1'),
      claim.claim('processing-job-1'),
    ])

    expect(claims.filter((result) => result !== null)).toHaveLength(1)
    expect(transaction.processingAttempt.create).toHaveBeenCalledTimes(1)
  })

  it('dead-letters an expired final attempt without creating another attempt', async () => {
    const claimTransaction = createStaleClaimTransaction({
      attemptCount: DOCUMENT_PROCESSING_MAX_ATTEMPTS,
    })
    mockTransactions(claimTransaction)

    await expect(service.process('processing-job-1')).rejects.toBeInstanceOf(UnrecoverableError)

    expect(claimTransaction.processingAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        processingJobId: 'processing-job-1',
        attemptNumber: DOCUMENT_PROCESSING_MAX_ATTEMPTS,
        status: PROCESSING_ATTEMPT_STATUSES.STARTED,
      },
      data: {
        status: PROCESSING_ATTEMPT_STATUSES.FAILED,
        finishedAt: expect.any(Date),
        errorCode: DOCUMENT_PROCESSING_ERROR_CODES.WORKER_LEASE_EXPIRED,
      },
    })
    expect(claimTransaction.processingJob.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          status: PROCESSING_JOB_STATUSES.DEAD_LETTERED,
          leaseExpiresAt: null,
          lastErrorCode: DOCUMENT_PROCESSING_ERROR_CODES.WORKER_LEASE_EXPIRED,
          nextRetryAt: null,
        },
      }),
    )
    expect(claimTransaction.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { status: DOCUMENT_STATUSES.FAILED },
    })
    expect(claimTransaction.processingAttempt.create).not.toHaveBeenCalled()
    expect(documentStorage.openReadStream).not.toHaveBeenCalled()
  })

  function mockTransactions(...transactions: unknown[]): void {
    database.$transaction.mockImplementation((callback) => {
      const transaction = transactions.shift()

      if (!transaction) {
        throw new Error('Unexpected database transaction')
      }

      return callback(transaction)
    })
  }

  function createClaimTransaction({ attemptCount = 1 }: { attemptCount?: number } = {}) {
    return {
      processingJob: {
        updateMany: resolvedMock({ count: 1 }),
        findUnique: resolvedMock({
          id: 'processing-job-1',
          attemptCount,
          document: {
            id: 'document-1',
            originalFilename: 'invoice.txt',
            mimeType: 'text/plain',
            storageKey: 'storage-key-1',
          },
        }),
      },
      document: {
        updateMany: resolvedMock({ count: 1 }),
      },
      processingAttempt: {
        create: resolvedMock({ id: 'attempt-1' }),
      },
    }
  }

  function createStaleClaimTransaction({ attemptCount = 1 }: { attemptCount?: number } = {}) {
    const updateMany = resolvedMock({ count: 0 })
    updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    const findUnique = resolvedMock(undefined)
    findUnique
      .mockResolvedValueOnce({
        attemptCount,
        documentId: 'document-1',
        leaseExpiresAt: new Date(Date.now() - 1),
        status: PROCESSING_JOB_STATUSES.PROCESSING,
      })
      .mockResolvedValueOnce({
        id: 'processing-job-1',
        attemptCount: attemptCount + 1,
        document: {
          id: 'document-1',
          originalFilename: 'invoice.txt',
          mimeType: 'text/plain',
          storageKey: 'storage-key-1',
        },
      })

    return {
      processingJob: {
        updateMany,
        findUnique,
      },
      document: {
        update: resolvedMock({}),
        updateMany: resolvedMock({ count: 1 }),
      },
      processingAttempt: {
        create: resolvedMock({ id: 'attempt-2' }),
        updateMany: resolvedMock({ count: 1 }),
      },
    }
  }

  function createCompletionTransaction() {
    return {
      documentAnalysis: { upsert: resolvedMock({}) },
      processingAttempt: { update: resolvedMock({}) },
      processingJob: { update: resolvedMock({}) },
      document: { update: resolvedMock({}) },
    }
  }

  function createFailureTransaction() {
    return {
      processingAttempt: { update: resolvedMock({}) },
      processingJob: { update: resolvedMock({}) },
      document: { update: resolvedMock({}) },
    }
  }

  function resolvedMock(value: unknown): jest.Mock<(...args: unknown[]) => Promise<unknown>> {
    return jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(value)
  }
})
