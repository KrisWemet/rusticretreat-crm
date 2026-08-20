import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { KeyIcon, UserCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function Settings() {
  const { couple, getCoupleAxios } = useAuth()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [submitting, setSubmitting] = useState(false)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.new_password !== form.confirm_password) {
      toast.error('New passwords do not match')
      return
    }
    if (form.new_password.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      await getCoupleAxios().post('/api/portal/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      toast.success('Password updated!')
      setForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="page-title">Account Settings</h1>
        <p className="page-subtitle">Manage your portal account</p>
      </div>

      {/* Account info */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserCircleIcon className="w-5 h-5 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Account Details</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">Couple</div>
            <div className="font-medium text-slate-800">{couple?.partner1_name} & {couple?.partner2_name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">Login Email</div>
            <div className="font-medium text-slate-800">{couple?.email}</div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyIcon className="w-5 h-5 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Change Password</h2>
        </div>

        <div>
          <label htmlFor="settings-current-password-1" className="label">Current Password</label>
          <input id="settings-current-password-1" name="settings-current-password-1"
            type="password"
            required
            value={form.current_password}
            onChange={f('current_password')}
            className="input-field"
            autoComplete="current-password"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="settings-new-password-2" className="label">New Password</label>
            <input id="settings-new-password-2" name="settings-new-password-2"
              type="password"
              required
              minLength={8}
              value={form.new_password}
              onChange={f('new_password')}
              className="input-field"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="settings-confirm-new-password-3" className="label">Confirm New Password</label>
            <input id="settings-confirm-new-password-3" name="settings-confirm-new-password-3"
              type="password"
              required
              minLength={8}
              value={form.confirm_password}
              onChange={f('confirm_password')}
              className="input-field"
              autoComplete="new-password"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">Minimum 8 characters. Use a unique password you don't use elsewhere.</p>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Updating...' : <><CheckCircleIcon className="w-4 h-4" /> Update Password</>}
          </button>
        </div>
      </form>
    </div>
  )
}
