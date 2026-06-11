import { useRef, useState, useEffect, useCallback } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

export default function SignaturePad({ onChange, disabled }) {
  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const lastPoint = useRef(null)
  const [isEmpty, setIsEmpty] = useState(true)

  const getPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = useCallback((e) => {
    if (disabled) return
    e.preventDefault()
    isDrawing.current = true
    const canvas = canvasRef.current
    lastPoint.current = getPoint(e, canvas)
  }, [disabled])

  const draw = useCallback((e) => {
    if (!isDrawing.current || disabled) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPoint(e, canvas)

    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    lastPoint.current = point
    setIsEmpty(false)
  }, [disabled])

  const endDraw = useCallback(() => {
    if (!isDrawing.current) return
    isDrawing.current = false
    lastPoint.current = null
    // Notify parent with data URL
    if (onChange && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }, [onChange])

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    onChange && onChange(null)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    // Prevent page scroll while drawing on touch
    const prevent = (e) => { if (isDrawing.current) e.preventDefault() }
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => canvas.removeEventListener('touchmove', prevent)
  }, [])

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={700}
          height={180}
          className="w-full cursor-crosshair block"
          style={{ height: '180px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-slate-300 text-sm select-none">Sign here with your mouse or finger</p>
          </div>
        )}
        {/* Signature line */}
        <div className="absolute bottom-8 left-10 right-10 border-b border-slate-300 pointer-events-none" />
        <div className="absolute bottom-3 left-10 text-xs text-slate-300 pointer-events-none select-none">Signature</div>
      </div>
      {!isEmpty && !disabled && (
        <button type="button" onClick={clear} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowPathIcon className="w-3.5 h-3.5" />
          Clear signature
        </button>
      )}
    </div>
  )
}
