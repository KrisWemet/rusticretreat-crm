import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PaperAirplaneIcon, ChatBubbleLeftRightIcon, HeartIcon } from '@heroicons/react/24/outline'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

export default function PortalMessages() {
  const { getCoupleAxios, couple } = useAuth()
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  const fetchMessages = async () => {
    if (!couple) return
    const r = await getCoupleAxios().get(`/api/messages/portal/${couple.id}`)
    setMessages(r.data)
  }

  useEffect(() => { fetchMessages().finally(() => setLoading(false)) }, [couple])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return
    try {
      const r = await getCoupleAxios().post(`/api/messages/portal/${couple.id}`, { content: newMessage })
      setMessages(prev => [...prev, r.data])
      setNewMessage('')
    } catch { toast.error('Failed to send') }
  }

  return (
    <div className="p-6 flex flex-col max-w-4xl" style={{ height: 'calc(100vh - 0px)' }}>
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">Your conversation with Rustic Retreat</p>
        </div>
      </div>

      <div className="card overflow-hidden flex flex-col flex-1" style={{ minHeight: 0, height: 'calc(100vh - 160px)' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-rose-100 bg-rose-50/30 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 bg-rose-500 rounded-full flex items-center justify-center">
            <HeartIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Rustic Retreat Team</p>
            <p className="text-xs text-slate-400">Your wedding coordinators · We typically reply within a few hours</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
              <ChatBubbleLeftRightIcon className="w-12 h-12 text-slate-200" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-500">No messages yet</p>
                <p className="text-xs text-slate-400 mt-1">Start a conversation with your coordinators below!</p>
              </div>
            </div>
          ) : messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender_type === 'couple' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-sm lg:max-w-lg">
                <p className={`text-xs mb-1 ${msg.sender_type === 'couple' ? 'text-right text-slate-400' : 'text-rose-500 font-medium'}`}>
                  {msg.sender_type === 'staff' ? 'Rustic Retreat' : 'You'}
                </p>
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.sender_type === 'couple'
                    ? 'bg-rose-500 text-white rounded-tr-sm'
                    : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
                <p className={`text-xs mt-1 text-slate-400 ${msg.sender_type === 'couple' ? 'text-right' : ''}`}>
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
            placeholder="Message your coordinators..."
            className="flex-1 input-field"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white p-2.5 rounded-lg transition-colors flex-shrink-0"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
