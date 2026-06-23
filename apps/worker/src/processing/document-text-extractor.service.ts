import { Injectable } from '@nestjs/common'
import { DocumentStorage } from '@document-summarizer/storage'
import { PDFParse } from 'pdf-parse'
import {
  DOCUMENT_PROCESSING_ERROR_CODES,
  DocumentProcessingError,
} from './document-processing.error'

export type ExtractableDocument = {
  mimeType: string
  storageKey: string
}

@Injectable()
export class DocumentTextExtractorService {
  constructor(private readonly documentStorage: DocumentStorage) {}

  async extract(document: ExtractableDocument): Promise<string> {
    if (document.mimeType !== 'text/plain' && document.mimeType !== 'application/pdf') {
      throw new DocumentProcessingError(
        DOCUMENT_PROCESSING_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
        `Unsupported document MIME type: ${document.mimeType}`,
      )
    }

    const input = await this.readDocumentBuffer(document.storageKey)
    const text =
      document.mimeType === 'text/plain' ? input.toString('utf8') : await this.extractPdfText(input)
    const normalizedText = normalizeWhitespace(text)

    if (!normalizedText) {
      throw new DocumentProcessingError(
        DOCUMENT_PROCESSING_ERROR_CODES.EMPTY_DOCUMENT_TEXT,
        'Document does not contain extractable text',
      )
    }

    return normalizedText
  }

  private async readDocumentBuffer(storageKey: string): Promise<Buffer> {
    try {
      const stream = await this.documentStorage.openReadStream(storageKey)
      const chunks: Buffer[] = []

      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }

      return Buffer.concat(chunks)
    } catch (error) {
      throw new DocumentProcessingError(
        DOCUMENT_PROCESSING_ERROR_CODES.CONTENT_EXTRACTION_FAILED,
        'Unable to read document content',
        { cause: error },
      )
    }
  }

  private async extractPdfText(input: Buffer): Promise<string> {
    let parser: PDFParse | undefined
    let text = ''
    let extractionError: unknown

    try {
      parser = new PDFParse({ data: input })
      const result = await parser.getText()
      text = result.text
    } catch (error) {
      extractionError = error
    } finally {
      if (parser) {
        try {
          await parser.destroy()
        } catch (error) {
          extractionError ??= error
        }
      }
    }

    if (extractionError) {
      throw new DocumentProcessingError(
        DOCUMENT_PROCESSING_ERROR_CODES.CONTENT_EXTRACTION_FAILED,
        'Unable to extract text from PDF document',
        { cause: extractionError },
      )
    }

    return text
  }
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}
