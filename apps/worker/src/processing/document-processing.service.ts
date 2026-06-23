import {
  DOCUMENT_STATUSES,
  PROCESSING_ATTEMPT_STATUSES,
  PROCESSING_JOB_STATUSES,
} from '@document-summarizer/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { DocumentAnalysisProvider, DocumentAnalysisResult } from './document-analysis-provider'
import { DocumentProcessingError } from './document-processing.error'
import { DocumentTextExtractorService } from './document-text-extractor.service'

type ClaimedDocument = {
  documentId: string
  processingJobId: string
  processingAttemptId: string
  originalFilename: string
  mimeType: string
  storageKey: string
}

@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name)

  constructor(
    private readonly database: DatabaseService,
    private readonly textExtractor: DocumentTextExtractorService,
    @Inject(DocumentAnalysisProvider)
    private readonly documentAnalysis: DocumentAnalysisProvider,
  ) {}

  async process(processingJobId: string): Promise<void> {
    const claimedDocument = await this.claim(processingJobId)

    if (!claimedDocument) {
      this.logger.debug(`Processing job ${processingJobId} was already claimed or handled`)
      return
    }

    try {
      const text = await this.textExtractor.extract(claimedDocument)
      const analysis = await this.documentAnalysis.analyze(text)
      await this.complete(claimedDocument, analysis)
    } catch (error) {
      if (error instanceof DocumentProcessingError) {
        try {
          await this.failTerminally(claimedDocument, error.code)
        } catch (persistenceError) {
          this.logger.error(
            `Unable to record terminal failure for processing job ${processingJobId}: ${this.errorMessage(persistenceError)}`,
          )
        }
      }

      throw error
    }
  }

  private async claim(processingJobId: string): Promise<ClaimedDocument | null> {
    return this.database.$transaction(async (transaction) => {
      const claim = await transaction.processingJob.updateMany({
        where: {
          id: processingJobId,
          status: {
            in: [PROCESSING_JOB_STATUSES.PENDING, PROCESSING_JOB_STATUSES.QUEUED],
          },
        },
        data: {
          status: PROCESSING_JOB_STATUSES.PROCESSING,
          attemptCount: { increment: 1 },
        },
      })

      if (claim.count !== 1) {
        return null
      }

      const processingJob = await transaction.processingJob.findUnique({
        where: { id: processingJobId },
        select: {
          id: true,
          attemptCount: true,
          document: {
            select: {
              id: true,
              originalFilename: true,
              mimeType: true,
              storageKey: true,
            },
          },
        },
      })

      if (!processingJob) {
        throw new Error(`Claimed processing job ${processingJobId} no longer exists`)
      }

      const documentUpdate = await transaction.document.updateMany({
        where: {
          id: processingJob.document.id,
          status: DOCUMENT_STATUSES.QUEUED,
        },
        data: {
          status: DOCUMENT_STATUSES.PROCESSING,
        },
      })

      if (documentUpdate.count !== 1) {
        throw new Error(
          `Document ${processingJob.document.id} was not queued when processing began`,
        )
      }

      const processingAttempt = await transaction.processingAttempt.create({
        data: {
          processingJobId: processingJob.id,
          attemptNumber: processingJob.attemptCount,
          status: PROCESSING_ATTEMPT_STATUSES.STARTED,
        },
        select: { id: true },
      })

      return {
        documentId: processingJob.document.id,
        processingJobId: processingJob.id,
        processingAttemptId: processingAttempt.id,
        originalFilename: processingJob.document.originalFilename,
        mimeType: processingJob.document.mimeType,
        storageKey: processingJob.document.storageKey,
      }
    })
  }

  private async complete(
    claimedDocument: ClaimedDocument,
    analysis: DocumentAnalysisResult,
  ): Promise<void> {
    const completedAt = new Date()

    await this.database.$transaction(async (transaction) => {
      await transaction.documentAnalysis.upsert({
        where: { documentId: claimedDocument.documentId },
        create: {
          documentId: claimedDocument.documentId,
          summary: analysis.summary,
          category: analysis.category,
          confidence: analysis.confidence,
          providerName: analysis.providerName,
          modelVersion: analysis.modelVersion,
        },
        update: {
          summary: analysis.summary,
          category: analysis.category,
          confidence: analysis.confidence,
          providerName: analysis.providerName,
          modelVersion: analysis.modelVersion,
        },
      })
      await transaction.processingAttempt.update({
        where: { id: claimedDocument.processingAttemptId },
        data: {
          status: PROCESSING_ATTEMPT_STATUSES.COMPLETED,
          finishedAt: completedAt,
        },
      })
      await transaction.processingJob.update({
        where: { id: claimedDocument.processingJobId },
        data: {
          status: PROCESSING_JOB_STATUSES.COMPLETED,
          lastErrorCode: null,
          leaseExpiresAt: null,
        },
      })
      await transaction.document.update({
        where: { id: claimedDocument.documentId },
        data: {
          status: DOCUMENT_STATUSES.COMPLETED,
          completedAt,
        },
      })
    })
  }

  private async failTerminally(claimedDocument: ClaimedDocument, errorCode: string): Promise<void> {
    const finishedAt = new Date()

    await this.database.$transaction(async (transaction) => {
      await transaction.processingAttempt.update({
        where: { id: claimedDocument.processingAttemptId },
        data: {
          status: PROCESSING_ATTEMPT_STATUSES.FAILED,
          finishedAt,
          errorCode,
        },
      })
      await transaction.processingJob.update({
        where: { id: claimedDocument.processingJobId },
        data: {
          status: PROCESSING_JOB_STATUSES.DEAD_LETTERED,
          lastErrorCode: errorCode,
        },
      })
      await transaction.document.update({
        where: { id: claimedDocument.documentId },
        data: {
          status: DOCUMENT_STATUSES.FAILED,
        },
      })
    })
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
