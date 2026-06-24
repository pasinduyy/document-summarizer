import type { DocumentListItem, DocumentStatus, ProcessingJobStatus } from './document-types'

type DocumentListProps = {
  documents: DocumentListItem[]
  selectedDocumentId: string | null
  onSelectDocument: (documentId: string) => void
}

type DisplayStatus = DocumentStatus | ProcessingJobStatus

export function DocumentList({
  documents,
  selectedDocumentId,
  onSelectDocument,
}: DocumentListProps) {
  return (
    <ol className="divide-y divide-stone-200 border-y border-stone-200">
      {documents.map((document) => {
        const isSelected = document.id === selectedDocumentId

        return (
          <li key={document.id}>
            <button
              aria-pressed={isSelected}
              className={`w-full px-4 py-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stone-900 ${
                isSelected ? 'bg-stone-100' : 'bg-white hover:bg-stone-50'
              }`}
              onClick={() => onSelectDocument(document.id)}
              type="button"
            >
              <span className="block break-words text-base font-medium text-stone-900">
                {document.originalFilename}
              </span>

              <span className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <span className="block">
                  <span className="block text-stone-500">Document status</span>
                  <span className="mt-1 block">
                    <StatusBadge status={document.status} />
                  </span>
                </span>
                <span className="block">
                  <span className="block text-stone-500">Processing job</span>
                  <span className="mt-1 block">
                    <StatusBadge status={document.processingJob.status} />
                  </span>
                </span>
                {document.analysis ? (
                  <>
                    <span className="block">
                      <span className="block text-stone-500">Category</span>
                      <span className="mt-1 block font-medium text-stone-800">
                        {document.analysis.category}
                      </span>
                    </span>
                    <span className="block">
                      <span className="block text-stone-500">Confidence</span>
                      <span className="mt-1 block font-medium text-stone-800">
                        {formatConfidence(document.analysis.confidence)}
                      </span>
                    </span>
                  </>
                ) : null}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
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
