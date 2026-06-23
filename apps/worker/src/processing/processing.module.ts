import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { StorageModule } from '../storage/storage.module'
import { DocumentAnalysisProvider } from './document-analysis-provider'
import { DocumentProcessingService } from './document-processing.service'
import { DocumentTextExtractorService } from './document-text-extractor.service'
import { MockDocumentAnalysisProvider } from './mock-document-analysis.service'

@Module({
  imports: [DatabaseModule, StorageModule],
  providers: [
    DocumentProcessingService,
    DocumentTextExtractorService,
    MockDocumentAnalysisProvider,
    {
      provide: DocumentAnalysisProvider,
      useExisting: MockDocumentAnalysisProvider,
    },
  ],
  exports: [DocumentProcessingService],
})
export class ProcessingModule {}
