import { getDocumentContentUrl } from './document-api'
import { SUPPORTED_UPLOAD_MIME_TYPES } from './file-validation'

type DocumentPreviewProps = {
  originalFilename: string
  mimeType: string
  contentUrl: string
}

export function DocumentPreview({ originalFilename, mimeType, contentUrl }: DocumentPreviewProps) {
  const fullContentUrl = getDocumentContentUrl(contentUrl)
  const canPreview = SUPPORTED_UPLOAD_MIME_TYPES.includes(
    mimeType as (typeof SUPPORTED_UPLOAD_MIME_TYPES)[number],
  )

  return (
    <section
      aria-labelledby="document-preview-heading"
      className="border border-stone-200 bg-white p-4 sm:p-5"
    >
      <h4 id="document-preview-heading" className="text-base font-semibold text-stone-900">
        Preview
      </h4>

      {canPreview ? (
        <iframe
          className="mt-4 h-[36rem] min-h-[32rem] w-full border border-stone-300 bg-white"
          src={fullContentUrl}
          title={originalFilename}
        />
      ) : (
        <p className="mt-4 min-h-24 border border-stone-200 p-4 text-sm text-stone-600">
          Preview is not available for this file type.
        </p>
      )}

      <a
        className="mt-4 inline-block text-sm font-medium text-stone-900 underline"
        href={fullContentUrl}
        rel="noreferrer"
        target="_blank"
      >
        Open original
      </a>
    </section>
  )
}
