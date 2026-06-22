import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiPayloadTooLargeResponse,
  ApiTags,
} from '@nestjs/swagger'
import { MAX_UPLOAD_FILES } from './documents.constants'
import { documentUploadOptions } from './documents-upload.options'
import { DocumentsService } from './documents.service'
import { StagedUploadFile, UploadDocumentsResponse } from './documents.types'
import { UploadDocumentsResponseDto } from './dto/upload-documents-response.dto'

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FilesInterceptor('files', MAX_UPLOAD_FILES, documentUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @ApiAcceptedResponse({ type: UploadDocumentsResponseDto })
  @ApiBadRequestResponse({
    description:
      'No files, too many files, an unsupported MIME type, or an empty file was submitted.',
  })
  @ApiPayloadTooLargeResponse({ description: 'An uploaded file exceeds the 10 MB limit.' })
  async upload(
    @UploadedFiles() files: StagedUploadFile[] | undefined,
  ): Promise<UploadDocumentsResponse> {
    return this.documentsService.upload(files ?? [])
  }
}
