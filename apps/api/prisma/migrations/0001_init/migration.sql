-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('PDF', 'DOCX', 'XLSX', 'CSV', 'TXT', 'MD');

-- CreateEnum
CREATE TYPE "DocFormat" AS ENUM ('PDF', 'DOCX', 'XLSX');

-- CreateEnum
CREATE TYPE "DocOperation" AS ENUM ('REWRITE', 'ANONYMIZE', 'FROM_TEMPLATE', 'CONVERT', 'EXCEL_EDIT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "SourceFile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "businessId" TEXT,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" "FileKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "extractedText" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "businessId" TEXT,
    "operation" "DocOperation" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "instruction" TEXT,
    "targetFormats" "DocFormat"[] DEFAULT ARRAY[]::"DocFormat"[],
    "norm" TEXT,
    "templateId" TEXT,
    "content" JSONB,
    "workbook" JSONB,
    "error" TEXT,
    "editedByUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocArtifact" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "format" "DocFormat" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "businessId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "norm" TEXT,
    "spec" JSONB NOT NULL DEFAULT '{}',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "job" TEXT NOT NULL,
    "model" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_JobSources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_JobSources_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "SourceFile_ownerId_createdAt_idx" ON "SourceFile"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "DocJob_ownerId_createdAt_idx" ON "DocJob"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "DocJob_status_idx" ON "DocJob"("status");

-- CreateIndex
CREATE INDEX "DocArtifact_jobId_idx" ON "DocArtifact"("jobId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_ownerId_idx" ON "DocumentTemplate"("ownerId");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "_JobSources_B_index" ON "_JobSources"("B");

-- AddForeignKey
ALTER TABLE "DocArtifact" ADD CONSTRAINT "DocArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DocJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobSources" ADD CONSTRAINT "_JobSources_A_fkey" FOREIGN KEY ("A") REFERENCES "DocJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobSources" ADD CONSTRAINT "_JobSources_B_fkey" FOREIGN KEY ("B") REFERENCES "SourceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
