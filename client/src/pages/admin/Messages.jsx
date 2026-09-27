import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PaperAirplaneIcon, ChatBubbleLeftRightIcon, MagnifyingGlassIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { MESSAGE_TEMPLATES, firstNames } from '../../utils/options'

const CHANNEL_LABEL = { email: 'Email', sms: 'SMS', portal: 'Portal' }

export default function Messages() {
  const { getAdminAxios } = useAuth()
  const [params, setParams] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selectedCouple, setSelectedCouple] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [config, setConfig] = useState({ portal_enabled: false, sms_enabled: false, email_enabled: true })
  // 'email' sends the whole message to both partners (replies come back to the
  // venue's inbox); 'sms' sends it to their phone; 'portal' only while the
  // couple portal is switched on.
  const [channel, setChannel] = useState('email')
  const messagesEndRef = useRef(null)

  const fetchConversations = async () => {
    const r = await getAdminAxios().get('/api/messages')
    setConversations(r.data)
    setLoadError(null)
  }

  useEffect(() => {
    getAdminAxios().get('/api/messages/config').then(r => setConfig(r.data)).catch(() => {})
    fetchConversations()
      .catch(err => setLoadError(err.response?.data?.error || 'Could not load conversations'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openThread = async (conv) => {
    setSelectedCouple(conv)
    const canTextNow = config.sms_enabled && (conv.phone || conv.partner2_phone) && !conv.sms_opted_out_at
    setChannel(canTextNow ? 'sms' : 'email')
    setSubject('')
    try {
      const r = await getAdminAxios().get(`/api/messages/${conv.couple_id}`)
      setMessages(r.data)
      fetchConversations().catch(() => {})
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not open this conversation')
    }
  }

  // /messages?couple=ID (from a client page) opens that couple's thread, even
  // if nothing has been sent to them yet.
  const coupleParam = params.get('couple')
  useEffect(() => {
    if (!coupleParam) return
    getAdminAxios().get(`/api/couples/${coupleParam}`)
      .then(r => openThread({ couple_id: r.data.id, ...r.data }))
      .catch(() => toast.error('Could not find that couple'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleParam])

  // New replies (texts, portal messages) show up without reloading the page.
  useEffect(() => {
    if (!selectedCouple) return
    const t = setInterval(() => {
      getAdminAxios().get(`/api/messages/${selectedCouple.couple_id}`).then(r => setMessages(r.data)).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCouple?.couple_id])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedCouple || sending) return
    setSending(true)
    try {
      const r = await getAdminAxios().post(`/api/messages/${selectedCouple.couple_id}`, {
        content: newMessage, channel, subject: channel === 'email' ? subject : undefined,
      })
      setMessages(prev => [...prev, r.data])
      setNewMessage(''); setSubject('')
      fetchConversations().catch(() => {})
      // A message can be saved to the thread and still never have left.
      // Saying so beats letting it sit there looking delivered.
      if (r.data.delivery && !r.data.delivery.delivered) {
        toast.error(`Saved, but the ${channel === 'sms' ? 'text' : 'email'} did not send: ${r.data.delivery.error}`, { duration: 8000 })
      } else if (channel === 'email') {
        toast.success('Email sent')
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const closeThread = () => {
    setSelectedCouple(null)
    if (coupleParam) setParams({})
  }

  const filtered = conversations.filter(c =>
    !search || `${c.partner1_name} ${c.partner2_name}`.toLowerCase().includes(search.toLowerCase())
  )
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)
  const hasPhone = !!(selectedCouple?.phone || selectedCouple?.partner2_phone)
  const hasEmail = !!(selectedCouple?.email || selectedCouple?.partner2_email)
  const optedOut = !!selectedCouple?.sms_opted_out_at
  const canText = config.sms_enabled && hasPhone && !optedOut
  const channelButton = (key, label, enabled, title) => (
    <button
      type="button"
      onClick={() => setChannel(key)}
      disabled={!enabled}
      title={title}
      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 ${
        channel === key ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="p-4 sm:p-6 flex flex-col max-w-7xl h-[calc(100vh-57px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">
            {totalUnread > 0 ? `${totalUnread} unread message${totalUnread > 1 ? 's' : ''}` : 'All messages read'}
            {' · '}To write to a couple for the first time, use “Email” on their client page.
          </p>
        </div>
      </div>

      {/* Two panes on wide screens; one at a time on a phone. */}
      <div className="card overflow-hidden flex flex-1 min-h-0">
        {/* Left: conversation list */}
        <div className={`${selectedCouple ? 'hidden md:flex' : 'flex'} w-full md:w-72 md:border-r border-slate-100 flex-col flex-shrink-0 min-h-0`}>
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                id="messages-search" name="messages-search" aria-label="Search conversations" placeholder="Search conversations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field pl-9 py-1.5 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-5 w-5 border-2 border-rose-200 border-t-rose-600" /></div>
            ) : loadError ? (
              <div className="text-center py-8 text-sm text-red-600 space-y-2">
                <p>{loadError}</p>
                <button onClick={() => fetchConversations().catch(err => setLoadError(err.response?.data?.error || 'Could not load conversations'))} className="btn-ghost text-xs">Try again</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No conversations yet</div>
            ) : filtered.map(conv => (
              <button
                key={conv.couple_id}
                onClick={() => openThread(conv)}
                className={`w-full text-left px-4 py-3.5 border-b border-slate-50 transition-colors hover:bg-slate-50 ${
                  selectedCouple?.couple_id === conv.couple_id ? 'bg-rose-50 border-l-2 border-l-rose-500 pl-3.5' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-rose-600 text-xs font-semibold">
                      {conv.partner1_name?.charAt(0)}{conv.partner2_name?.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800 truncate">
                        {conv.partner1_name} & {conv.partner2_name}
                      </span>
                      {conv.unread_count > 0 && (
                        <span className="bg-rose-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-1">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{conv.last_message || 'No messages yet'}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: message area */}
        <div className={`${selectedCouple ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 min-h-0`}>
          {!selectedCouple ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <ChatBubbleLeftRightIcon className="w-12 h-12 text-slate-200" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-500">Select a conversation</p>
                <p className="text-xs text-slate-400 mt-1">Choose a couple from the list to see their messages</p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={closeThread} aria-label="Back to conversations" className="md:hidden p-1 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100">
                    <ArrowLeftIcon className="w-5 h-5" />
                  </button>
                  <div className="w-9 h-9 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-rose-600 text-sm font-semibold">
                      {selectedCouple.partner1_name?.charAt(0)}{selectedCouple.partner2_name?.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{selectedCouple.partner1_name} & {selectedCouple.partner2_name}</p>
                    <p className="text-xs text-slate-400 truncate">{[selectedCouple.email, selectedCouple.partner2_email].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
                {messages.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-sm">No messages yet. Write the first one below.</div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === 'staff' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%] lg:max-w-lg">
                      <p className={`text-xs mb-1 text-slate-400 ${msg.sender_type === 'staff' ? 'text-right' : ''}`}>
                        {msg.sender_name}
                        {msg.channel && msg.channel !== 'portal' && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium align-middle">
                            {CHANNEL_LABEL[msg.channel] || msg.channel}
                          </span>
                        )}
                      </p>
                      <div className={`rounded-2xl px-4 py-2.5 ${
                        msg.sender_type === 'staff'
                          ? 'bg-rose-600 text-white rounded-tr-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                      }`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                      <p className={`text-xs mt-1 text-slate-400 ${msg.sender_type === 'staff' ? 'text-right' : ''}`}>
                        {msg.created_at ? format(parseISO(msg.created_at), 'MMM d, h:mm a') : ''}
                        {msg.sender_type === 'staff' && msg.delivery_status && (
                          <span className={msg.delivery_status === 'failed' ? 'ml-1.5 text-rose-500' : 'ml-1.5'}>
                            · {msg.delivery_status === 'failed' ? 'not sent' : 'sent'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form onSubmit={sendMessage} className="p-3 sm:p-4 border-t border-slate-100 flex-shrink-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {channelButton('email', 'Email', hasEmail, hasEmail ? 'Email the whole message to both partners' : 'No email address on file')}
                  {config.sms_enabled && channelButton('sms', 'Text', canText, canText ? 'Send to their phone' : optedOut ? 'They replied STOP' : 'No phone number on file')}
                  {config.portal_enabled && channelButton('portal', 'Portal message', true, 'Post in their wedding portal')}
                  <select
                    aria-label="Insert a quick reply"
                    value=""
                    onChange={e => {
                      const t = MESSAGE_TEMPLATES.find(m => m.label === e.target.value)
                      if (t) setNewMessage(t.text.replace('{names}', firstNames(selectedCouple)))
                    }}
                    className="ml-auto text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-600"
                  >
                    <option value="">Quick reply...</option>
                    {MESSAGE_TEMPLATES.map(m => <option key={m.label} value={m.label}>{m.label}</option>)}
                  </select>
                </div>
                {channel === 'email' && (
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Subject (optional)"
                    aria-label="Email subject"
                    className="input-field py-1.5 text-sm"
                  />
                )}
                <div className="flex gap-3 items-end">
                  <textarea
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage(e) }}
                    rows={channel === 'email' ? 4 : 2}
                    aria-label="Message"
                    placeholder={channel === 'sms'
                      ? `Text ${firstNames(selectedCouple)}...`
                      : channel === 'email' ? `Email ${firstNames(selectedCouple)} — replies come back to your inbox...`
                      : `Message ${firstNames(selectedCouple)}...`}
                    className="flex-1 input-field resize-y"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || sending || (channel === 'email' && !hasEmail)}
                    aria-label="Send"
                    className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white p-2.5 rounded-lg transition-colors flex-shrink-0"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
