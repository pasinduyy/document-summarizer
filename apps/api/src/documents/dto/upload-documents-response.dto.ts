import { DOCUMENT_STATUSES } from '@document-summarizer/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { UploadDocumentsResponse } from '../documents.types'

export class UploadedDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty()
  originalFilename!: string

  @ApiProperty({ enum: [DOCUMENT_STATUSES.QUEUED] })
  status!: typeof DOCUMENT_STATUSES.QUEUED
}

export class UploadDocumentsResponseDto implements UploadDocumentsResponse {
  @ApiProperty({ type: () => UploadedDocumentResponseDto, isArray: true })
  documents!: UploadedDocumentResponseDto[]
}
