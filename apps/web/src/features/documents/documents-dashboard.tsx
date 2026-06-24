'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocumentDetail, listDocuments } from './document-api'
import { DocumentDetail, type SelectedDocumentDetailState } from './document-detail'
import { DocumentList } from './document-list'
import { DocumentUploadPanel } from './document-upload-panel'
import type {
  DocumentListItem,
  ProcessingJobStatus,
  UploadDocumentsResponse,
} from './document-types'

const POLLING_INTERVAL_MS = 2_000
const ACTIVE_PROCESSING_JOB_STATUSES = new Set<ProcessingJobStatus>([
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'RETRY_SCHEDULED',
])

export function DocumentsDashboard() {
  const [documents, setDocuments] = useState<DocumentListItem[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [listRefreshRequest, setListRefreshRequest] = useState(0)
  const [selectedDocumentDetail, setSelectedDocumentDetail] = useState<SelectedDocumentDetailState>(
    { status: 'idle' },
  )
  const documentsRef = useRef<DocumentListItem[] | null>(null)
  const selectedDocumentIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(false)
  const listRequestInFlightRef = useRef(false)
  const listRefreshQueuedRef = useRef(false)
  const listAbortControllerRef = useRef<AbortController | null>(null)
  const listPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const detailAbortControllerRef = useRef<AbortController | null>(null)
  const detailRequestVersionRef = useRef(0)

  const clearListPolling = useCallback(() => {
    if (listPollTimeoutRef.current) {
      clearTimeout(listPollTimeoutRef.current)
      listPollTimeoutRef.current = undefined
    }
  }, [])

  const requestListRefresh = useCallback(() => {
    setListRefreshRequest((currentRequest) => currentRequest + 1)
  }, [])

  const refreshSelectedDocumentDetail = useCallback(async (documentId: string) => {
    detailAbortControllerRef.current?.abort()

    const abortController = new AbortController()
    const requestVersion = detailRequestVersionRef.current + 1
    detailRequestVersionRef.current = requestVersion
    detailAbortControllerRef.current = abortController
    setSelectedDocumentDetail({ status: 'loading' })

    try {
      const documentDetail = await getDocumentDetail(documentId, abortController.signal)

      if (
        !isMountedRef.current ||
        abortController.signal.aborted ||
        requestVersion !== detailRequestVersionRef.current ||
        documentId !== selectedDocumentIdRef.current
      ) {
        return
      }

      setSelectedDocumentDetail({ status: 'loaded', document: documentDetail })
    } catch (error) {
      if (
        !isMountedRef.current ||
        abortController.signal.aborted ||
        requestVersion !== detailRequestVersionRef.current ||
        documentId !== selectedDocumentIdRef.current
      ) {
        return
      }

      setSelectedDocumentDetail({ status: 'error', message: getReadableDetailErrorMessage(error) })
    }
  }, [])

  const scheduleNextListPoll = useCallback(() => {
    clearListPolling()
    listPollTimeoutRef.current = setTimeout(() => {
      listPollTimeoutRef.current = undefined
      requestListRefresh()
    }, POLLING_INTERVAL_MS)
  }, [clearListPolling, requestListRefresh])

  const refreshDocuments = useCallback(async () => {
    if (listRequestInFlightRef.current) {
      listRefreshQueuedRef.current = true
      return
    }

    clearListPolling()
    listRequestInFlightRef.current = true
    const abortController = new AbortController()
    listAbortControllerRef.current = abortController

    try {
      const nextDocuments = await listDocuments(abortController.signal)

      if (!isMountedRef.current || abortController.signal.aborted) {
        return
      }

      documentsRef.current = nextDocuments
      setDocuments(nextDocuments)
      setErrorMessage(null)

      const currentSelectedDocumentId = selectedDocumentIdRef.current
      const shouldKeepCurrentSelectionUntilQueuedRefresh =
        listRefreshQueuedRef.current &&
        currentSelectedDocumentId !== null &&
        !nextDocuments.some(({ id }) => id === currentSelectedDocumentId)
      const nextSelectedDocumentId = shouldKeepCurrentSelectionUntilQueuedRefresh
        ? currentSelectedDocumentId
        : getNextSelectedDocumentId(nextDocuments, currentSelectedDocumentId)

      if (nextSelectedDocumentId !== currentSelectedDocumentId) {
        selectedDocumentIdRef.current = nextSelectedDocumentId
        setSelectedDocumentId(nextSelectedDocumentId)

        if (!nextSelectedDocumentId) {
          detailAbortControllerRef.current?.abort()
          setSelectedDocumentDetail({ status: 'idle' })
        } else {
          void refreshSelectedDocumentDetail(nextSelectedDocumentId)
        }
      } else if (nextSelectedDocumentId) {
        void refreshSelectedDocumentDetail(nextSelectedDocumentId)
      }
    } catch (error) {
      if (!isMountedRef.current || abortController.signal.aborted) {
        return
      }

      setErrorMessage(getReadableListErrorMessage(error))
    } finally {
      listRequestInFlightRef.current = false

      if (!isMountedRef.current) {
        return
      }

      if (listRefreshQueuedRef.current) {
        listRefreshQueuedRef.current = false
        requestListRefresh()
        return
      }

      if (documentsRef.current && hasActiveProcessingJob(documentsRef.current)) {
        scheduleNextListPoll()
      }
    }
  }, [clearListPolling, refreshSelectedDocumentDetail, requestListRefresh, scheduleNextListPoll])

  useEffect(() => {
    isMountedRef.current = true
    const initialRequestTimeout = setTimeout(() => {
      void refreshDocuments()
    }, 0)

    return () => {
      isMountedRef.current = false
      clearTimeout(initialRequestTimeout)
      clearListPolling()
      listAbortControllerRef.current?.abort()
      detailAbortControllerRef.current?.abort()
    }
  }, [clearListPolling, refreshDocuments])

  useEffect(() => {
    if (listRefreshRequest === 0) {
      return
    }

    const refreshTimeout = setTimeout(() => {
      void refreshDocuments()
    }, 0)

    return () => {
      clearTimeout(refreshTimeout)
    }
  }, [listRefreshRequest, refreshDocuments])

  const selectDocument = (documentId: string | null) => {
    selectedDocumentIdRef.current = documentId
    setSelectedDocumentId(documentId)

    if (!documentId) {
      detailAbortControllerRef.current?.abort()
      setSelectedDocumentDetail({ status: 'idle' })
    } else {
      void refreshSelectedDocumentDetail(documentId)
    }
  }

  const tryAgain = () => {
    setErrorMessage(null)
    requestListRefresh()
  }

  const handleUploadCompleted = (response: UploadDocumentsResponse) => {
    const firstAcceptedDocument = response.documents[0]

    if (firstAcceptedDocument) {
      selectDocument(firstAcceptedDocument.id)
    }

    requestListRefresh()
  }

  const refreshSelectedDocument = () => {
    if (selectedDocumentIdRef.current) {
      void refreshSelectedDocumentDetail(selectedDocumentIdRef.current)
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-12 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Document Summarizer</h1>
          <p className="mt-2 text-base text-stone-600">Upload documents.</p>
        </header>

        <DocumentUploadPanel onUploadCompleted={handleUploadCompleted} />

        <div className="grid gap-6 lg:grid-cols-2">
          <section
            aria-labelledby="documents-heading"
            className="border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 id="documents-heading" className="text-xl font-semibold">
              Documents
            </h2>

            <div className="mt-6">
              {documents === null ? (
                errorMessage ? (
                  <ErrorMessage message={errorMessage} onTryAgain={tryAgain} />
                ) : (
                  <p aria-live="polite" className="text-sm text-stone-600" role="status">
                    Loading documents…
                  </p>
                )
              ) : (
                <>
                  {errorMessage ? (
                    <ErrorMessage message={errorMessage} onTryAgain={tryAgain} />
                  ) : null}
                  {documents.length === 0 ? (
                    <p aria-live="polite" className="text-sm text-stone-600" role="status">
                      No documents have been uploaded yet.
                    </p>
                  ) : (
                    <DocumentList
                      documents={documents}
                      onSelectDocument={selectDocument}
                      selectedDocumentId={selectedDocumentId}
                    />
                  )}
                </>
              )}
            </div>
          </section>

          <DocumentDetail
            detailState={selectedDocumentDetail}
            onRefresh={refreshSelectedDocument}
          />
        </div>
      </div>
    </main>
  )
}

function ErrorMessage({ message, onTryAgain }: { message: string; onTryAgain: () => void }) {
  return (
    <div
      aria-live="polite"
      className="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-900"
      role="status"
    >
      <p>{message}</p>
      <button
        className="mt-3 border border-red-300 bg-white px-3 py-1.5 font-medium text-red-900"
        onClick={onTryAgain}
        type="button"
      >
        Try again
      </button>
    </div>
  )
}

function getNextSelectedDocumentId(
  documents: readonly DocumentListItem[],
  currentSelectedDocumentId: string | null,
): string | null {
  if (currentSelectedDocumentId && documents.some(({ id }) => id === currentSelectedDocumentId)) {
    return currentSelectedDocumentId
  }

  return documents[0]?.id ?? null
}

function hasActiveProcessingJob(documents: readonly DocumentListItem[]): boolean {
  return documents.some((document) =>
    ACTIVE_PROCESSING_JOB_STATUSES.has(document.processingJob.status),
  )
}

function getReadableListErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to load documents. Please try again.'
}

function getReadableDetailErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to load selected document details. Please try again.'
}
