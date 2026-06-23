import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { QueueModule } from '../queue/queue.module'
import { StorageModule } from '../storage/storage.module'
import { DocumentsController } from './documents.controller'
import { DocumentQueryService } from './document-query.service'
import { DocumentsService } from './documents.service'

@Module({
  imports: [DatabaseModule, QueueModule, StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentQueryService],
})
export class DocumentsModule {}
