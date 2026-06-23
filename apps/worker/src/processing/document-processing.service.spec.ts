import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  PROCESSING_ATTEMPT_STATUSES,
  PROCESSING_JOB_STATUSES,
} from '@document-summarizer/contracts'
import { DocumentStorage } from '@document-summarizer/storage'
import { Logger } from '@nestjs/common'
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
          in: [PROCESSING_JOB_STATUSES.PENDING, PROCESSING_JOB_STATUSES.QUEUED],
        },
      },
      data: {
        status: PROCESSING_JOB_STATUSES.PROCESSING,
        attemptCount: { increment: 1 },
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

    expect(claimTransaction.processingJob.findUnique).not.toHaveBeenCalled()
    expect(documentStorage.openReadStream).not.toHaveBeenCalled()
    expect(documentAnalysis.analyze).not.toHaveBeenCalled()
    expect(database.$transaction).toHaveBeenCalledTimes(1)
  })

  it('records terminal extraction failure and rejects the queue processor', async () => {
    const claimTransaction = createClaimTransaction()
    const failureTransaction = createFailureTransaction()
    mockTransactions(claimTransaction, failureTransaction)
    documentStorage.openReadStream.mockResolvedValue(Readable.from(['  \n\t  ']))

    await expect(service.process('processing-job-1')).rejects.toMatchObject({
      code: DOCUMENT_PROCESSING_ERROR_CODES.EMPTY_DOCUMENT_TEXT,
    })

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
      },
    })
    expect(failureTransaction.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { status: DOCUMENT_STATUSES.FAILED },
    })
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

  function createClaimTransaction() {
    return {
      processingJob: {
        updateMany: resolvedMock({ count: 1 }),
        findUnique: resolvedMock({
          id: 'processing-job-1',
          attemptCount: 1,
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
