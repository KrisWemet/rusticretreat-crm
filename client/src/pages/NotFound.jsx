import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-slate-200">404</p>
      <h1 className="text-lg font-semibold text-slate-800">This page doesn’t exist</h1>
      <p className="text-sm text-slate-500">The link may be old, or the address may have a typo.</p>
      <Link to="/dashboard" className="btn-primary mt-2">Go to the dashboard</Link>
    </div>
  )
}
