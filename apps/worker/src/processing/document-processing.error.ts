export const DOCUMENT_PROCESSING_ERROR_CODES = {
  UNSUPPORTED_MIME_TYPE: 'UNSUPPORTED_MIME_TYPE',
  CONTENT_EXTRACTION_FAILED: 'CONTENT_EXTRACTION_FAILED',
  EMPTY_DOCUMENT_TEXT: 'EMPTY_DOCUMENT_TEXT',
  WORKER_LEASE_EXPIRED: 'WORKER_LEASE_EXPIRED',
} as const

export type DocumentProcessingErrorCode =
  (typeof DOCUMENT_PROCESSING_ERROR_CODES)[keyof typeof DOCUMENT_PROCESSING_ERROR_CODES]

export class DocumentProcessingError extends Error {
  constructor(
    readonly code: DocumentProcessingErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'DocumentProcessingError'
  }
}
