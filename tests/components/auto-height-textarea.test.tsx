import React, { createRef, StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AutoHeightTextarea from '@/app/components/base/auto-height-textarea'

describe('textarea focus', () => {
  it('supports callback refs and focuses at the current text end when requested', () => {
    const ref = vi.fn()
    const onChange = vi.fn()
    const { rerender, unmount } = render(<StrictMode><AutoHeightTextarea ref={ref} value='first' onChange={onChange} controlFocus={0} /></StrictMode>)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(ref).toHaveBeenLastCalledWith(textarea)
    rerender(<StrictMode><AutoHeightTextarea ref={ref} value='longer text' onChange={onChange} controlFocus={1} /></StrictMode>)
    expect(document.activeElement).toBe(textarea)
    expect(textarea.selectionStart).toBe('longer text'.length)
    expect(textarea.selectionEnd).toBe('longer text'.length)
    unmount()
    expect(ref).toHaveBeenLastCalledWith(null)
  })

  it('does not steal focus on value updates and handles enabling autofocus', () => {
    const ref = createRef<HTMLTextAreaElement>()
    const onChange = vi.fn()
    const view = (value: string, autoFocus: boolean) => <><button>Other</button><AutoHeightTextarea ref={ref} value={value} onChange={onChange} autoFocus={autoFocus} /></>
    const { rerender } = render(view('first', false))
    const button = screen.getByRole('button')
    button.focus()
    rerender(view('updated', false))
    expect(document.activeElement).toBe(button)
    rerender(view('updated', true))
    expect(document.activeElement).toBe(ref.current)
    fireEvent.change(ref.current!, { target: { value: 'typed' } })
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('can switch between local and forwarded refs without changing hook order', () => {
    const onChange = vi.fn()
    const ref = createRef<HTMLTextAreaElement>()
    const { rerender } = render(<AutoHeightTextarea value='text' onChange={onChange} />)
    rerender(<AutoHeightTextarea ref={ref} value='text' onChange={onChange} controlFocus={1} />)
    expect(ref.current).toBe(screen.getByRole('textbox'))
    expect(document.activeElement).toBe(ref.current)
  })
})
