import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  PROCESSING_ATTEMPT_STATUSES,
  PROCESSING_JOB_STATUSES,
} from '@document-summarizer/contracts'
import { DocumentStorage } from '@document-summarizer/storage'
import { NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Readable } from 'node:stream'
import { DatabaseService } from '../database/database.service'
import { DocumentQueryService } from './document-query.service'

describe('DocumentQueryService', () => {
  let database: {
    document: {
      findMany: ReturnType<typeof jest.fn>
      findUnique: ReturnType<typeof jest.fn>
    }
  }
  let documentStorage: {
    openReadStream: ReturnType<typeof jest.fn>
  }
  let service: DocumentQueryService

  beforeEach(() => {
    database = {
      document: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    }
    documentStorage = {
      openReadStream: jest.fn(),
    }
    service = new DocumentQueryService(
      database as unknown as DatabaseService,
      documentStorage as unknown as DocumentStorage,
    )
  })

  it('returns at most 50 newest documents without exposing storage details', async () => {
    const createdAt = new Date('2026-06-20T10:00:00.000Z')
    const completedAt = new Date('2026-06-20T10:01:00.000Z')
    database.document.findMany.mockResolvedValue([
      {
        id: 'document-1',
        originalFilename: 'report.pdf',
        mimeType: 'application/pdf',
        status: DOCUMENT_STATUSES.COMPLETED,
        createdAt,
        completedAt,
        storageKey: 'private-storage-key',
        processingJob: {
          status: PROCESSING_JOB_STATUSES.COMPLETED,
          attemptCount: 1,
          nextRetryAt: null,
          lastErrorCode: null,
        },
        analysis: {
          category: DOCUMENT_CATEGORIES.REPORT,
          confidence: 0.97,
        },
      },
    ])

    const result = await service.list()

    expect(database.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
    )
    expect(result).toEqual([
      {
        id: 'document-1',
        originalFilename: 'report.pdf',
        mimeType: 'application/pdf',
        status: DOCUMENT_STATUSES.COMPLETED,
        createdAt,
        completedAt,
        processingJob: {
          status: PROCESSING_JOB_STATUSES.COMPLETED,
          attemptCount: 1,
          nextRetryAt: null,
          lastErrorCode: null,
        },
        analysis: {
          category: DOCUMENT_CATEGORIES.REPORT,
          confidence: 0.97,
        },
      },
    ])
    expect(result[0]).not.toHaveProperty('storageKey')
  })

  it('returns document analysis, job state, latest attempt, and a relative content URL', async () => {
    const createdAt = new Date('2026-06-20T10:00:00.000Z')
    const completedAt = new Date('2026-06-20T10:01:00.000Z')
    const startedAt = new Date('2026-06-20T10:00:10.000Z')
    const analysisCreatedAt = new Date('2026-06-20T10:00:50.000Z')
    database.document.findUnique.mockResolvedValue({
      id: 'document-1',
      originalFilename: 'report.pdf',
      mimeType: 'application/pdf',
      status: DOCUMENT_STATUSES.COMPLETED,
      createdAt,
      completedAt,
      storageKey: 'private-storage-key',
      processingJob: {
        status: PROCESSING_JOB_STATUSES.COMPLETED,
        attemptCount: 1,
        nextRetryAt: null,
        lastErrorCode: null,
        attempts: [
          {
            id: 'internal-attempt-id',
            attemptNumber: 1,
            status: PROCESSING_ATTEMPT_STATUSES.COMPLETED,
            startedAt,
            finishedAt: completedAt,
            errorCode: null,
          },
        ],
      },
      analysis: {
        id: 'internal-analysis-id',
        summary: 'The report is complete.',
        category: DOCUMENT_CATEGORIES.REPORT,
        confidence: 0.97,
        providerName: 'mock-provider',
        modelVersion: 'v1',
        createdAt: analysisCreatedAt,
      },
    })

    await expect(service.getDetail('document-1')).resolves.toEqual({
      id: 'document-1',
      originalFilename: 'report.pdf',
      mimeType: 'application/pdf',
      status: DOCUMENT_STATUSES.COMPLETED,
      createdAt,
      completedAt,
      processingJob: {
        status: PROCESSING_JOB_STATUSES.COMPLETED,
        attemptCount: 1,
        nextRetryAt: null,
        lastErrorCode: null,
      },
      latestAttempt: {
        attemptNumber: 1,
        status: PROCESSING_ATTEMPT_STATUSES.COMPLETED,
        startedAt,
        finishedAt: completedAt,
        errorCode: null,
      },
      analysis: {
        summary: 'The report is complete.',
        category: DOCUMENT_CATEGORIES.REPORT,
        confidence: 0.97,
        providerName: 'mock-provider',
        modelVersion: 'v1',
        createdAt: analysisCreatedAt,
      },
      contentUrl: '/documents/document-1/content',
    })
  })

  it('returns a 404 when the requested document does not exist', async () => {
    database.document.findUnique.mockResolvedValue(null)

    await expect(service.getDetail('missing-document')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.getDetail('missing-document')).rejects.toThrow('Document not found')
  })

  it('opens the stored document and returns its streaming metadata', async () => {
    const stream = Readable.from('document content')
    database.document.findUnique.mockResolvedValue({
      originalFilename: 'report.pdf',
      mimeType: 'application/pdf',
      storageKey: 'private-storage-key',
    })
    documentStorage.openReadStream.mockResolvedValue(stream)

    await expect(service.getContent('document-1')).resolves.toEqual({
      stream,
      mimeType: 'application/pdf',
      originalFilename: 'report.pdf',
    })
    expect(documentStorage.openReadStream).toHaveBeenCalledWith('private-storage-key')
  })

  it('returns a 404 when content metadata does not exist', async () => {
    database.document.findUnique.mockResolvedValue(null)

    await expect(service.getContent('missing-document')).rejects.toBeInstanceOf(NotFoundException)
    expect(documentStorage.openReadStream).not.toHaveBeenCalled()
  })

  it('maps unavailable stored content to a safe 404', async () => {
    database.document.findUnique.mockResolvedValue({
      originalFilename: 'report.pdf',
      mimeType: 'application/pdf',
      storageKey: 'private-storage-key',
    })
    documentStorage.openReadStream.mockRejectedValue(new Error('ENOENT: private storage path'))

    await expect(service.getContent('document-1')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.getContent('document-1')).rejects.toThrow('Document content not found')
  })
})
