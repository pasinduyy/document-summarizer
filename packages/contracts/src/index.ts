export const DOCUMENT_STATUSES = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[keyof typeof DOCUMENT_STATUSES]

export const PROCESSING_JOB_STATUSES = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  RETRY_SCHEDULED: 'RETRY_SCHEDULED',
  COMPLETED: 'COMPLETED',
  DEAD_LETTERED: 'DEAD_LETTERED',
} as const

export type ProcessingJobStatus =
  (typeof PROCESSING_JOB_STATUSES)[keyof typeof PROCESSING_JOB_STATUSES]

export const PROCESSING_ATTEMPT_STATUSES = {
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const

export type ProcessingAttemptStatus =
  (typeof PROCESSING_ATTEMPT_STATUSES)[keyof typeof PROCESSING_ATTEMPT_STATUSES]

export const DOCUMENT_CATEGORIES = {
  NEWS_ARTICLE: 'NEWS_ARTICLE',
  PRESCRIPTION: 'PRESCRIPTION',
  INVOICE: 'INVOICE',
  REPORT: 'REPORT',
  LETTER: 'LETTER',
  CONTRACT: 'CONTRACT',
  OTHER: 'OTHER',
} as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[keyof typeof DOCUMENT_CATEGORIES]

export type ProcessDocumentJobPayload = {
  processingJobId: string
}

export const DOCUMENT_PROCESSING_QUEUE_NAME = 'document-processing'
export const PROCESS_DOCUMENT_JOB_NAME = 'process-document'
