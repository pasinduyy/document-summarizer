import type { DocumentListItem, UploadDocumentsResponse } from './document-types'

function getApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()

  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be set to the Document Summarizer API base URL.')
  }

  return apiBaseUrl.replace(/\/$/, '')
}

export async function listDocuments(): Promise<DocumentListItem[]> {
  const response = await fetch(`${getApiBaseUrl()}/documents`, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(
      `Unable to load documents: ${response.status} ${response.statusText || 'request failed'}.`,
    )
  }

  return response.json() as Promise<DocumentListItem[]>
}

export async function uploadDocuments(files: readonly File[]): Promise<UploadDocumentsResponse> {
  const formData = new FormData()

  for (const file of files) {
    formData.append('files', file)
  }

  const response = await fetch(`${getApiBaseUrl()}/documents`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await getUploadErrorMessage(response))
  }

  return response.json() as Promise<UploadDocumentsResponse>
}

async function getUploadErrorMessage(response: Response): Promise<string> {
  try {
    const responseBody: unknown = await response.json()
    const message = getResponseMessage(responseBody)

    if (message) {
      return message
    }
  } catch {
    // Fall through to a safe status-based message when the error response is not JSON.
  }

  return `Unable to upload files: ${response.status} ${response.statusText || 'request failed'}.`
}

function getResponseMessage(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== 'object' || !('message' in responseBody)) {
    return null
  }

  const { message } = responseBody

  if (typeof message === 'string' && message.trim()) {
    return message
  }

  if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
    const joinedMessage = message.filter((item) => item.trim()).join(' ')

    return joinedMessage || null
  }

  return null
}
