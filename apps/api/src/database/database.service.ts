import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common'
import { PrismaClient, PrismaPg } from '@document-summarizer/database'
import { AppConfigService } from '../configuration/app-config.service'

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl }),
    })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect()
  }
}
