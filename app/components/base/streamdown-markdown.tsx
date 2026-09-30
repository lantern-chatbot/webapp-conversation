'use client'
import { Streamdown } from 'streamdown'
import 'katex/dist/katex.min.css'

interface StreamdownMarkdownProps {
  content: string
  className?: string
}

// Images load without a click, so an external image URL in model output could
// carry conversation text to another server. Only this app's own images are
// shown; links stay unrestricted because they open only when clicked.
const ownOrigin = () => (typeof window === 'undefined' ? undefined : window.location.origin)

export function StreamdownMarkdown({ content, className = '' }: StreamdownMarkdownProps) {
  const origin = ownOrigin()
  return (
    <div className={`streamdown-markdown ${className}`}>
      <Streamdown
        allowedLinkPrefixes={['*']}
        allowedImagePrefixes={origin ? [origin] : []}
        defaultOrigin={origin}
      >
        {content}
      </Streamdown>
    </div>
  )
}

export default StreamdownMarkdown
