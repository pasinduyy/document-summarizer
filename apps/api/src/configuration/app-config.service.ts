import { Injectable } from '@nestjs/common'

@Injectable()
export class AppConfigService {
  readonly apiPort: number
  readonly databaseUrl: string

  constructor() {
    const apiPort = Number.parseInt(process.env.API_PORT ?? '3001', 10)

    if (Number.isNaN(apiPort)) {
      throw new Error('API_PORT must be a valid port number')
    }

    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
      throw new Error('DATABASE_URL must be set')
    }

    this.apiPort = apiPort
    this.databaseUrl = databaseUrl
  }
}
