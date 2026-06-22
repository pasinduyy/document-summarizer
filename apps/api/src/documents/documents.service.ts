import { DOCUMENT_STATUSES, PROCESSING_JOB_STATUSES } from '@document-summarizer/contracts'
import { DocumentStorage } from '@document-summarizer/storage'
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { DatabaseService } from '../database/database.service'
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILES,
  SUPPORTED_UPLOAD_MIME_TYPES,
  SupportedUploadMimeType,
} from './documents.constants'
import { StagedUploadFile, UploadDocumentsResponse } from './documents.types'

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name)

  constructor(
    private readonly database: DatabaseService,
    private readonly documentStorage: DocumentStorage,
  ) {}

  async upload(files: readonly StagedUploadFile[]): Promise<UploadDocumentsResponse> {
    const storageKeys: string[] = []

    try {
      this.validateFiles(files)

      const storedFiles: Array<{ file: StagedUploadFile; storageKey: string }> = []

      for (const file of files) {
        const { storageKey } = await this.documentStorage.store(createReadStream(file.path))
        storageKeys.push(storageKey)
        storedFiles.push({ file, storageKey })
      }

      const documents = await this.database.$transaction(async (transaction) => {
        const createdDocuments = []

        for (const { file, storageKey } of storedFiles) {
          const document = await transaction.document.create({
            data: {
              originalFilename: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: BigInt(file.size),
              storageKey,
              status: DOCUMENT_STATUSES.QUEUED,
              processingJob: {
                create: {
                  status: PROCESSING_JOB_STATUSES.PENDING,
                },
              },
            },
            select: {
              id: true,
              originalFilename: true,
            },
          })

          createdDocuments.push({
            id: document.id,
            originalFilename: document.originalFilename,
            status: DOCUMENT_STATUSES.QUEUED,
          })
        }

        return createdDocuments
      })

      return { documents }
    } catch (error) {
      await this.cleanupStoredFiles(storageKeys)

      if (error instanceof BadRequestException) {
        throw error
      }

      this.logger.error(`Unable to persist uploaded documents: ${this.errorMessage(error)}`)
      throw new InternalServerErrorException('Unable to persist uploaded documents')
    } finally {
      await this.cleanupStagedFiles(files)
    }
  }

  private validateFiles(files: readonly StagedUploadFile[]): void {
    if (files.length === 0) {
      throw new BadRequestException('At least one file must be submitted under the files field')
    }

    if (files.length > MAX_UPLOAD_FILES) {
      throw new BadRequestException(
        `A maximum of ${MAX_UPLOAD_FILES} files may be uploaded at once`,
      )
    }

    for (const file of files) {
      if (!this.isSupportedMimeType(file.mimetype)) {
        throw new BadRequestException(
          `File "${file.originalname}" has an unsupported MIME type: ${file.mimetype}`,
        )
      }

      if (file.size === 0) {
        throw new BadRequestException(`File "${file.originalname}" must not be empty`)
      }

      if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        throw new BadRequestException(
          `File "${file.originalname}" exceeds the ${MAX_UPLOAD_FILE_SIZE_BYTES}-byte size limit`,
        )
      }
    }
  }

  private isSupportedMimeType(mimeType: string): mimeType is SupportedUploadMimeType {
    return SUPPORTED_UPLOAD_MIME_TYPES.includes(mimeType as SupportedUploadMimeType)
  }

  private async cleanupStoredFiles(storageKeys: readonly string[]): Promise<void> {
    await Promise.all(
      storageKeys.map(async (storageKey) => {
        try {
          await this.documentStorage.delete(storageKey)
        } catch (error) {
          this.logger.warn(
            `Failed to remove stored file ${storageKey} during upload cleanup: ${this.errorMessage(error)}`,
          )
        }
      }),
    )
  }

  private async cleanupStagedFiles(files: readonly StagedUploadFile[]): Promise<void> {
    await Promise.all(
      files.map(async (file) => {
        try {
          await unlink(file.path)
        } catch (error) {
          if (this.isMissingFileError(error)) {
            return
          }

          this.logger.warn(
            `Failed to remove staged file ${file.path} during upload cleanup: ${this.errorMessage(error)}`,
          )
        }
      }),
    )
  }

  private isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
