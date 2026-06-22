import { Module } from '@nestjs/common'
import { ConfigurationModule } from './configuration/configuration.module'
import { DatabaseModule } from './database/database.module'
import { DocumentsModule } from './documents/documents.module'
import { HealthModule } from './health/health.module'
import { StorageModule } from './storage/storage.module'

@Module({
  imports: [ConfigurationModule, DatabaseModule, DocumentsModule, HealthModule, StorageModule],
})
export class AppModule {}
