import {
  DOCUMENT_PROCESSING_BACKOFF_DELAY_MS,
  DOCUMENT_PROCESSING_LEASE_DURATION_MS,
  DOCUMENT_PROCESSING_MAX_ATTEMPTS,
  DOCUMENT_STATUSES,
  PROCESSING_ATTEMPT_STATUSES,
  PROCESSING_JOB_STATUSES,
} from '@document-summarizer/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { UnrecoverableError } from 'bullmq'
import { DatabaseService } from '../database/database.service'
import { DocumentAnalysisProvider, DocumentAnalysisResult } from './document-analysis-provider'
import {
  DOCUMENT_PROCESSING_ERROR_CODES,
  DocumentProcessingError,
} from './document-processing.error'
import { DocumentTextExtractorService } from './document-text-extractor.service'

type ClaimedDocument = {
  documentId: string
  processingJobId: string
  processingAttemptId: string
  attemptNumber: number
  originalFilename: string
  mimeType: string
  storageKey: string
}

type StaleFinalAttempt = {
  staleFinalAttempt: true
}

const PROCESSING_RETRYABLE_FAILURE = 'PROCESSING_RETRYABLE_FAILURE'
const PROCESSING_RETRY_EXHAUSTED = 'PROCESSING_RETRY_EXHAUSTED'

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

    if ('staleFinalAttempt' in claimedDocument) {
      throw new UnrecoverableError('Document processing lease expired after the final attempt')
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

          throw error
        }

        throw new UnrecoverableError(error.message)
      }

      if (claimedDocument.attemptNumber >= DOCUMENT_PROCESSING_MAX_ATTEMPTS) {
        await this.failAfterRetryExhausted(claimedDocument)
        throw new UnrecoverableError(this.errorMessage(error))
      }

      await this.scheduleRetry(claimedDocument)
      throw error
    }
  }

  private async claim(
    processingJobId: string,
  ): Promise<ClaimedDocument | StaleFinalAttempt | null> {
    const claimedAt = new Date()
    const leaseExpiresAt = new Date(claimedAt.getTime() + DOCUMENT_PROCESSING_LEASE_DURATION_MS)

    return this.database.$transaction(async (transaction) => {
      const normalClaim = await transaction.processingJob.updateMany({
        where: {
          id: processingJobId,
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
          leaseExpiresAt,
        },
      })

      const requiresQueuedDocument = normalClaim.count === 1

      if (!requiresQueuedDocument) {
        const staleProcessingJob = await transaction.processingJob.findUnique({
          where: { id: processingJobId },
          select: {
            attemptCount: true,
            documentId: true,
            leaseExpiresAt: true,
            status: true,
          },
        })

        if (
          !staleProcessingJob ||
          staleProcessingJob.status !== PROCESSING_JOB_STATUSES.PROCESSING ||
          !staleProcessingJob.leaseExpiresAt ||
          staleProcessingJob.leaseExpiresAt > claimedAt
        ) {
          return null
        }

        const staleClaimWhere = {
          id: processingJobId,
          attemptCount: staleProcessingJob.attemptCount,
          leaseExpiresAt: { lte: claimedAt },
          status: PROCESSING_JOB_STATUSES.PROCESSING,
        }

        if (staleProcessingJob.attemptCount >= DOCUMENT_PROCESSING_MAX_ATTEMPTS) {
          const deadLetter = await transaction.processingJob.updateMany({
            where: staleClaimWhere,
            data: {
              status: PROCESSING_JOB_STATUSES.DEAD_LETTERED,
              leaseExpiresAt: null,
              lastErrorCode: DOCUMENT_PROCESSING_ERROR_CODES.WORKER_LEASE_EXPIRED,
              nextRetryAt: null,
            },
          })

          if (deadLetter.count !== 1) {
            return null
          }

          const expiredAttempt = await transaction.processingAttempt.updateMany({
            where: {
              processingJobId,
              attemptNumber: staleProcessingJob.attemptCount,
              status: PROCESSING_ATTEMPT_STATUSES.STARTED,
            },
            data: {
              status: PROCESSING_ATTEMPT_STATUSES.FAILED,
              finishedAt: claimedAt,
              errorCode: DOCUMENT_PROCESSING_ERROR_CODES.WORKER_LEASE_EXPIRED,
            },
          })

          if (expiredAttempt.count !== 1) {
            throw new Error(
              `Processing job ${processingJobId} did not have a started final attempt to expire`,
            )
          }

          await transaction.document.update({
            where: { id: staleProcessingJob.documentId },
            data: { status: DOCUMENT_STATUSES.FAILED },
          })

          return { staleFinalAttempt: true }
        }

        const staleClaim = await transaction.processingJob.updateMany({
          where: staleClaimWhere,
          data: {
            status: PROCESSING_JOB_STATUSES.PROCESSING,
            attemptCount: { increment: 1 },
            leaseExpiresAt,
          },
        })

        if (staleClaim.count !== 1) {
          return null
        }

        const expiredAttempt = await transaction.processingAttempt.updateMany({
          where: {
            processingJobId,
            attemptNumber: staleProcessingJob.attemptCount,
            status: PROCESSING_ATTEMPT_STATUSES.STARTED,
          },
          data: {
            status: PROCESSING_ATTEMPT_STATUSES.FAILED,
            finishedAt: claimedAt,
            errorCode: DOCUMENT_PROCESSING_ERROR_CODES.WORKER_LEASE_EXPIRED,
          },
        })

        if (expiredAttempt.count !== 1) {
          throw new Error(
            `Processing job ${processingJobId} did not have a started attempt to expire`,
          )
        }
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

      if (requiresQueuedDocument) {
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
        attemptNumber: processingJob.attemptCount,
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
          nextRetryAt: null,
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
          nextRetryAt: null,
          leaseExpiresAt: null,
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

  private async scheduleRetry(claimedDocument: ClaimedDocument): Promise<void> {
    const finishedAt = new Date()
    const nextRetryAt = new Date(
      finishedAt.getTime() +
        DOCUMENT_PROCESSING_BACKOFF_DELAY_MS * 2 ** (claimedDocument.attemptNumber - 1),
    )

    await this.database.$transaction(async (transaction) => {
      await transaction.processingAttempt.update({
        where: { id: claimedDocument.processingAttemptId },
        data: {
          status: PROCESSING_ATTEMPT_STATUSES.FAILED,
          finishedAt,
          errorCode: PROCESSING_RETRYABLE_FAILURE,
        },
      })
      await transaction.processingJob.update({
        where: { id: claimedDocument.processingJobId },
        data: {
          status: PROCESSING_JOB_STATUSES.RETRY_SCHEDULED,
          lastErrorCode: PROCESSING_RETRYABLE_FAILURE,
          nextRetryAt,
          leaseExpiresAt: null,
        },
      })
      await transaction.document.update({
        where: { id: claimedDocument.documentId },
        data: {
          status: DOCUMENT_STATUSES.QUEUED,
        },
      })
    })
  }

  private async failAfterRetryExhausted(claimedDocument: ClaimedDocument): Promise<void> {
    const finishedAt = new Date()

    await this.database.$transaction(async (transaction) => {
      await transaction.processingAttempt.update({
        where: { id: claimedDocument.processingAttemptId },
        data: {
          status: PROCESSING_ATTEMPT_STATUSES.FAILED,
          finishedAt,
          errorCode: PROCESSING_RETRY_EXHAUSTED,
        },
      })
      await transaction.processingJob.update({
        where: { id: claimedDocument.processingJobId },
        data: {
          status: PROCESSING_JOB_STATUSES.DEAD_LETTERED,
          lastErrorCode: PROCESSING_RETRY_EXHAUSTED,
          nextRetryAt: null,
          leaseExpiresAt: null,
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
