import { Module } from '@nestjs/common'
import { ProcessingModule } from '../processing/processing.module'
import { DocumentProcessingWorkerService } from './document-processing-worker.service'

@Module({
  imports: [ProcessingModule],
  providers: [DocumentProcessingWorkerService],
})
export class QueueModule {}
