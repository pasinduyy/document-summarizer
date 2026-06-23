import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger'
import { MAX_UPLOAD_FILES } from './documents.constants'
import { DocumentQueryService } from './document-query.service'
import { documentUploadOptions } from './documents-upload.options'
import { DocumentsService } from './documents.service'
import {
  DocumentDetail,
  DocumentListItem,
  StagedUploadFile,
  UploadDocumentsResponse,
} from './documents.types'
import { DocumentDetailResponseDto, DocumentListItemResponseDto } from './dto/document-response.dto'
import { UploadDocumentsResponseDto } from './dto/upload-documents-response.dto'

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentQueryService: DocumentQueryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the 50 most recently created documents' })
  @ApiOkResponse({ type: DocumentListItemResponseDto, isArray: true })
  async list(): Promise<DocumentListItem[]> {
    return this.documentQueryService.list()
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Preview a stored document inline' })
  @ApiProduces('application/pdf', 'text/plain')
  @ApiOkResponse({
    description: 'The original stored document is streamed inline.',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
      'text/plain': {
        schema: {
          type: 'string',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'The document does not exist or its stored content is unavailable.',
  })
  async content(@Param('id') id: string): Promise<StreamableFile> {
    const content = await this.documentQueryService.getContent(id)

    return new StreamableFile(content.stream, {
      type: content.mimeType,
      disposition: inlineContentDisposition(content.originalFilename),
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one document result and processing state' })
  @ApiOkResponse({ type: DocumentDetailResponseDto })
  @ApiNotFoundResponse({ description: 'The document does not exist.' })
  async detail(@Param('id') id: string): Promise<DocumentDetail> {
    return this.documentQueryService.getDetail(id)
  }

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

function inlineContentDisposition(originalFilename: string): string {
  const fallbackFilename =
    originalFilename
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_')
      .trim() || 'document'
  const encodedFilename = encodeURIComponent(originalFilename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )

  return `inline; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
}
