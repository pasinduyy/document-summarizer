import type { DocumentDetail } from './document-types'

export type SelectedDocumentDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; document: DocumentDetail }
  | { status: 'error'; message: string }

type DocumentDetailProps = {
  detailState: SelectedDocumentDetailState
  onRefresh: () => void
}

type DetailStatus = 'QUEUED' | 'PROCESSING' | 'RETRY_SCHEDULED' | 'COMPLETED' | 'FAILED'

export function DocumentDetail({ detailState, onRefresh }: DocumentDetailProps) {
  return (
    <section
      aria-labelledby="document-detail-heading"
      className="border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 id="document-detail-heading" className="text-xl font-semibold">
        Selected document
      </h2>

      {detailState.status === 'idle' ? (
        <p className="mt-6 text-sm text-stone-600">
          Select a document to view its processing details.
        </p>
      ) : null}

      {detailState.status === 'loading' ? (
        <p aria-live="polite" className="mt-6 text-sm text-stone-600" role="status">
          Loading selected document details…
        </p>
      ) : null}

      {detailState.status === 'error' ? (
        <div
          aria-live="polite"
          className="mt-6 border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="status"
        >
          <p>{detailState.message}</p>
          <button
            className="mt-3 border border-red-300 bg-white px-3 py-1.5 font-medium text-red-900"
            onClick={onRefresh}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {detailState.status === 'loaded' ? (
        <DocumentDetailContent document={detailState.document} />
      ) : null}
    </section>
  )
}

function DocumentDetailContent({ document }: { document: DocumentDetail }) {
  const processingStatus = getDetailStatus(document)

  return (
    <div className="mt-6">
      <h3 className="break-words text-base font-medium text-stone-900">
        {document.originalFilename}
      </h3>

      <div aria-live="polite" className="mt-4" role="status">
        <p className="text-sm text-stone-500">Processing status</p>
        <p className="mt-1">
          <StatusBadge status={processingStatus} />
        </p>
        <ProcessingStatusMessage document={document} status={processingStatus} />
      </div>

      {processingStatus === 'COMPLETED' ? <CompletedResult document={document} /> : null}
      {processingStatus === 'FAILED' ? <FailedResult document={document} /> : null}
    </div>
  )
}

function ProcessingStatusMessage({
  document,
  status,
}: {
  document: DocumentDetail
  status: DetailStatus
}) {
  switch (status) {
    case 'QUEUED':
      return <p className="mt-3 text-sm text-stone-600">Waiting to be processed.</p>
    case 'PROCESSING':
      return <p className="mt-3 text-sm text-stone-600">Processing document…</p>
    case 'RETRY_SCHEDULED':
      return (
        <div className="mt-3 text-sm text-stone-600">
          <p>Temporary issue. Another processing attempt is scheduled.</p>
          {document.processingJob.nextRetryAt ? (
            <p className="mt-1">Next retry: {formatDateTime(document.processingJob.nextRetryAt)}</p>
          ) : null}
        </div>
      )
    case 'COMPLETED':
    case 'FAILED':
      return null
  }
}

function CompletedResult({ document }: { document: DocumentDetail }) {
  if (!document.analysis) {
    return (
      <p className="mt-6 text-sm text-stone-600">Processing completed. Results are unavailable.</p>
    )
  }

  return (
    <section
      aria-labelledby="document-result-heading"
      className="mt-6 border-t border-stone-200 pt-6"
    >
      <h4 id="document-result-heading" className="text-base font-semibold text-stone-900">
        Result
      </h4>
      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="text-stone-500">Summary</dt>
          <dd className="mt-1 whitespace-pre-wrap text-stone-800">{document.analysis.summary}</dd>
        </div>
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
        <div>
          <dt className="text-stone-500">Provider</dt>
          <dd className="mt-1 font-medium text-stone-800">{document.analysis.providerName}</dd>
        </div>
        {document.analysis.modelVersion ? (
          <div>
            <dt className="text-stone-500">Model version</dt>
            <dd className="mt-1 font-medium text-stone-800">{document.analysis.modelVersion}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}

function FailedResult({ document }: { document: DocumentDetail }) {
  const errorCode = getSafeErrorCode(
    document.processingJob.lastErrorCode ?? document.latestAttempt?.errorCode ?? null,
  )

  return (
    <section
      aria-labelledby="document-failure-heading"
      className="mt-6 border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      <h4 id="document-failure-heading" className="font-semibold">
        Processing failed.
      </h4>
      {errorCode ? <p className="mt-2">Reason: {errorCode}</p> : null}
    </section>
  )
}

function getDetailStatus(document: DocumentDetail): DetailStatus {
  if (document.status === 'FAILED' || document.processingJob.status === 'DEAD_LETTERED') {
    return 'FAILED'
  }

  switch (document.processingJob.status) {
    case 'PENDING':
    case 'QUEUED':
      return 'QUEUED'
    case 'PROCESSING':
      return 'PROCESSING'
    case 'RETRY_SCHEDULED':
      return 'RETRY_SCHEDULED'
    case 'COMPLETED':
      return 'COMPLETED'
  }
}

function StatusBadge({ status }: { status: DetailStatus }) {
  return (
    <span
      className={`inline-flex border px-2 py-1 text-xs font-medium ${statusBadgeClassName(status)}`}
    >
      {status}
    </span>
  )
}

function statusBadgeClassName(status: DetailStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'border-green-200 bg-green-50 text-green-800'
    case 'FAILED':
      return 'border-red-200 bg-red-50 text-red-800'
    case 'PROCESSING':
      return 'border-blue-200 bg-blue-50 text-blue-800'
    case 'RETRY_SCHEDULED':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'QUEUED':
      return 'border-stone-200 bg-stone-50 text-stone-700'
  }
}

function getSafeErrorCode(errorCode: string | null): string | null {
  switch (errorCode) {
    case 'PROCESSING_RETRY_EXHAUSTED':
      return 'Processing retry exhausted'
    case 'UNSUPPORTED_MIME_TYPE':
      return 'Unsupported MIME type'
    case 'CONTENT_EXTRACTION_FAILED':
      return 'Content extraction failed'
    case 'EMPTY_DOCUMENT_TEXT':
      return 'No extractable document text'
    case 'WORKER_LEASE_EXPIRED':
      return 'Processing worker lease expired'
    default:
      return null
  }
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
