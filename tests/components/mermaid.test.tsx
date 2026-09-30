import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import StreamdownMarkdown from '@/app/components/base/streamdown-markdown'

// jsdom has no layout engine. Mermaid measures text and nodes while laying out
// the diagram; fixed sizes are enough to check that it produces the SVG.
const svgPrototype = window.SVGElement.prototype as SVGElement & {
  getBBox?: () => DOMRect
  getComputedTextLength?: () => number
}
const originalGetBBox = svgPrototype.getBBox
const originalGetComputedTextLength = svgPrototype.getComputedTextLength

describe('回答の Markdown の Mermaid 図', () => {
  beforeEach(() => {
    svgPrototype.getBBox = () => ({ x: 0, y: 0, width: 40, height: 16 }) as DOMRect
    svgPrototype.getComputedTextLength = () => 40
  })

  afterEach(() => {
    svgPrototype.getBBox = originalGetBBox
    svgPrototype.getComputedTextLength = originalGetComputedTextLength
  })

  it('mermaid のコードブロックを図として描画する', async () => {
    // Given: Mermaid のフローチャートを含む回答
    const content = ['手順は次のとおりです。', '', '```mermaid', 'flowchart TD', '  A[受付] --> B[回答]', '```'].join('\n')

    // When: 画面に表示する
    render(<StreamdownMarkdown content={content} />)

    // Then: エラーではなく、ノードのラベルを含む SVG の図になる
    const chart = await screen.findByRole('img', { name: 'Mermaid chart' }, { timeout: 30_000 })
    const svg = chart.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.textContent).toContain('受付')
    expect(svg!.textContent).toContain('回答')
    expect(screen.queryByText(/Mermaid Error/)).toBeNull()
  }, 60_000)
})
