import React, { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IToastProps } from '@/app/components/base/toast'
import Toast, { ToastProvider, useToastContext } from '@/app/components/base/toast'

function Notify({ notification }: { notification: IToastProps }) {
  const { notify } = useToastContext()
  return <button onClick={() => notify(notification)}>通知</button>
}

function Provider({ notification }: { notification: IToastProps }) {
  return <StrictMode><ToastProvider><Notify notification={notification} /></ToastProvider></StrictMode>
}

describe('notification lifetime', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('gives a replacement notification its full duration', () => {
    const { rerender } = render(<Provider notification={{ message: 'first', duration: 1000 }} />)
    fireEvent.click(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(600))
    rerender(<Provider notification={{ message: 'second', duration: 2000 }} />)
    fireEvent.click(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByText('first')).toBeNull()
    expect(screen.queryByText('second')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByText('second')).toBeNull()
  })

  it('restarts the timer when the same notification object is reused', () => {
    render(<Provider notification={{ message: 'same', duration: 1000 }} />)
    fireEvent.click(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(600))
    fireEvent.click(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(600))
    expect(screen.queryByText('same')).not.toBeNull()
    act(() => vi.advanceTimersByTime(400))
    expect(screen.queryByText('same')).toBeNull()
  })

  it('clears pending timers on unmount', () => {
    const { unmount } = render(<Provider notification={{ message: 'temporary' }} />)
    fireEvent.click(screen.getByRole('button'))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes standalone notifications after their requested duration', () => {
    act(() => Toast.notify({ message: 'standalone', duration: 1000 }))
    expect(screen.queryByText('standalone')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByText('standalone')).toBeNull()
  })
})
