import { Global, Module } from '@nestjs/common'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { WorkerConfigService } from './worker-config.service'

config({ path: resolve(__dirname, '../../../../.env') })

@Global()
@Module({
  providers: [WorkerConfigService],
  exports: [WorkerConfigService],
})
export class ConfigurationModule {}
