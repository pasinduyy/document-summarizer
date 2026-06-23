import { Module } from '@nestjs/common'
import { DocumentStorage, LocalDocumentStorage } from '@document-summarizer/storage'
import { WorkerConfigService } from '../configuration/worker-config.service'

@Module({
  providers: [
    {
      provide: DocumentStorage,
      useFactory: (config: WorkerConfigService) => new LocalDocumentStorage(config.storageRoot),
      inject: [WorkerConfigService],
    },
  ],
  exports: [DocumentStorage],
})
export class StorageModule {}
