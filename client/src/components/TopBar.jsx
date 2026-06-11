import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'

export default function TopBar({ title, subtitle, actions }) {
  return (
    <div className="h-14 bg-white border-b border-slate-100 flex items-center px-6 gap-4 flex-shrink-0">
      {/* Title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-slate-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400 leading-none mt-0.5">{subtitle}</p>}
      </div>

      {/* Actions slot */}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
