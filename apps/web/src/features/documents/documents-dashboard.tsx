'use client'

import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import { listDocuments, uploadDocuments } from './document-api'
import type { DocumentListItem, DocumentStatus, ProcessingJobStatus } from './document-types'
import { SUPPORTED_UPLOAD_MIME_TYPES, validateSelectedFiles } from './file-validation'

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

  const refreshDocuments = () => {
    setRequestVersion((currentVersion) => currentVersion + 1)
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-12 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Document Summarizer</h1>
          <p className="mt-2 text-base text-stone-600">
            Upload documents.
          </p>
        </header>

        <UploadDocumentsPanel onUploadCompleted={refreshDocuments} />

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

function UploadDocumentsPanel({ onUploadCompleted }: { onUploadCompleted: () => void }) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.currentTarget.files ?? [])

    event.currentTarget.value = ''

    if (nextFiles.length === 0) {
      return
    }

    const validationMessage = validateSelectedFiles(nextFiles)

    if (validationMessage) {
      setErrorMessage(validationMessage)
      setSuccessMessage(null)
      return
    }

    setSelectedFiles(nextFiles)
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const removeFile = (fileToRemove: File) => {
    setSelectedFiles((currentFiles) => currentFiles.filter((file) => file !== fileToRemove))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (selectedFiles.length === 0 || isUploading) {
      return
    }

    setIsUploading(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const response = await uploadDocuments(selectedFiles)
      const uploadedDocumentCount = response.documents.length

      setSelectedFiles([])
      setSuccessMessage(
        `${uploadedDocumentCount} ${uploadedDocumentCount === 1 ? 'document' : 'documents'} accepted for processing.`,
      )
      onUploadCompleted()
    } catch (error) {
      setErrorMessage(getReadableUploadErrorMessage(error))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <section
      aria-labelledby="upload-documents-heading"
      className="mb-6 border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 id="upload-documents-heading" className="text-xl font-semibold">
        Upload documents
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        Select up to 10 TXT or PDF files, up to 10 MB each.
      </p>

      <form className="mt-6" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-stone-800" htmlFor="document-files">
          Choose TXT or PDF files
        </label>
        <input
          accept={SUPPORTED_UPLOAD_MIME_TYPES.join(',')}
          className="mt-2 block w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 file:mr-4 file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-900 hover:file:bg-stone-200"
          disabled={isUploading}
          id="document-files"
          multiple
          name="files"
          onChange={handleFileSelection}
          type="file"
        />

        <p aria-live="polite" className="mt-3 text-sm text-stone-600" role="status">
          {formatSelectedFileCount(selectedFiles.length)}
        </p>

        {selectedFiles.length > 0 ? (
          <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
            {selectedFiles.map((file, index) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={`${file.name}-${file.lastModified}-${file.size}-${index}`}
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-stone-900">{file.name}</p>
                  <p className="mt-1 text-sm text-stone-600">{formatFileSize(file.size)}</p>
                </div>
                <button
                  aria-label={`Remove ${file.name}`}
                  className="border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isUploading}
                  onClick={() => removeFile(file)}
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {errorMessage ? (
          <p
            aria-live="polite"
            className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-900"
            role="status"
          >
            <span className="font-medium">Upload error:</span> {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p
            aria-live="polite"
            className="mt-4 border border-green-200 bg-green-50 p-3 text-sm text-green-900"
            role="status"
          >
            {successMessage}
          </p>
        ) : null}

        <button
          className="mt-5 border border-stone-900 bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={selectedFiles.length === 0 || isUploading}
          type="submit"
        >
          {isUploading ? 'Uploading files…' : uploadButtonLabel(selectedFiles.length)}
        </button>
      </form>
    </section>
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

function getReadableUploadErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to upload files. Please try again.'
}

function formatSelectedFileCount(fileCount: number): string {
  if (fileCount === 0) {
    return 'No files selected.'
  }

  return `${fileCount} ${fileCount === 1 ? 'file' : 'files'} selected.`
}

function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`
  }

  const units = ['KB', 'MB', 'GB']
  const unitIndex = Math.min(
    Math.floor(Math.log(sizeInBytes) / Math.log(1024)) - 1,
    units.length - 1,
  )
  const size = sizeInBytes / 1024 ** (unitIndex + 1)
  const formattedSize = size >= 10 ? size.toFixed(0) : size.toFixed(1)

  return `${formattedSize} ${units[unitIndex]}`
}

function uploadButtonLabel(fileCount: number): string {
  if (fileCount === 0) {
    return 'Upload files'
  }

  return `Upload ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`
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
