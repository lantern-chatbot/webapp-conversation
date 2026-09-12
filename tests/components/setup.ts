import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no layout engine. Headless UI observes sizes while opening options;
// these tests exercise selection state, not geometry.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
Element.prototype.scrollIntoView = vi.fn()

afterEach(cleanup)
