'use client'

import { type ChangeEvent, type FormEvent, useState } from 'react'
import { uploadDocuments } from './document-api'
import type { UploadDocumentsResponse } from './document-types'
import { SUPPORTED_UPLOAD_MIME_TYPES, validateSelectedFiles } from './file-validation'

type DocumentUploadPanelProps = {
  onUploadCompleted: (response: UploadDocumentsResponse) => void
}

export function DocumentUploadPanel({ onUploadCompleted }: DocumentUploadPanelProps) {
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
      onUploadCompleted(response)
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
      <p className="mt-2 text-sm text-stone-600">Select up to 10 files, up to 10 MB each.</p>

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
