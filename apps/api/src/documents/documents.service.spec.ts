import { DOCUMENT_STATUSES, PROCESSING_JOB_STATUSES } from '@document-summarizer/contracts'
import { DocumentStorage } from '@document-summarizer/storage'
import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { DatabaseService } from '../database/database.service'
import { DocumentProcessingQueueService } from '../queue/document-processing-queue.service'
import { MAX_UPLOAD_FILE_SIZE_BYTES } from './documents.constants'
import { DocumentsService } from './documents.service'
import { StagedUploadFile } from './documents.types'

describe('DocumentsService', () => {
  let database: {
    $transaction: ReturnType<typeof jest.fn>
  }
  let documentStorage: {
    store: ReturnType<typeof jest.fn>
    delete: ReturnType<typeof jest.fn>
  }
  let documentProcessingQueue: {
    tryPublish: jest.Mock<(processingJobId: string) => Promise<boolean>>
  }
  let service: DocumentsService
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'documents-service-'))
    database = {
      $transaction: jest.fn(),
    }
    documentStorage = {
      store: jest.fn(),
      delete: jest.fn(),
    }
    documentProcessingQueue = {
      tryPublish: jest.fn<(processingJobId: string) => Promise<boolean>>().mockResolvedValue(true),
    }
    service = new DocumentsService(
      database as unknown as DatabaseService,
      documentStorage as unknown as DocumentStorage,
      documentProcessingQueue as unknown as DocumentProcessingQueueService,
    )

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('stores two valid staged files and creates queued documents with pending jobs', async () => {
    const files = [
      await createStagedFile('first.txt', 'text/plain', 'first document'),
      await createStagedFile('second.pdf', 'application/pdf', 'second document'),
    ]
    const storageKeys = [
      'e680c4cb-1e68-4d64-865b-cbf48fa94f70',
      'b8cc9677-bbbf-43fb-a57d-652a79daa4e9',
    ]
    let nextDocumentId = 1
    const documentCreate = jest.fn(({ data }: { data: { originalFilename: string } }) => {
      const document = {
        id: `document-${nextDocumentId}`,
        originalFilename: data.originalFilename,
        processingJob: {
          id: `processing-job-${nextDocumentId}`,
        },
      }
      nextDocumentId += 1
      return Promise.resolve(document)
    })
    mockStorageKeys(storageKeys)
    database.$transaction.mockImplementation(
      (
        callback: (transaction: {
          document: { create: ReturnType<typeof jest.fn> }
        }) => Promise<unknown>,
      ) => callback({ document: { create: documentCreate } }),
    )

    await expect(service.upload(files)).resolves.toEqual({
      documents: [
        {
          id: 'document-1',
          originalFilename: 'first.txt',
          status: DOCUMENT_STATUSES.QUEUED,
        },
        {
          id: 'document-2',
          originalFilename: 'second.pdf',
          status: DOCUMENT_STATUSES.QUEUED,
        },
      ],
    })

    expect(documentStorage.store).toHaveBeenCalledTimes(2)
    expect(database.$transaction).toHaveBeenCalledTimes(1)
    expect(documentCreate).toHaveBeenCalledTimes(2)
    expect(documentCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          originalFilename: 'first.txt',
          mimeType: 'text/plain',
          sizeBytes: BigInt('first document'.length),
          storageKey: storageKeys[0],
          status: DOCUMENT_STATUSES.QUEUED,
          processingJob: {
            create: {
              status: PROCESSING_JOB_STATUSES.PENDING,
            },
          },
        }),
      }),
    )
    expect(documentCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          originalFilename: 'second.pdf',
          mimeType: 'application/pdf',
          storageKey: storageKeys[1],
          status: DOCUMENT_STATUSES.QUEUED,
          processingJob: {
            create: {
              status: PROCESSING_JOB_STATUSES.PENDING,
            },
          },
        }),
      }),
    )
    expect(documentProcessingQueue.tryPublish).toHaveBeenCalledTimes(2)
    expect(documentProcessingQueue.tryPublish).toHaveBeenNthCalledWith(1, 'processing-job-1')
    expect(documentProcessingQueue.tryPublish).toHaveBeenNthCalledWith(2, 'processing-job-2')
  })

  it('returns the accepted upload response when queue publishing returns false', async () => {
    const files = [await createStagedFile('first.txt', 'text/plain', 'first document')]
    mockStorageKeys(['storage-key'])
    documentProcessingQueue.tryPublish.mockResolvedValue(false)
    const documentCreate = jest
      .fn<() => Promise<{ id: string; originalFilename: string; processingJob: { id: string } }>>()
      .mockResolvedValue({
        id: 'document-1',
        originalFilename: 'first.txt',
        processingJob: { id: 'processing-job-1' },
      })
    database.$transaction.mockImplementation(
      (
        callback: (transaction: {
          document: { create: ReturnType<typeof jest.fn> }
        }) => Promise<unknown>,
      ) =>
        callback({
          document: {
            create: documentCreate,
          },
        }),
    )

    await expect(service.upload(files)).resolves.toEqual({
      documents: [
        {
          id: 'document-1',
          originalFilename: 'first.txt',
          status: DOCUMENT_STATUSES.QUEUED,
        },
      ],
    })

    expect(documentProcessingQueue.tryPublish).toHaveBeenCalledWith('processing-job-1')
  })

  it('rejects an empty upload batch before storage or database operations', async () => {
    await expect(service.upload([])).rejects.toBeInstanceOf(BadRequestException)

    expect(documentStorage.store).not.toHaveBeenCalled()
    expect(database.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an unsupported MIME type before storage or database operations', async () => {
    const file = await createStagedFile(
      'unsupported.docx',
      'application/vnd.openxmlformats',
      'content',
    )

    await expect(service.upload([file])).rejects.toBeInstanceOf(BadRequestException)

    expect(documentStorage.store).not.toHaveBeenCalled()
    expect(database.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an oversized file before storage or database operations', async () => {
    const file = await createStagedFile('oversized.txt', 'text/plain', 'content')
    file.size = MAX_UPLOAD_FILE_SIZE_BYTES + 1

    await expect(service.upload([file])).rejects.toBeInstanceOf(BadRequestException)

    expect(documentStorage.store).not.toHaveBeenCalled()
    expect(database.$transaction).not.toHaveBeenCalled()
  })

  it('deletes every stored file when the database transaction fails', async () => {
    const files = [
      await createStagedFile('first.txt', 'text/plain', 'first document'),
      await createStagedFile('second.txt', 'text/plain', 'second document'),
    ]
    const storageKeys = [
      'f7aab699-825d-424d-b8d4-8e06de211c52',
      'e92b80d4-d479-4eed-8d4c-6781de9e0c9c',
    ]
    mockStorageKeys(storageKeys)
    database.$transaction.mockRejectedValue(new Error('database unavailable'))

    await expect(service.upload(files)).rejects.toBeInstanceOf(InternalServerErrorException)

    expect(documentStorage.delete).toHaveBeenCalledTimes(2)
    expect(documentStorage.delete).toHaveBeenNthCalledWith(1, storageKeys[0])
    expect(documentStorage.delete).toHaveBeenNthCalledWith(2, storageKeys[1])
  })

  async function createStagedFile(
    originalname: string,
    mimetype: string,
    content: string,
  ): Promise<StagedUploadFile> {
    const path = join(temporaryDirectory, `${Date.now()}-${Math.random()}`)
    await writeFile(path, content)

    return {
      originalname,
      mimetype,
      size: Buffer.byteLength(content),
      path,
    }
  }

  function mockStorageKeys(storageKeys: string[]) {
    let nextStorageKey = 0

    documentStorage.store.mockImplementation(async (stream: Readable) => {
      stream.resume()
      await finished(stream)

      const storageKey = storageKeys[nextStorageKey]
      nextStorageKey += 1
      return { storageKey }
    })
  }
})
