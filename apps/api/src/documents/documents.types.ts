import { DOCUMENT_STATUSES } from '@document-summarizer/contracts'

export type StagedUploadFile = {
  originalname: string
  mimetype: string
  size: number
  path: string
}

export type UploadedDocument = {
  id: string
  originalFilename: string
  status: typeof DOCUMENT_STATUSES.QUEUED
}

export type UploadDocumentsResponse = {
  documents: UploadedDocument[]
}
