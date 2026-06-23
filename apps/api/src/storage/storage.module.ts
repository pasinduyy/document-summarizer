import { Module } from '@nestjs/common'
import { DocumentStorage, LocalDocumentStorage } from '@document-summarizer/storage'
import { AppConfigService } from '../configuration/app-config.service'

@Module({
  providers: [
    {
      provide: DocumentStorage,
      useFactory: (config: AppConfigService) => new LocalDocumentStorage(config.storageRoot),
      inject: [AppConfigService],
    },
  ],
  exports: [DocumentStorage],
})
export class StorageModule {}
