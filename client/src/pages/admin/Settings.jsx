import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'

// Your own password, and (for the admin) who can log in to the CRM.
export default function Settings() {
  const { getAdminAxios, user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  const [users, setUsers] = useState([])
  const [adding, setAdding] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'staff', password: '' })

  const loadUsers = () => getAdminAxios().get('/api/auth/users').then(r => setUsers(r.data))
    .catch(err => toast.error(err.response?.data?.error || 'Could not load staff logins'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isAdmin) loadUsers() }, [isAdmin])

  const changePassword = async (e) => {
    e.preventDefault()
    if (pw.new_password !== pw.confirm) return toast.error('The two new passwords do not match')
    try {
      await getAdminAxios().post('/api/auth/change-password', { current_password: pw.current_password, new_password: pw.new_password })
      toast.success('Password changed')
      setPw({ current_password: '', new_password: '', confirm: '' })
    } catch (err) { toast.error(err.response?.data?.error || 'Could not change the password') }
  }

  const addUser = async (e) => {
    e.preventDefault()
    try {
      await getAdminAxios().post('/api/auth/users', newUser)
      toast.success(`${newUser.name} can now log in`)
      setNewUser({ name: '', email: '', role: 'staff', password: '' }); setAdding(false); loadUsers()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add the login') }
  }

  const resetPassword = async (u) => {
    const password = prompt(`New password for ${u.name} (at least 10 characters):`)
    if (!password) return
    try {
      await getAdminAxios().patch(`/api/auth/users/${u.id}/password`, { password })
      toast.success(`Password reset for ${u.name}. Tell them the new one in person or by phone.`)
    } catch (err) { toast.error(err.response?.data?.error || 'Could not reset the password') }
  }

  const removeUser = async (u) => {
    if (!confirm(`Remove ${u.name}'s login? They will no longer be able to sign in.`)) return
    try {
      await getAdminAxios().delete(`/api/auth/users/${u.id}`)
      toast.success('Login removed'); loadUsers()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not remove the login') }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Signed in as {user?.name} ({user?.email})</p>
      </div>

      <form onSubmit={changePassword} className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-800">Change your password</h2>
        <div>
          <label htmlFor="pw-current" className="label">Current password</label>
          <input id="pw-current" type="password" autoComplete="current-password" required value={pw.current_password} onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} className="input-field" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pw-new" className="label">New password</label>
            <input id="pw-new" type="password" autoComplete="new-password" minLength={10} required value={pw.new_password} onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="label">New password again</label>
            <input id="pw-confirm" type="password" autoComplete="new-password" minLength={10} required value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} className="input-field" />
          </div>
        </div>
        <p className="text-xs text-slate-400">At least 10 characters.</p>
        <button type="submit" className="btn-primary">Change password</button>
      </form>

      {isAdmin && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800">Who can log in</h2>
            {!adding && <button onClick={() => setAdding(true)} className="btn-secondary text-sm">Add a login</button>}
          </div>
          {adding && (
            <form onSubmit={addUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-100 rounded-xl p-4 bg-slate-50/50">
              <input required placeholder="Name" aria-label="Name" value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} className="input-field" />
              <input required type="email" placeholder="Email" aria-label="Email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} className="input-field" />
              <input required type="password" minLength={10} placeholder="Password (10+ characters)" aria-label="Password" autoComplete="new-password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} className="input-field" />
              <select aria-label="Role" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} className="input-field">
                <option value="staff">Staff</option>
                <option value="admin">Admin (can also manage logins and backups)</option>
              </select>
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <button type="button" onClick={() => setAdding(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Add login</button>
              </div>
            </form>
          )}
          <ul className="divide-y divide-slate-50">
            {users.map(u => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <div className="flex-1 min-w-[12rem]">
                  <p className="font-medium text-slate-800">{u.name} {u.id === user?.id && <span className="text-xs text-slate-400">(you)</span>}</p>
                  <p className="text-xs text-slate-400">{u.email} · {u.role}{u.disabled ? ' · disabled' : ''}</p>
                </div>
                {u.id !== user?.id && (
                  <>
                    <button onClick={() => resetPassword(u)} className="text-xs text-slate-500 hover:text-slate-800">Reset password</button>
                    <button onClick={() => removeUser(u)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
