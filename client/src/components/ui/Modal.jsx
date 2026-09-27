import { useEffect, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const dialog = useRef(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Escape closes, as with any dialog. onClose may still ask first (e.g. about
  // unsaved changes).
  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement
    const focusables = () => [...(dialog.current?.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]') || [])].filter(el => !el.disabled && el.getClientRects().length)
    focusables()[0]?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.()
      if (e.key === 'Tab') {
        const items = focusables(), first = items[0], last = items[items.length - 1]
        if (!items.length) { e.preventDefault(); dialog.current?.focus() }
        else if (e.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [isOpen])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
          className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} p-4 sm:p-6 z-10`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
