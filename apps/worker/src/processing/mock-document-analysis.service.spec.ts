import { DOCUMENT_CATEGORIES } from '@document-summarizer/contracts'
import { describe, expect, it } from '@jest/globals'
import { MockDocumentAnalysisProvider } from './mock-document-analysis.service'

describe('MockDocumentAnalysisProvider', () => {
  const provider = new MockDocumentAnalysisProvider()

  it('categorizes invoice-like content as an invoice', async () => {
    const result = await provider.analyze(
      'Invoice INV-100. Subtotal is 20.00 and payment due is tomorrow.',
    )

    expect(result.category).toBe(DOCUMENT_CATEGORIES.INVOICE)
    expect(result.summary).toBe('Invoice INV-100. Subtotal is 20.00 and payment due is tomorrow.')
  })

  it('categorizes contract-like content as a contract', async () => {
    const result = await provider.analyze(
      'This agreement is between the tenant and landlord. The terms and conditions apply.',
    )

    expect(result.category).toBe(DOCUMENT_CATEGORIES.CONTRACT)
  })

  it('uses OTHER when content has no meaningful category match', async () => {
    const result = await provider.analyze(
      'The blue bicycle rolled quietly through the park at sunrise.',
    )

    expect(result.category).toBe(DOCUMENT_CATEGORIES.OTHER)
  })

  it('keeps confidence normalized and identifies the mock provider', async () => {
    const results = await Promise.all([
      provider.analyze('Invoice amount due.'),
      provider.analyze('A plain note about a bicycle.'),
    ])

    for (const result of results) {
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
      expect(result.providerName).toBe('mock-rules')
      expect(result.modelVersion).toBe('v1')
    }
  })
})
