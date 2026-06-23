import { Module } from '@nestjs/common'
import { ConfigurationModule } from './configuration/configuration.module'
import { DatabaseModule } from './database/database.module'
import { QueueModule } from './queue/queue.module'
import { StorageModule } from './storage/storage.module'

@Module({
  imports: [ConfigurationModule, DatabaseModule, StorageModule, QueueModule],
})
export class AppModule {}
