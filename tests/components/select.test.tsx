import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Select, { SimpleSelect } from '@/app/components/base/select'

const items = [{ value: 1, name: 'Alpha' }, { value: 2, name: 'Beta' }]

describe.each([
  ['searchable', Select],
  ['simple', SimpleSelect],
] as const)('%s select', (_name, Component) => {
  const displayed = () => Component === Select
    ? (screen.getByRole('combobox') as HTMLInputElement).value
    : screen.getByRole('button').textContent

  it('reflects options that arrive after the default value', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<Component items={[]} defaultValue={2} onSelect={onSelect} />)
    rerender(<Component items={items} defaultValue={2} onSelect={onSelect} />)
    expect(displayed()).toBe('Beta')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('reflects changed labels, removed options and new defaults', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<Component items={items} defaultValue={1} onSelect={onSelect} />)
    const renamed = [{ value: 1, name: 'Updated' }, items[1]]
    rerender(<Component items={renamed} defaultValue={1} onSelect={onSelect} />)
    expect(displayed()).toBe('Updated')
    rerender(<Component items={[items[1]]} defaultValue={1} onSelect={onSelect} />)
    expect(displayed()).toBe('')
    rerender(<Component items={items} defaultValue={2} onSelect={onSelect} />)
    expect(displayed()).toBe('Beta')
  })

  it('preserves user selection when the parent recreates its options', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const { rerender } = render(<Component items={items} defaultValue={1} onSelect={onSelect} />)
    await user.click(screen.getByRole('button'))
    await user.click(await screen.findByRole('option', { name: 'Beta' }))
    expect(onSelect).toHaveBeenLastCalledWith(items[1])
    rerender(<Component items={items.map(item => ({ ...item }))} defaultValue={1} onSelect={onSelect} />)
    expect(displayed()).toBe('Beta')
  })
})
