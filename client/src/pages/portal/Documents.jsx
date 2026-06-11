import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  DocumentTextIcon,
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { format, parseISO } from 'date-fns'

const contractStatusStyle = {
  signed: 'bg-emerald-100 text-emerald-700',
  sent: 'bg-blue-100 text-blue-700',
  draft: 'bg-slate-100 text-slate-500',
}

export default function Documents() {
  const { getCoupleAxios } = useAuth()
  const [documents, setDocuments] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('contracts')

  useEffect(() => {
    const api = getCoupleAxios()
    Promise.all([
      api.get('/api/portal/documents').catch(() => ({ data: [] })),
      api.get('/api/portal/contracts').catch(() => ({ data: [] })),
    ]).then(([docsRes, contractsRes]) => {
      setDocuments(docsRes.data)
      setContracts(contractsRes.data)
    }).finally(() => setLoading(false))
  }, [])

  const getFileIcon = (fileType) => {
    if (!fileType) return '📄'
    if (fileType.includes('pdf')) return '📕'
    if (fileType.includes('image')) return '🖼️'
    if (fileType.includes('word') || fileType.includes('doc')) return '📘'
    if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv')) return '📊'
    return '📄'
  }

  const signedContracts = contracts.filter(c => c.status === 'signed')
  const pendingContracts = contracts.filter(c => c.status === 'sent')

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Documents & Contracts</h1>
          <p className="page-subtitle">
            {signedContracts.length} signed · {pendingContracts.length} awaiting your signature
          </p>
        </div>
      </div>

      {/* Pending signature alert */}
      {pendingContracts.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <PaperAirplaneIcon className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {pendingContracts.length} Contract{pendingContracts.length > 1 ? 's' : ''} Awaiting Your Signature
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your venue coordinator has sent you a contract to review and sign. Check your email for the signing link, or ask your coordinator to resend it.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {[
          { key: 'contracts', label: `Contracts (${contracts.length})` },
          { key: 'documents', label: `Files (${documents.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : tab === 'contracts' ? (
        <>
          {contracts.length === 0 ? (
            <div className="card py-16 text-center">
              <DocumentTextIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No contracts yet</p>
              <p className="text-xs text-slate-300 mt-1">Your venue coordinator will send contracts here for your review and signature.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contracts.map(c => (
                <div key={c.id} className="card p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${c.status === 'signed' ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                      {c.status === 'signed'
                        ? <CheckCircleSolid className="w-6 h-6 text-emerald-600" />
                        : <DocumentTextIcon className="w-6 h-6 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-800">{c.title}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Created {c.created_at ? format(parseISO(c.created_at), 'MMMM d, yyyy') : '—'}
                          </p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize flex-shrink-0 ${contractStatusStyle[c.status] || 'bg-slate-100 text-slate-500'}`}>
                          {c.status}
                        </span>
                      </div>

                      {c.status === 'signed' && (
                        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-4 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                            Signed by <strong>{c.signer_name}</strong>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ClockIcon className="w-4 h-4 text-slate-400" />
                            {c.signed_at ? format(parseISO(c.signed_at), 'MMM d, yyyy h:mm a') : '—'}
                          </div>
                        </div>
                      )}

                      {c.status === 'sent' && (
                        <div className="mt-3 pt-3 border-t border-slate-50">
                          <p className="text-xs text-blue-600 font-medium flex items-center gap-1.5">
                            <PaperAirplaneIcon className="w-3.5 h-3.5" />
                            Awaiting your signature — check your email for the signing link
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {documents.length === 0 ? (
            <div className="card py-16 text-center">
              <DocumentTextIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No files yet</p>
              <p className="text-xs text-slate-300 mt-1">Your venue will share floor plans, menus, and other documents here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {documents.map(doc => (
                <div key={doc.id} className="card p-5 group hover:border-rose-200 transition-all">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                      {getFileIcon(doc.file_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-800 truncate">{doc.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{doc.file_name}</p>
                      <p className="text-xs text-slate-400 mt-1">Shared by {doc.uploaded_by}</p>
                      <p className="text-xs text-slate-300 mt-0.5">{doc.created_at ? format(parseISO(doc.created_at), 'MMM d, yyyy') : ''}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end">
                    <button className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Help box */}
      <div className="card border-slate-100 bg-slate-50/50 p-4">
        <div className="flex items-start gap-3">
          <DocumentArrowDownIcon className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-700">Need a document or have questions?</p>
            <p className="text-sm text-slate-400 mt-0.5">
              Contact your venue coordinator via the <a href="/portal/messages" className="text-rose-600 hover:text-rose-700 font-medium">Messages</a> section.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
