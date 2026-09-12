import { forwardRef, useCallback, useEffect, useRef } from 'react'
import cn from 'classnames'

interface IProps {
  placeholder?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  className?: string
  minHeight?: number
  maxHeight?: number
  autoFocus?: boolean
  controlFocus?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onKeyUp?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

const AutoHeightTextarea = forwardRef<HTMLTextAreaElement, IProps>(
  (
    { value, onChange, placeholder, className, minHeight = 36, maxHeight = 96, autoFocus, controlFocus, onKeyDown, onKeyUp }: IProps,
    outerRef,
  ) => {
    const ref = useRef<HTMLTextAreaElement | null>(null)
    const setRef = useCallback((element: HTMLTextAreaElement | null) => {
      ref.current = element
      if (typeof outerRef === 'function') { outerRef(element) }
      else if (outerRef) { outerRef.current = element }
    }, [outerRef])

    const focus = useCallback(() => {
      const element = ref.current
      if (element) {
        element.setSelectionRange(element.value.length, element.value.length)
        element.focus()
      }
    }, [])

    useEffect(() => {
      if (autoFocus) { focus() }
    }, [autoFocus, focus])
    useEffect(() => {
      if (controlFocus) { focus() }
    }, [controlFocus, focus])

    return (
      <div className='relative'>
        <div className={cn(className, 'invisible whitespace-pre-wrap break-all  overflow-y-auto')} style={{ minHeight, maxHeight }}>
          {!value ? placeholder : value.replace(/\n$/, '\n ')}
        </div>
        <textarea
          ref={setRef}
          autoFocus={autoFocus}
          className={cn(className, 'absolute inset-0 resize-none overflow-hidden')}
          placeholder={placeholder}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          value={value}
        />
      </div>
    )
  },
)

export default AutoHeightTextarea
