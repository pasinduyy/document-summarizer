export const MAX_UPLOAD_FILES = 10
export const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024

export const SUPPORTED_UPLOAD_MIME_TYPES = ['application/pdf', 'text/plain'] as const

export type SupportedUploadMimeType = (typeof SUPPORTED_UPLOAD_MIME_TYPES)[number]
