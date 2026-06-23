import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  PROCESSING_ATTEMPT_STATUSES,
  PROCESSING_JOB_STATUSES,
  DocumentCategory,
  DocumentStatus,
  ProcessingAttemptStatus,
  ProcessingJobStatus,
} from '@document-summarizer/contracts'
import { ApiProperty } from '@nestjs/swagger'

export class ProcessingJobResponseDto {
  @ApiProperty({ enum: Object.values(PROCESSING_JOB_STATUSES) })
  status!: ProcessingJobStatus

  @ApiProperty({ minimum: 0 })
  attemptCount!: number

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nextRetryAt!: Date | null

  @ApiProperty({ nullable: true })
  lastErrorCode!: string | null
}

export class DocumentListAnalysisResponseDto {
  @ApiProperty({ enum: Object.values(DOCUMENT_CATEGORIES) })
  category!: DocumentCategory

  @ApiProperty({ minimum: 0, maximum: 1 })
  confidence!: number
}

export class DocumentListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty()
  originalFilename!: string

  @ApiProperty()
  mimeType!: string

  @ApiProperty({ enum: Object.values(DOCUMENT_STATUSES) })
  status!: DocumentStatus

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null

  @ApiProperty({ type: () => ProcessingJobResponseDto })
  processingJob!: ProcessingJobResponseDto

  @ApiProperty({ type: () => DocumentListAnalysisResponseDto, nullable: true })
  analysis!: DocumentListAnalysisResponseDto | null
}

export class ProcessingAttemptResponseDto {
  @ApiProperty({ minimum: 1 })
  attemptNumber!: number

  @ApiProperty({ enum: Object.values(PROCESSING_ATTEMPT_STATUSES) })
  status!: ProcessingAttemptStatus

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: Date

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null

  @ApiProperty({ nullable: true })
  errorCode!: string | null
}

export class DocumentDetailAnalysisResponseDto extends DocumentListAnalysisResponseDto {
  @ApiProperty()
  summary!: string

  @ApiProperty()
  providerName!: string

  @ApiProperty({ nullable: true })
  modelVersion!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date
}

export class DocumentDetailResponseDto extends DocumentListItemResponseDto {
  @ApiProperty({ type: () => ProcessingAttemptResponseDto, nullable: true })
  latestAttempt!: ProcessingAttemptResponseDto | null

  @ApiProperty({ type: () => DocumentDetailAnalysisResponseDto, nullable: true })
  declare analysis: DocumentDetailAnalysisResponseDto | null

  @ApiProperty({ example: '/documents/00000000-0000-0000-0000-000000000000/content' })
  contentUrl!: string
}
