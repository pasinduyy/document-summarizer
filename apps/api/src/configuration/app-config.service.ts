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
  readonly databaseUrl: string
  readonly storageRoot: string

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
    this.storageRoot = resolveStorageRoot()
  }
}
