import {
  DOCUMENT_PROCESSING_LEASE_DURATION_MS,
  DOCUMENT_PROCESSING_QUEUE_NAME,
  PROCESS_DOCUMENT_JOB_NAME,
} from '@document-summarizer/contracts'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Worker } from 'bullmq'
import { WorkerConfigService } from '../configuration/worker-config.service'
import { DocumentProcessingService } from '../processing/document-processing.service'
import { DocumentProcessingWorkerService } from './document-processing-worker.service'

type MockWorkerConstructor = (
  queueName: string,
  processor: (job: { data: { processingJobId: string }; name: string }) => Promise<void>,
  options: unknown,
) => { close: () => Promise<void>; on: () => void }

jest.mock('bullmq', () => ({
  Worker: jest.fn(() => ({ close: jest.fn(), on: jest.fn() })),
}))

const mockWorker = Worker as unknown as jest.Mock<MockWorkerConstructor>

describe('DocumentProcessingWorkerService', () => {
  beforeEach(() => {
    mockWorker.mockClear()
  })

  it('uses the document processing lease duration as the BullMQ lock duration', () => {
    const worker = new DocumentProcessingWorkerService(
      { redisUrl: 'redis://localhost:6379' } as WorkerConfigService,
      { process: jest.fn() } as unknown as DocumentProcessingService,
    )

    worker.onModuleInit()

    expect(mockWorker).toHaveBeenCalledWith(
      DOCUMENT_PROCESSING_QUEUE_NAME,
      expect.any(Function),
      expect.objectContaining({
        concurrency: 1,
        lockDuration: DOCUMENT_PROCESSING_LEASE_DURATION_MS,
      }),
    )
  })

  it('forwards valid document processing jobs to the processing service', async () => {
    const documentProcessing = {
      process: jest.fn<(processingJobId: string) => Promise<void>>().mockResolvedValue(undefined),
    }
    const worker = new DocumentProcessingWorkerService(
      { redisUrl: 'redis://localhost:6379' } as WorkerConfigService,
      documentProcessing as unknown as DocumentProcessingService,
    )

    worker.onModuleInit()
    const processor = mockWorker.mock.calls[0]?.[1]

    if (!processor) {
      throw new Error('BullMQ worker processor was not configured')
    }

    await processor({
      data: { processingJobId: 'processing-job-1' },
      name: PROCESS_DOCUMENT_JOB_NAME,
    })

    expect(documentProcessing.process).toHaveBeenCalledWith('processing-job-1')
  })
})
