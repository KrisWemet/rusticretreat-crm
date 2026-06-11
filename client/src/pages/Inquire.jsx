import { useState } from 'react'
import axios from 'axios'
import {
  HeartIcon,
  CheckCircleIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'

export default function Inquire() {
  const [form, setForm] = useState({
    partner1_name: '', partner2_name: '', email: '', phone: '',
    wedding_date: '', guest_count: '', heard_about: '', message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await axios.post('/api/inquire', {
        ...form,
        guest_count: form.guest_count ? Number(form.guest_count) : undefined,
      })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircleIcon className="w-9 h-9 text-rose-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Thank You!</h2>
          <p className="text-slate-500 mb-6">
            We've received your inquiry and can't wait to learn more about your special day. Our team will be in touch within 24 hours.
          </p>
          <div className="bg-rose-50 rounded-xl p-4 text-sm text-rose-700">
            In the meantime, feel free to browse our venue on social media or call us directly.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center">
            <HeartIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">Rustic Retreat</div>
            <div className="text-xs text-slate-400">Wedding Venue Inquiry</div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto">
            <HeartIcon className="w-6 h-6 text-rose-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Start Planning Your Dream Wedding</h1>
          <p className="text-slate-500 max-w-lg mx-auto">
            Fill out the form below and our team will reach out within 24 hours to discuss availability, packages, and how we can make your day unforgettable.
          </p>
        </div>

        {/* Features row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: CalendarDaysIcon, label: 'Exclusive Date Hold', desc: 'We reserve your date while you decide' },
            { icon: UserGroupIcon,    label: 'Up to 250 Guests',     desc: 'Multiple indoor & outdoor spaces' },
            { icon: ChatBubbleLeftRightIcon, label: 'Dedicated Coordinator', desc: 'Personal support from day one' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-100 p-4 text-center">
              <Icon className="w-5 h-5 text-rose-500 mx-auto mb-2" />
              <div className="text-xs font-semibold text-slate-700">{label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
            </div>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-800 mb-4">About You</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Partner 1 Name <span className="text-red-500">*</span></label>
                <input required value={form.partner1_name} onChange={f('partner1_name')} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent" placeholder="First & last name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Partner 2 Name <span className="text-red-500">*</span></label>
                <input required value={form.partner2_name} onChange={f('partner2_name')} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent" placeholder="First & last name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address <span className="text-red-500">*</span></label>
                <input required type="email" value={form.email} onChange={f('email')} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent" placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input type="tel" value={form.phone} onChange={f('phone')} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent" placeholder="(555) 000-0000" />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-800 mb-4">Your Wedding</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Wedding Date</label>
                <input type="date" value={form.wedding_date} onChange={f('wedding_date')} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Guest Count</label>
                <input type="number" min="1" value={form.guest_count} onChange={f('guest_count')} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent" placeholder="e.g. 120" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">How did you hear about us?</label>
            <select value={form.heard_about} onChange={f('heard_about')} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent">
              <option value="">Select...</option>
              <option>Google Search</option>
              <option>Instagram / Social Media</option>
              <option>Friend or Family Referral</option>
              <option>Wedding Website (The Knot, WeddingWire)</option>
              <option>Drove By / Saw the Venue</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tell us about your vision</label>
            <textarea
              value={form.message}
              onChange={f('message')}
              rows={4}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none"
              placeholder="Share any details about your dream wedding — style, theme, special requests, questions..."
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending...</>
            ) : (
              <><HeartIcon className="w-5 h-5" /> Send My Inquiry</>
            )}
          </button>

          <p className="text-xs text-center text-slate-400">
            By submitting this form you agree to be contacted by Rustic Retreat regarding your inquiry. We never share your information.
          </p>
        </form>
      </div>
    </div>
  )
}
