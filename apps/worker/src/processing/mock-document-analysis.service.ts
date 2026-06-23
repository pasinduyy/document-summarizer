import { DOCUMENT_CATEGORIES, DocumentCategory } from '@document-summarizer/contracts'
import { Injectable } from '@nestjs/common'
import { DocumentAnalysisProvider, DocumentAnalysisResult } from './document-analysis-provider'
import { normalizeWhitespace } from './document-text-extractor.service'

const CATEGORY_KEYWORDS: ReadonlyArray<readonly [DocumentCategory, readonly string[]]> = [
  [DOCUMENT_CATEGORIES.INVOICE, ['invoice', 'amount due', 'subtotal', 'vat', 'payment due']],
  [
    DOCUMENT_CATEGORIES.CONTRACT,
    ['agreement', 'parties', 'terms and conditions', 'tenant', 'landlord'],
  ],
  [DOCUMENT_CATEGORIES.PRESCRIPTION, ['prescription', 'patient', 'dosage', 'pharmacy', 'doctor']],
  [DOCUMENT_CATEGORIES.REPORT, ['report', 'executive summary', 'findings', 'methodology']],
  [DOCUMENT_CATEGORIES.LETTER, ['dear', 'sincerely', 'regards']],
  [DOCUMENT_CATEGORIES.NEWS_ARTICLE, ['headline', 'reporter', 'published', 'breaking news']],
]

@Injectable()
export class MockDocumentAnalysisProvider extends DocumentAnalysisProvider {
  analyze(text: string): Promise<DocumentAnalysisResult> {
    const normalizedText = normalizeWhitespace(text)
    const categoryScore = this.findBestCategory(normalizedText.toLowerCase())

    return Promise.resolve({
      summary: this.createSummary(normalizedText),
      category: categoryScore.category,
      confidence: categoryScore.confidence,
      providerName: 'mock-rules',
      modelVersion: 'v1',
    })
  }

  private createSummary(text: string): string {
    const sentences = this.splitSentences(text)

    const summary = sentences && sentences.length >= 2 ? sentences.slice(0, 2).join(' ') : text
    return summary.slice(0, 500).trim()
  }

  private splitSentences(text: string): string[] {
    const sentences: string[] = []
    let startIndex = 0

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]
      const nextCharacter = text[index + 1]

      if (
        (character === '.' || character === '!' || character === '?') &&
        (nextCharacter === undefined || /\s/u.test(nextCharacter))
      ) {
        this.addMeaningfulSentence(sentences, text.slice(startIndex, index + 1))
        startIndex = index + 1
      }
    }

    this.addMeaningfulSentence(sentences, text.slice(startIndex))
    return sentences
  }

  private addMeaningfulSentence(sentences: string[], candidate: string): void {
    const sentence = candidate.trim()

    if (sentence && /[\p{L}\p{N}]/u.test(sentence)) {
      sentences.push(sentence)
    }
  }

  private findBestCategory(text: string): {
    category: DocumentCategory
    confidence: number
  } {
    let bestCategory: DocumentCategory = DOCUMENT_CATEGORIES.OTHER
    let bestScore = 0
    let bestKeywordCount = 0

    for (const [category, keywords] of CATEGORY_KEYWORDS) {
      const keywordScores = keywords.map((keyword) => this.countOccurrences(text, keyword))
      const score = keywordScores.reduce((total, keywordScore) => total + keywordScore, 0)
      const matchingKeywordCount = keywordScores.filter((keywordScore) => keywordScore > 0).length

      if (score > bestScore) {
        bestCategory = category
        bestScore = score
        bestKeywordCount = matchingKeywordCount
      }
    }

    if (bestScore === 0) {
      return { category: DOCUMENT_CATEGORIES.OTHER, confidence: 0.35 }
    }

    const repeatedMatchCount = bestScore - bestKeywordCount
    const confidence = Math.min(
      0.95,
      0.45 + bestKeywordCount * 0.15 + Math.min(0.1, repeatedMatchCount * 0.03),
    )

    return { category: bestCategory, confidence }
  }

  private countOccurrences(text: string, keyword: string): number {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapedKeyword}(?![\\p{L}\\p{N}])`, 'gu')
    return [...text.matchAll(pattern)].length
  }
}
