export const MAX_UPLOAD_FILES = 10
export const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024

export const SUPPORTED_UPLOAD_MIME_TYPES = ['application/pdf', 'text/plain'] as const

export function validateSelectedFiles(files: readonly File[]): string | null {
  if (files.length > MAX_UPLOAD_FILES) {
    return `You can select up to ${MAX_UPLOAD_FILES} files at a time.`
  }

  for (const file of files) {
    if (
      !SUPPORTED_UPLOAD_MIME_TYPES.includes(
        file.type as (typeof SUPPORTED_UPLOAD_MIME_TYPES)[number],
      )
    ) {
      return `“${file.name}” is not a TXT or PDF file.`
    }

    if (file.size === 0) {
      return `“${file.name}” must not be empty.`
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      return `“${file.name}” exceeds the 10 MB size limit.`
    }
  }

  return null
}
