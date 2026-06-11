import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PaperAirplaneIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

export default function Messages() {
  const { getAdminAxios, user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [selectedCouple, setSelectedCouple] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  const fetchConversations = async () => {
    const api = getAdminAxios()
    const r = await api.get('/api/messages')
    setConversations(r.data)
  }

  useEffect(() => {
    fetchConversations().finally(() => setLoading(false))
  }, [])

  const selectCouple = async (couple) => {
    setSelectedCouple(couple)
    const api = getAdminAxios()
    const r = await api.get(`/api/messages/${couple.couple_id}`)
    setMessages(r.data)
    // Refresh conversations to update unread counts
    fetchConversations()
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedCouple) return
    try {
      const api = getAdminAxios()
      const r = await api.post(`/api/messages/${selectedCouple.couple_id}`, { content: newMessage })
      setMessages(prev => [...prev, r.data])
      setNewMessage('')
    } catch (err) {
      toast.error('Failed to send message')
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Messages</h1>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" style={{ height: '70vh' }}>
        <div className="flex h-full">
          {/* Conversation list */}
          <div className="w-72 border-r border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-700">Conversations</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-rose-600" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No conversations yet</div>
              ) : conversations.map(conv => (
                <button
                  key={conv.couple_id}
                  onClick={() => selectCouple(conv)}
                  className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    selectedCouple?.couple_id === conv.couple_id ? 'bg-rose-50 border-l-2 border-l-rose-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {conv.partner1_name} & {conv.partner2_name}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{conv.last_message}</p>
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="flex-shrink-0 bg-rose-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 flex flex-col">
            {!selectedCouple ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <ChatBubbleLeftRightIcon className="w-12 h-12 mb-3 text-gray-200" />
                <p className="text-sm">Select a conversation to view messages</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                  <p className="font-medium text-gray-900">
                    {selectedCouple.partner1_name} & {selectedCouple.partner2_name}
                  </p>
                  <p className="text-xs text-gray-400">{selectedCouple.email}</p>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_type === 'staff' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-xs lg:max-w-md ${msg.sender_type === 'staff' ? 'order-1' : 'order-2'}`}>
                        <p className={`text-xs mb-1 ${msg.sender_type === 'staff' ? 'text-right text-gray-400' : 'text-gray-500'}`}>
                          {msg.sender_name}
                        </p>
                        <div className={`rounded-2xl px-4 py-2.5 ${
                          msg.sender_type === 'staff'
                            ? 'bg-rose-600 text-white rounded-tr-sm'
                            : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                        }`}>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                        <p className={`text-xs mt-1 text-gray-400 ${msg.sender_type === 'staff' ? 'text-right' : ''}`}>
                          {msg.created_at ? format(parseISO(msg.created_at), 'MMM d, h:mm a') : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={sendMessage} className="p-4 border-t border-gray-100 flex gap-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white p-2.5 rounded-xl transition-colors"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
