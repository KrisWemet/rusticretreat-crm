import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import SignaturePad from '../components/SignaturePad'
import {
  HeartIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  LockClosedIcon,
  UserIcon,
  KeyIcon,
} from '@heroicons/react/24/outline'
import { format, parseISO } from 'date-fns'

export default function SignContract() {
  const { token } = useParams()
  const [contract, setContract] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expired, setExpired] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signatureData, setSignatureData] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    axios.get(`/api/contracts/sign/${token}`)
      .then(r => {
        setContract(r.data)
        // Pre-fill with who we expect, so partners cannot sign in each
        // other's slot by accident.
        if (r.data.expected_signer_name) setSignerName(r.data.expected_signer_name)
      })
      .catch(e => {
        setExpired(Boolean(e.response?.data?.expired))
        setError(e.response?.data?.error || 'Contract not found or link has expired.')
      })
      .finally(() => setLoading(false))
  }, [token])

  const handleSign = async (e) => {
    e.preventDefault()
    if (!signatureData) {
      alert('Please draw your signature before submitting.')
      return
    }
    if (!agreed) {
      alert('Please confirm you agree to the terms.')
      return
    }
    setSubmitting(true)
    try {
      const r = await axios.post(`/api/contracts/sign/${token}`, {
        signer_name: signerName,
        signature_data: signatureData,
        agreed: true,
      })
      setResult(r.data)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit signature. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-rose-200 border-t-rose-600" />
          <p className="text-slate-400 text-sm">Loading contract...</p>
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {expired ? 'Signing Link Expired' : 'Link Not Found'}
          </h2>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    )
  }

  // ── Already signed ─────────────────────────────────────────────────────────
  if (contract?.already_signed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center">
          <CheckCircleIcon className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Already Signed</h2>
          <p className="text-slate-500 mb-4">
            This contract was signed by <strong>{contract.signer_name}</strong> on{' '}
            {contract.signed_at ? format(parseISO(contract.signed_at), 'MMMM d, yyyy') : 'a previous date'}.
          </p>
          <a
            href={`/api/contracts/sign/${token}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm mb-4"
          >
            <DocumentTextIcon className="w-4 h-4" />
            View / download signed copy
          </a>
          <p className="text-sm text-slate-400">
            Questions? Contact Rustic Retreat directly.
          </p>
        </div>
      </div>
    )
  }

  // ── Signed successfully ────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircleIcon className="w-9 h-9 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {result.fully_signed === false ? 'Signature Recorded' : 'Contract Signed!'}
            </h2>
            <p className="text-slate-500 mb-6">
              {result.fully_signed === false
                ? <>Thank you. {result.next_signer_name
                    ? <>We've emailed <strong>{result.next_signer_name}</strong> their own link — the contract is complete once they sign.</>
                    : 'Your signature has been recorded.'}</>
                : <>Congratulations, <strong>{result.couple_name}</strong>! Your contract with Rustic Retreat has been signed and recorded.</>}
            </p>

            {/* Signing progress, so each partner can see where things stand. */}
            {result.signers?.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-left">
                {result.signers.map(s => (
                  <div key={s.role} className="flex items-center gap-2.5 py-1 text-sm">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      s.status === 'signed' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {s.status === 'signed' ? '✓' : ''}
                    </span>
                    <span className={s.status === 'signed' ? 'text-slate-700' : 'text-slate-400'}>
                      {s.name}
                      <span className="text-slate-400 text-xs ml-1.5">
                        {s.role === 'venue' ? '(Rustic Retreat)' : ''}
                      </span>
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      {s.status === 'signed' ? 'Signed' : 'Awaiting signature'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {result.portal_enabled && result.is_new_account && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 text-left mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <KeyIcon className="w-5 h-5 text-rose-600" />
                  <h3 className="font-semibold text-rose-900">Your Portal Access</h3>
                </div>
                <p className="text-sm text-rose-700 mb-3">
                  Your wedding planning portal has been set up! Use these credentials to log in and start planning:
                </p>
                <div className="bg-white rounded-lg border border-rose-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    <div>
                      <span className="text-xs text-slate-400 uppercase tracking-wide">Email</span>
                      <p className="text-sm font-mono font-medium text-slate-800">{result.portal_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <LockClosedIcon className="w-4 h-4 text-slate-400" />
                    <div>
                      <span className="text-xs text-slate-400 uppercase tracking-wide">Password</span>
                      <p className="text-sm font-mono font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                        {result.portal_password}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-rose-500 mt-3">
                  Save these credentials — your password is only shown once. You can change it after logging in.
                </p>
              </div>
            )}

            {result.portal_enabled && result.fully_signed !== false && !result.is_new_account && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-left">
                <p className="text-sm text-slate-600">
                  Your portal credentials remain the same. Log in with your existing email and password.
                </p>
              </div>
            )}

            {/* The portal and the executed copy only exist once every signature
                is in — offering them mid-chain would hand over a half-signed
                document and a login that has not been created yet. */}
            {result.fully_signed === false ? (
              <p className="text-sm text-slate-400">
                You'll receive the completed contract by email once everyone has signed.
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {result.portal_enabled && (
                  <Link
                    to="/portal/login"
                    className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                  >
                    <HeartIcon className="w-5 h-5" />
                    Go to Wedding Portal
                  </Link>
                )}
                <a
                  href={`/api/contracts/sign/${token}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  <DocumentTextIcon className="w-5 h-5" />
                  Download signed copy
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Signing form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center">
              <HeartIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Rustic Retreat</div>
              <div className="text-xs text-slate-400">Contract Signing</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LockClosedIcon className="w-4 h-4" />
            Secure signing
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Contract info */}
        <div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <DocumentTextIcon className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{contract?.title}</h1>
              <p className="text-slate-500 text-sm mt-1">
                For <strong>{contract?.partner1_name} & {contract?.partner2_name}</strong> · Rustic Retreat Wedding Venue
              </p>
            </div>
          </div>
        </div>

        {/* Contract body */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-2">
            <DocumentTextIcon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Contract Terms</span>
          </div>
          <div className="px-6 py-6 max-h-[520px] overflow-y-auto">
            <div
              className="prose prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap"
              style={{ fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.7' }}
            >
              {contract?.content}
            </div>
          </div>
        </div>

        {/* Signing form */}
        <form onSubmit={handleSign} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-700">Sign This Contract</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              By signing below you confirm you have read and agree to all terms above.
            </p>
          </div>

          <div className="px-6 py-6 space-y-6">
            {/* Full name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full Legal Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Enter your full name as it appears on official ID"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
            </div>

            {/* Signature pad */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Signature <span className="text-red-500">*</span>
              </label>
              <SignaturePad onChange={setSignatureData} />
            </div>

            {/* Agreement checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${agreed ? 'bg-rose-600 border-rose-600' : 'border-slate-300 group-hover:border-rose-400'}`}>
                  {agreed && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              {/* Rendered from the statement the server sends, so the sentence
                  shown here is the exact text recorded against the signature. */}
              <span className="text-sm text-slate-600 leading-relaxed">
                {contract?.consent_statement
                  ? contract.consent_statement.replace('[your name]', signerName || '[your name]')
                  : `I, ${signerName || '[your name]'}, have read and understood this contract in its entirety and agree to be legally bound by its terms and conditions.`}
              </span>
            </label>

            {/* Submit */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <LockClosedIcon className="w-3.5 h-3.5" />
                Signed with timestamp &amp; IP for legal validity
              </p>
              <button
                type="submit"
                disabled={submitting || !signatureData || !signerName.trim() || !agreed}
                className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-4 h-4" />
                    Sign &amp; Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
