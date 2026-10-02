import React, { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { PortalToFollowElem, PortalToFollowElemTrigger } from '@/app/components/base/portal-to-follow-elem'

it('preserves child and forwarded refs and handlers when cloning a React 19 anchor', async () => {
  const user = userEvent.setup()
  const childRef = createRef<HTMLButtonElement>()
  const triggerRef = createRef<HTMLElement>()
  const onClick = vi.fn()
  const { unmount } = render(
    <PortalToFollowElem open={false}>
      <PortalToFollowElemTrigger asChild ref={triggerRef}>
        <button ref={childRef} onClick={onClick}>Open</button>
      </PortalToFollowElemTrigger>
    </PortalToFollowElem>,
  )
  const button = screen.getByRole('button', { name: 'Open' })
  expect(childRef.current).toBe(button)
  expect(triggerRef.current).toBe(button)
  await user.click(button)
  expect(onClick).toHaveBeenCalledOnce()
  unmount()
  expect(childRef.current).toBeNull()
  expect(triggerRef.current).toBeNull()
})
