'use client'

import { useEffect, useRef, useState } from 'react'
import { listDocuments } from './document-api'
import type { DocumentListItem, DocumentStatus, ProcessingJobStatus } from './document-types'

const POLLING_INTERVAL_MS = 2_000
const ACTIVE_PROCESSING_JOB_STATUSES = new Set<ProcessingJobStatus>([
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'RETRY_SCHEDULED',
])

type DisplayStatus = DocumentStatus | ProcessingJobStatus

export function DocumentsDashboard() {
  const [documents, setDocuments] = useState<DocumentListItem[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const documentsRef = useRef<DocumentListItem[] | null>(null)

  useEffect(() => {
    let isUnmounted = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const scheduleNextRequest = () => {
      timeoutId = setTimeout(() => {
        void loadDocuments()
      }, POLLING_INTERVAL_MS)
    }

    const loadDocuments = async () => {
      try {
        const nextDocuments = await listDocuments()

        if (isUnmounted) {
          return
        }

        documentsRef.current = nextDocuments
        setDocuments(nextDocuments)
        setErrorMessage(null)

        if (hasActiveProcessingJob(nextDocuments)) {
          scheduleNextRequest()
        }
      } catch (error) {
        if (isUnmounted) {
          return
        }

        setErrorMessage(getReadableErrorMessage(error))

        if (documentsRef.current && hasActiveProcessingJob(documentsRef.current)) {
          scheduleNextRequest()
        }
      }
    }

    void loadDocuments()

    return () => {
      isUnmounted = true

      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [requestVersion])

  const tryAgain = () => {
    setErrorMessage(null)
    setRequestVersion((currentVersion) => currentVersion + 1)
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-12 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Document Summarizer</h1>
          <p className="mt-2 text-base text-stone-600">
            Upload TXT and PDF documents for asynchronous analysis.
          </p>
        </header>

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
                  <DocumentList documents={documents} />
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function DocumentList({ documents }: { documents: DocumentListItem[] }) {
  return (
    <ol className="divide-y divide-stone-200 border-y border-stone-200">
      {documents.map((document) => (
        <li key={document.id} className="py-5 first:pt-5 last:pb-5">
          <h3 className="break-words text-base font-medium text-stone-900">
            {document.originalFilename}
          </h3>

          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-stone-500">Document status</dt>
              <dd className="mt-1">
                <StatusBadge status={document.status} />
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Processing job</dt>
              <dd className="mt-1">
                <StatusBadge status={document.processingJob.status} />
              </dd>
            </div>
            {document.analysis ? (
              <>
                <div>
                  <dt className="text-stone-500">Category</dt>
                  <dd className="mt-1 font-medium text-stone-800">{document.analysis.category}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Confidence</dt>
                  <dd className="mt-1 font-medium text-stone-800">
                    {formatConfidence(document.analysis.confidence)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </li>
      ))}
    </ol>
  )
}

function ErrorMessage({ message, onTryAgain }: { message: string; onTryAgain: () => void }) {
  return (
    <div
      aria-live="polite"
      className="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-900"
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

function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={`inline-flex border px-2 py-1 text-xs font-medium ${statusBadgeClassName(status)}`}
    >
      {status}
    </span>
  )
}

function hasActiveProcessingJob(documents: DocumentListItem[]): boolean {
  return documents.some((document) =>
    ACTIVE_PROCESSING_JOB_STATUSES.has(document.processingJob.status),
  )
}

function getReadableErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to load documents. Please try again.'
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

function statusBadgeClassName(status: DisplayStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'border-green-200 bg-green-50 text-green-800'
    case 'FAILED':
    case 'DEAD_LETTERED':
      return 'border-red-200 bg-red-50 text-red-800'
    case 'PROCESSING':
      return 'border-blue-200 bg-blue-50 text-blue-800'
    case 'RETRY_SCHEDULED':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'PENDING':
    case 'QUEUED':
      return 'border-stone-200 bg-stone-50 text-stone-700'
  }
}
