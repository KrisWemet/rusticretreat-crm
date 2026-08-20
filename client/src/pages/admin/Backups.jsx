import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export default function Backups() {
  const { getAdminAxios } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const fetchData = async () => {
    try {
      const r = await getAdminAxios().get('/api/backup')
      setData(r.data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not load backups')
    }
  }

  useEffect(() => { fetchData().catch(() => {}).finally(() => setLoading(false)) }, [])

  const runBackup = async () => {
    setRunning(true)
    try {
      const r = await getAdminAxios().post('/api/backup')
      toast.success(`Backup created (${fmtSize(r.data.size)})`)
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Backup failed')
    } finally {
      setRunning(false)
    }
  }

  // Fetched as a blob through axios rather than a plain link, so the request
  // carries the auth header — these endpoints are admin-only.
  const download = async (name) => {
    try {
      const r = await getAdminAxios().get(`/api/backup/${name}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Download failed')
    }
  }

  const backups = data?.backups || []

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Backups</h1>
          <p className="page-subtitle">
            {backups.length} snapshot{backups.length === 1 ? '' : 's'}
            {data ? ` · every ${data.interval_hours}h · keeping ${data.keep}` : ''}
          </p>
        </div>
        <button className="btn-primary" onClick={runBackup} disabled={running}>
          <ArrowPathIcon className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Backing up…' : 'Back up now'}
        </button>
      </div>

      {/* The limitation that matters. Snapshots live beside the database on the
          same volume, so they cover mistakes but not losing the volume. */}
      <div className="card p-4 border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">Download a copy regularly</p>
            <p className="text-amber-800">
              These snapshots sit on the same disk as the live database. They protect you from a
              bad import, an accidental delete, or a corrupted write — but not from losing the
              disk itself. Download one now and then and keep it somewhere else.
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <ShieldCheckIcon className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p>No backups yet. The first one runs automatically a minute after startup.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Taken</th><th>Size</th><th>File</th><th></th></tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.name}>
                  <td className="text-slate-700">
                    {format(parseISO(b.created_at), 'MMM d, yyyy · h:mm a')}
                    {i === 0 && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        latest
                      </span>
                    )}
                  </td>
                  <td className="text-slate-600">{fmtSize(b.size)}</td>
                  <td className="text-xs text-slate-400 font-mono">{b.name}</td>
                  <td>
                    <button onClick={() => download(b.name)} className="btn-ghost py-1 px-2 text-xs text-rose-600">
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && (
        <p className="text-xs text-slate-400">
          Stored on the server at <code className="font-mono">{data.directory}</code>. To restore,
          download a snapshot and replace the database file, then restart the app.
        </p>
      )}
    </div>
  )
}
