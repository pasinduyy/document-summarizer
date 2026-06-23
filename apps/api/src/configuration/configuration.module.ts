import { Global, Module } from '@nestjs/common'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { AppConfigService } from './app-config.service'

config({ path: resolve(__dirname, '../../../../.env') })

@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigurationModule {}
