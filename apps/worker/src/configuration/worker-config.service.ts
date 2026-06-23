import { Injectable } from '@nestjs/common'
import { isAbsolute, resolve } from 'node:path'

const repositoryRoot = resolve(__dirname, '../../../../')

function resolveStorageRoot(
  configuredStorageRoot = process.env.STORAGE_ROOT ?? 'data/uploads',
): string {
  return isAbsolute(configuredStorageRoot)
    ? configuredStorageRoot
    : resolve(repositoryRoot, configuredStorageRoot)
}

@Injectable()
export class WorkerConfigService {
  readonly databaseUrl: string
  readonly redisUrl: string
  readonly storageRoot: string

  constructor() {
    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
      throw new Error('DATABASE_URL must be set')
    }

    const redisUrl = process.env.REDIS_URL

    if (!redisUrl) {
      throw new Error('REDIS_URL must be set')
    }

    this.databaseUrl = databaseUrl
    this.redisUrl = redisUrl
    this.storageRoot = resolveStorageRoot()
  }
}
