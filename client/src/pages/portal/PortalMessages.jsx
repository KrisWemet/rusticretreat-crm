import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PaperAirplaneIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
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
    const api = getCoupleAxios()
    const r = await api.get(`/api/messages/portal/${couple.id}`)
    setMessages(r.data)
  }

  useEffect(() => {
    fetchMessages().finally(() => setLoading(false))
  }, [couple])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return
    try {
      const api = getCoupleAxios()
      const r = await api.post(`/api/messages/portal/${couple.id}`, { content: newMessage })
      setMessages(prev => [...prev, r.data])
      setNewMessage('')
    } catch (err) {
      toast.error('Failed to send message')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-500 text-sm mt-1">Your conversation with Rustic Retreat</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col"
        style={{ height: '65vh' }}>
        {/* Header */}
        <div className="p-4 border-b border-gray-100 bg-rose-50/50 flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-100 rounded-full flex items-center justify-center">
            <span className="text-rose-600 font-bold text-sm">RR</span>
          </div>
          <div>
            <p className="font-medium text-gray-900">Rustic Retreat Team</p>
            <p className="text-xs text-gray-400">Your wedding coordinators</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ChatBubbleLeftRightIcon className="w-12 h-12 mb-3 text-gray-200" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs text-gray-300 mt-1">Start a conversation with your coordinators</p>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_type === 'couple' ? 'justify-end' : 'justify-start'}`}
              >
                <div className="max-w-sm lg:max-w-md">
                  <p className={`text-xs mb-1 ${msg.sender_type === 'couple' ? 'text-right text-gray-400' : 'text-rose-500 font-medium'}`}>
                    {msg.sender_type === 'staff' ? 'Rustic Retreat' : 'You'}
                  </p>
                  <div className={`rounded-2xl px-4 py-3 ${
                    msg.sender_type === 'couple'
                      ? 'bg-rose-500 text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                  <p className={`text-xs mt-1 text-gray-400 ${msg.sender_type === 'couple' ? 'text-right' : ''}`}>
                    {msg.created_at ? format(parseISO(msg.created_at), 'MMM d, h:mm a') : ''}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="p-4 border-t border-gray-100 flex gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Message your coordinators..."
            className="flex-1 px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-rose-50/30 placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white p-2.5 rounded-xl transition-colors"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
