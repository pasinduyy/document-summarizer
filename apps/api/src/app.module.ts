import { Module } from '@nestjs/common'
import { ConfigurationModule } from './configuration/configuration.module'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { StorageModule } from './storage/storage.module'

@Module({
  imports: [ConfigurationModule, DatabaseModule, HealthModule, StorageModule],
})
export class AppModule {}
