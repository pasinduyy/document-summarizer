-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'RETRY_SCHEDULED', 'COMPLETED', 'DEAD_LETTERED');

-- CreateEnum
CREATE TYPE "ProcessingAttemptStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingAttempt" (
    "id" UUID NOT NULL,
    "processingJobId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "ProcessingAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,

    CONSTRAINT "ProcessingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAnalysis" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "providerName" TEXT NOT NULL,
    "modelVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_documentId_key" ON "ProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_nextRetryAt_idx" ON "ProcessingJob"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingAttempt_processingJobId_attemptNumber_key" ON "ProcessingAttempt"("processingJobId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAnalysis_documentId_key" ON "DocumentAnalysis"("documentId");

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingAttempt" ADD CONSTRAINT "ProcessingAttempt_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAnalysis" ADD CONSTRAINT "DocumentAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
