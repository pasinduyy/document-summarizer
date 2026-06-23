import { Readable } from 'node:stream'

export abstract class DocumentStorage {
  abstract store(input: Readable): Promise<{ storageKey: string }>

  abstract openReadStream(storageKey: string): Promise<Readable>

  abstract delete(storageKey: string): Promise<void>
}
