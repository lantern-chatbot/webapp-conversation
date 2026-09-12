import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractRichCards } from '../../app/components/chat/rich-content/catalog.ts'

describe('Dify rich card tokens', () => {
  it('preserves ordinary Markdown and handles empty answers', () => {
    assert.deepEqual(extractRichCards(''), { markdown: '', cards: [] })
    assert.deepEqual(extractRichCards('**こんにちは**\n\nご相談ください。'), {
      markdown: '**こんにちは**\n\nご相談ください。',
      cards: [],
    })
  })

  it('expands services in order and deduplicates explicit cards', () => {
    const { markdown, cards } = extractRichCards('サービス一覧\n[[LANTERN_CARD:services]]\n[[LANTERN_CARD:AI-CONSULTING]]\n[[LANTERN_CARD:contact]]')
    assert.equal(markdown, 'サービス一覧')
    assert.deepEqual(cards.map(card => card.id), [
      'branding',
      'design',
      'e-commerce',
      'marketing',
      'ai-consulting',
      'training-dx',
      'contact',
    ])
    assert.equal(cards.at(-1).href, 'https://lantern-inc.jp/contact')
  })

  it('discards unknown IDs, including inherited object properties', () => {
    const { markdown, cards } = extractRichCards('回答[[LANTERN_CARD:unknown]][[LANTERN_CARD:constructor]]')
    assert.equal(markdown, '回答')
    assert.deepEqual(cards, [])
  })

  for (const partial of ['[[LANTERN_CARD:', '[[LANTERN_CARD:ai-', '[[LANTERN_CARD:ai-consulting]']) {
    it(`hides the unfinished streamed token ${partial}`, () => {
      assert.deepEqual(extractRichCards(`回答\n${partial}`), { markdown: '回答', cards: [] })
    })
  }

  it('shows the card only after the streamed token completes', () => {
    const { markdown, cards } = extractRichCards('回答\n[[LANTERN_CARD:ai-consulting]]')
    assert.equal(markdown, '回答')
    assert.deepEqual(cards.map(card => card.id), ['ai-consulting'])
  })
})
