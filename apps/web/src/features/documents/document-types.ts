export type DocumentStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export type ProcessingJobStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'RETRY_SCHEDULED'
  | 'COMPLETED'
  | 'DEAD_LETTERED'

export type DocumentCategory =
  | 'NEWS_ARTICLE'
  | 'PRESCRIPTION'
  | 'INVOICE'
  | 'REPORT'
  | 'LETTER'
  | 'CONTRACT'
  | 'OTHER'

export type DocumentProcessingJob = {
  status: ProcessingJobStatus
  attemptCount: number
  nextRetryAt: string | null
  lastErrorCode: string | null
}

export type DocumentAnalysis = {
  category: DocumentCategory
  confidence: number
}

export type DocumentListItem = {
  id: string
  originalFilename: string
  mimeType: string
  status: DocumentStatus
  createdAt: string
  completedAt: string | null
  processingJob: DocumentProcessingJob
  analysis: DocumentAnalysis | null
}

export type UploadedDocument = {
  id: string
  originalFilename: string
  status: 'QUEUED'
}

export type UploadDocumentsResponse = {
  documents: UploadedDocument[]
}
