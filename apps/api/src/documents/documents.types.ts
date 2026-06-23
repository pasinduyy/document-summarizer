import {
  DOCUMENT_STATUSES,
  DocumentCategory,
  DocumentStatus,
  ProcessingAttemptStatus,
  ProcessingJobStatus,
} from '@document-summarizer/contracts'
import { Readable } from 'node:stream'

export type StagedUploadFile = {
  originalname: string
  mimetype: string
  size: number
  path: string
}

export type UploadedDocument = {
  id: string
  originalFilename: string
  status: typeof DOCUMENT_STATUSES.QUEUED
}

export type UploadDocumentsResponse = {
  documents: UploadedDocument[]
}

export type DocumentProcessingJob = {
  status: ProcessingJobStatus
  attemptCount: number
  nextRetryAt: Date | null
  lastErrorCode: string | null
}

export type DocumentListItem = {
  id: string
  originalFilename: string
  mimeType: string
  status: DocumentStatus
  createdAt: Date
  completedAt: Date | null
  processingJob: DocumentProcessingJob
  analysis: {
    category: DocumentCategory
    confidence: number
  } | null
}

export type DocumentDetail = {
  id: string
  originalFilename: string
  mimeType: string
  status: DocumentStatus
  createdAt: Date
  completedAt: Date | null
  processingJob: DocumentProcessingJob
  latestAttempt: {
    attemptNumber: number
    status: ProcessingAttemptStatus
    startedAt: Date
    finishedAt: Date | null
    errorCode: string | null
  } | null
  analysis: {
    summary: string
    category: DocumentCategory
    confidence: number
    providerName: string
    modelVersion: string | null
    createdAt: Date
  } | null
  contentUrl: string
}

export type StoredDocumentContent = {
  stream: Readable
  mimeType: string
  originalFilename: string
}
