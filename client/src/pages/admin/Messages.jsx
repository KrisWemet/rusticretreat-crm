import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PaperAirplaneIcon, ChatBubbleLeftRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

export default function Messages() {
  const { getAdminAxios, user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [selectedCouple, setSelectedCouple] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef(null)

  const fetchConversations = async () => {
    const api = getAdminAxios()
    const r = await api.get('/api/messages')
    setConversations(r.data)
  }

  useEffect(() => { fetchConversations().finally(() => setLoading(false)) }, [])

  const selectCouple = async (conv) => {
    setSelectedCouple(conv)
    const api = getAdminAxios()
    const r = await api.get(`/api/messages/${conv.couple_id}`)
    setMessages(r.data)
    fetchConversations()
  }

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedCouple) return
    try {
      const api = getAdminAxios()
      const r = await api.post(`/api/messages/${selectedCouple.couple_id}`, { content: newMessage })
      setMessages(prev => [...prev, r.data])
      setNewMessage('')
    } catch { toast.error('Failed to send') }
  }

  const filtered = conversations.filter(c =>
    !search || `${c.partner1_name} ${c.partner2_name}`.toLowerCase().includes(search.toLowerCase())
  )
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  return (
    <div className="p-6 flex flex-col max-w-7xl" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">
            {totalUnread > 0 ? `${totalUnread} unread message${totalUnread > 1 ? 's' : ''}` : 'All messages read'}
          </p>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="card overflow-hidden flex flex-1" style={{ minHeight: 0, height: 'calc(100vh - 160px)' }}>
        {/* Left: conversation list */}
        <div className="w-72 border-r border-slate-100 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                id="messages-search" name="messages-search" aria-label="Search couples" placeholder="Search couples..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field pl-9 py-1.5 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-5 w-5 border-2 border-rose-200 border-t-rose-600" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No conversations</div>
            ) : filtered.map(conv => (
              <button
                key={conv.couple_id}
                onClick={() => selectCouple(conv)}
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
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedCouple ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <ChatBubbleLeftRightIcon className="w-12 h-12 text-slate-200" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-500">Select a conversation</p>
                <p className="text-xs text-slate-400 mt-1">Choose a couple from the left to view messages</p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-rose-100 rounded-full flex items-center justify-center">
                    <span className="text-rose-600 text-sm font-semibold">
                      {selectedCouple.partner1_name?.charAt(0)}{selectedCouple.partner2_name?.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedCouple.partner1_name} & {selectedCouple.partner2_name}</p>
                    <p className="text-xs text-slate-400">{selectedCouple.email}</p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-sm">No messages yet. Start the conversation!</div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === 'staff' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-sm lg:max-w-lg">
                      <p className={`text-xs mb-1 text-slate-400 ${msg.sender_type === 'staff' ? 'text-right' : ''}`}>
                        {msg.sender_name}
                      </p>
                      <div className={`rounded-2xl px-4 py-2.5 ${
                        msg.sender_type === 'staff'
                          ? 'bg-rose-600 text-white rounded-tr-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                      }`}>
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </div>
                      <p className={`text-xs mt-1 text-slate-400 ${msg.sender_type === 'staff' ? 'text-right' : ''}`}>
                        {msg.created_at ? format(parseISO(msg.created_at), 'MMM d, h:mm a') : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={sendMessage} className="p-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder={`Message ${selectedCouple.partner1_name} & ${selectedCouple.partner2_name}...`}
                  className="flex-1 input-field"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white p-2.5 rounded-lg transition-colors flex-shrink-0"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
