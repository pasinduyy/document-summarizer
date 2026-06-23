import type { DocumentListItem } from './document-types'

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
