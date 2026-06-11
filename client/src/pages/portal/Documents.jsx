import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { DocumentTextIcon, DocumentArrowDownIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { format, parseISO } from 'date-fns'

export default function Documents() {
  const { getCoupleAxios } = useAuth()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const api = getCoupleAxios()
    api.get('/api/portal/documents')
      .then(r => setDocuments(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const getFileIcon = (fileType) => {
    if (!fileType) return '📄'
    if (fileType.includes('pdf')) return '📕'
    if (fileType.includes('image')) return '🖼️'
    if (fileType.includes('word') || fileType.includes('doc')) return '📘'
    if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv')) return '📊'
    return '📄'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-500 text-sm mt-1">Files shared by your venue coordinators</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500" />
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center">
          <DocumentTextIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400">No documents yet</h3>
          <p className="text-sm text-gray-300 mt-2">
            Your venue coordinators will share documents here — contracts, floor plans, menus and more.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map(doc => (
            <div key={doc.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:border-rose-200 transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                  {getFileIcon(doc.file_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">{doc.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{doc.file_name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Shared by {doc.uploaded_by}
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5">
                    {doc.created_at ? format(parseISO(doc.created_at), 'MMM d, yyyy') : ''}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-50 flex justify-end">
                <button
                  className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => {}}
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-rose-50 rounded-xl border border-rose-100 p-5">
        <div className="flex items-start gap-3">
          <DocumentArrowDownIcon className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-rose-800">Need a document?</p>
            <p className="text-sm text-rose-600 mt-0.5">
              Contact your venue coordinator via the Messages section to request specific documents.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
