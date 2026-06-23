import { DocumentStorage } from '@document-summarizer/storage'
import { describe, expect, it, jest } from '@jest/globals'
import { Readable } from 'node:stream'
import { DocumentTextExtractorService } from './document-text-extractor.service'

describe('DocumentTextExtractorService', () => {
  it('reads and normalizes UTF-8 TXT content', async () => {
    const documentStorage = {
      openReadStream: jest
        .fn<(storageKey: string) => Promise<Readable>>()
        .mockResolvedValue(Readable.from(['  First\n', 'second\tthird  '])),
    }
    const service = new DocumentTextExtractorService(documentStorage as unknown as DocumentStorage)

    await expect(
      service.extract({ mimeType: 'text/plain', storageKey: 'storage-key-1' }),
    ).resolves.toBe('First second third')

    expect(documentStorage.openReadStream).toHaveBeenCalledWith('storage-key-1')
  })
})
