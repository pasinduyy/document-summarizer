import { DocumentCategory } from '@document-summarizer/contracts'

export type DocumentAnalysisResult = {
  summary: string
  category: DocumentCategory
  confidence: number
  providerName: string
  modelVersion?: string
}

export abstract class DocumentAnalysisProvider {
  abstract analyze(text: string): Promise<DocumentAnalysisResult>
}
