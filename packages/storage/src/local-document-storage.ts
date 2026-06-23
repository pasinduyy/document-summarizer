import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, rename, unlink } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { DocumentStorage } from './document-storage'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export class LocalDocumentStorage extends DocumentStorage {
  private readonly temporaryDirectory: string
  private readonly storageRoot: string

  constructor(storageRoot: string) {
    if (!storageRoot.trim()) {
      throw new Error('Storage root must not be empty')
    }

    super()
    this.storageRoot = resolve(storageRoot)
    this.temporaryDirectory = this.resolveWithinStorageRoot('.tmp')
  }

  async store(input: Readable): Promise<{ storageKey: string }> {
    await mkdir(this.temporaryDirectory, { recursive: true })

    const storageKey = randomUUID()
    const temporaryPath = this.resolveWithinStorageRoot(`.tmp${sep}${randomUUID()}`)
    const finalPath = this.pathForStorageKey(storageKey)

    try {
      await pipeline(input, createWriteStream(temporaryPath, { flags: 'wx' }))
      await rename(temporaryPath, finalPath)

      return { storageKey }
    } catch (error) {
      await this.removeIfPresent(temporaryPath)
      throw error
    }
  }

  async openReadStream(storageKey: string): Promise<Readable> {
    const path = this.pathForStorageKey(storageKey)
    const file = await lstat(path)

    if (!file.isFile()) {
      throw new Error('Storage key does not reference a file')
    }

    return createReadStream(path)
  }

  async delete(storageKey: string): Promise<void> {
    await this.removeIfPresent(this.pathForStorageKey(storageKey))
  }

  private pathForStorageKey(storageKey: string): string {
    if (!UUID_V4_PATTERN.test(storageKey)) {
      throw new Error('Storage key must be a UUID v4')
    }

    return this.resolveWithinStorageRoot(storageKey)
  }

  private resolveWithinStorageRoot(path: string): string {
    const resolvedPath = resolve(this.storageRoot, path)
    const relativePath = relative(this.storageRoot, resolvedPath)

    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error('Storage path must remain within the storage root')
    }

    return resolvedPath
  }

  private async removeIfPresent(path: string): Promise<void> {
    try {
      await unlink(path)
    } catch (error: unknown) {
      if (this.isMissingFileError(error)) {
        return
      }

      throw error
    }
  }

  private isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
  }
}
