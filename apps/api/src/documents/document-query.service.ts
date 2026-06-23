import { DocumentCategory } from '@document-summarizer/contracts'
import { DocumentStorage } from '@document-summarizer/storage'
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { DocumentDetail, DocumentListItem, StoredDocumentContent } from './documents.types'

const LATEST_DOCUMENT_LIMIT = 50

@Injectable()
export class DocumentQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly documentStorage: DocumentStorage,
  ) {}

  async list(): Promise<DocumentListItem[]> {
    const documents = await this.database.document.findMany({
      take: LATEST_DOCUMENT_LIMIT,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        status: true,
        createdAt: true,
        completedAt: true,
        processingJob: {
          select: {
            status: true,
            attemptCount: true,
            nextRetryAt: true,
            lastErrorCode: true,
          },
        },
        analysis: {
          select: {
            category: true,
            confidence: true,
          },
        },
      },
    })

    return documents.map((document) => {
      const processingJob = this.requireProcessingJob(document.processingJob)

      return {
        id: document.id,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        status: document.status,
        createdAt: document.createdAt,
        completedAt: document.completedAt,
        processingJob: {
          status: processingJob.status,
          attemptCount: processingJob.attemptCount,
          nextRetryAt: processingJob.nextRetryAt,
          lastErrorCode: processingJob.lastErrorCode,
        },
        analysis: document.analysis
          ? {
              category: document.analysis.category as DocumentCategory,
              confidence: document.analysis.confidence,
            }
          : null,
      }
    })
  }

  async getDetail(id: string): Promise<DocumentDetail> {
    const document = await this.database.document.findUnique({
      where: { id },
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        status: true,
        createdAt: true,
        completedAt: true,
        processingJob: {
          select: {
            status: true,
            attemptCount: true,
            nextRetryAt: true,
            lastErrorCode: true,
            attempts: {
              take: 1,
              orderBy: {
                attemptNumber: 'desc',
              },
              select: {
                attemptNumber: true,
                status: true,
                startedAt: true,
                finishedAt: true,
                errorCode: true,
              },
            },
          },
        },
        analysis: {
          select: {
            summary: true,
            category: true,
            confidence: true,
            providerName: true,
            modelVersion: true,
            createdAt: true,
          },
        },
      },
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    const processingJob = this.requireProcessingJob(document.processingJob)
    const latestAttempt = processingJob.attempts[0]

    return {
      id: document.id,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      status: document.status,
      createdAt: document.createdAt,
      completedAt: document.completedAt,
      processingJob: {
        status: processingJob.status,
        attemptCount: processingJob.attemptCount,
        nextRetryAt: processingJob.nextRetryAt,
        lastErrorCode: processingJob.lastErrorCode,
      },
      latestAttempt: latestAttempt
        ? {
            attemptNumber: latestAttempt.attemptNumber,
            status: latestAttempt.status,
            startedAt: latestAttempt.startedAt,
            finishedAt: latestAttempt.finishedAt,
            errorCode: latestAttempt.errorCode,
          }
        : null,
      analysis: document.analysis
        ? {
            summary: document.analysis.summary,
            category: document.analysis.category as DocumentCategory,
            confidence: document.analysis.confidence,
            providerName: document.analysis.providerName,
            modelVersion: document.analysis.modelVersion,
            createdAt: document.analysis.createdAt,
          }
        : null,
      contentUrl: `/documents/${document.id}/content`,
    }
  }

  async getContent(id: string): Promise<StoredDocumentContent> {
    const document = await this.database.document.findUnique({
      where: { id },
      select: {
        originalFilename: true,
        mimeType: true,
        storageKey: true,
      },
    })

    if (!document) {
      throw new NotFoundException('Document content not found')
    }

    try {
      const stream = await this.documentStorage.openReadStream(document.storageKey)

      return {
        stream,
        mimeType: document.mimeType,
        originalFilename: document.originalFilename,
      }
    } catch {
      throw new NotFoundException('Document content not found')
    }
  }

  private requireProcessingJob<T>(processingJob: T | null): T {
    if (!processingJob) {
      throw new InternalServerErrorException('Document processing state is unavailable')
    }

    return processingJob
  }
}
