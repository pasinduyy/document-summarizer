import { Injectable } from '@nestjs/common'
import { isAbsolute, resolve } from 'node:path'

const repositoryRoot = resolve(__dirname, '../../../../')

export function resolveStorageRoot(
  configuredStorageRoot = process.env.STORAGE_ROOT ?? 'data/uploads',
): string {
  return isAbsolute(configuredStorageRoot)
    ? configuredStorageRoot
    : resolve(repositoryRoot, configuredStorageRoot)
}

@Injectable()
export class AppConfigService {
  readonly apiPort: number
  readonly webOrigin: string
  readonly databaseUrl: string
  readonly redisUrl: string
  readonly storageRoot: string

  constructor() {
    const apiPort = Number.parseInt(process.env.API_PORT ?? '3001', 10)

    if (Number.isNaN(apiPort)) {
      throw new Error('API_PORT must be a valid port number')
    }

    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'

    try {
      const parsedWebOrigin = new URL(webOrigin)

      if (parsedWebOrigin.protocol !== 'http:' && parsedWebOrigin.protocol !== 'https:') {
        throw new Error('WEB_ORIGIN must use the http:// or https:// protocol')
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`WEB_ORIGIN must be a valid origin: ${error.message}`)
      }

      throw new Error('WEB_ORIGIN must be a valid origin')
    }

    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
      throw new Error('DATABASE_URL must be set')
    }

    const redisUrl = process.env.REDIS_URL

    if (!redisUrl) {
      throw new Error('REDIS_URL must be set')
    }

    this.apiPort = apiPort
    this.webOrigin = new URL(webOrigin).origin
    this.databaseUrl = databaseUrl
    this.redisUrl = redisUrl
    this.storageRoot = resolveStorageRoot()
  }
}
