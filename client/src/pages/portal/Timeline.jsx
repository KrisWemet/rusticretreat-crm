import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Textarea } from '../../components/ui/Input'
import { PlusIcon, ClockIcon, MapPinIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function Timeline() {
  const { getCoupleAxios } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [form, setForm] = useState({
    time: '', title: '', description: '', location: '', duration_minutes: '30'
  })

  const fetchEvents = async () => {
    const api = getCoupleAxios()
    const r = await api.get('/api/timeline/portal')
    setEvents(r.data)
  }

  useEffect(() => { fetchEvents().finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getCoupleAxios()
      const data = { ...form, duration_minutes: parseInt(form.duration_minutes) || 30 }
      if (editEvent) {
        await api.put(`/api/timeline/${editEvent.id}`, data)
        toast.success('Event updated!')
      } else {
        await api.post('/api/timeline/portal', data)
        toast.success('Event added!')
      }
      setShowAdd(false)
      setEditEvent(null)
      resetForm()
      fetchEvents()
    } catch (err) {
      toast.error('Failed to save')
    }
  }

  const resetForm = () => setForm({ time: '', title: '', description: '', location: '', duration_minutes: '30' })

  const openEdit = (event) => {
    setEditEvent(event)
    setForm({
      time: event.time, title: event.title, description: event.description || '',
      location: event.location || '', duration_minutes: event.duration_minutes || 30
    })
    setShowAdd(true)
  }

  const deleteEvent = async (id) => {
    if (!confirm('Remove this event?')) return
    const api = getCoupleAxios()
    await api.delete(`/api/timeline/${id}`)
    fetchEvents()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Day-Of Timeline</h1>
          <p className="text-gray-500 text-sm mt-1">{events.length} events scheduled</p>
        </div>
        <Button onClick={() => { resetForm(); setEditEvent(null); setShowAdd(true) }}>
          <PlusIcon className="w-4 h-4" />
          Add Event
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500" />
        </div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <ClockIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No timeline events yet</p>
          <p className="text-xs text-gray-300 mt-1">Add your day-of schedule here</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-20 top-0 bottom-0 w-0.5 bg-rose-100" />

          <div className="space-y-4">
            {events.map((event, index) => (
              <div key={event.id} className="flex gap-6 relative">
                {/* Time */}
                <div className="w-16 flex-shrink-0 text-right">
                  <span className="text-sm font-semibold text-rose-700">{event.time}</span>
                </div>

                {/* Dot */}
                <div className="flex-shrink-0 w-4 h-4 bg-rose-500 rounded-full border-2 border-white shadow-sm mt-1 z-10" />

                {/* Content */}
                <div className="flex-1 bg-white rounded-xl border border-gray-100 p-4 shadow-sm -mt-1 mb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{event.title}</h3>
                      {event.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{event.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPinIcon className="w-3 h-3" /> {event.location}
                          </span>
                        )}
                        {event.duration_minutes && (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" /> {event.duration_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button onClick={() => openEdit(event)} className="text-xs text-rose-600 hover:text-rose-700">Edit</button>
                      <button onClick={() => deleteEvent(event.id)} className="text-xs text-gray-400 hover:text-red-500">Del</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditEvent(null) }}
        title={editEvent ? 'Edit Event' : 'Add Timeline Event'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Time" value={form.time} onChange={e => setForm(f => ({...f, time: e.target.value}))} required placeholder="4:00 PM" />
            <Input label="Duration (min)" type="number" value={form.duration_minutes} onChange={e => setForm(f => ({...f, duration_minutes: e.target.value}))} />
          </div>
          <Input label="Event Title" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} required />
          <Input label="Location" value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} placeholder="Where does this happen?" />
          <Textarea label="Description" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={2} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditEvent(null) }}>Cancel</Button>
            <Button type="submit">{editEvent ? 'Update' : 'Add'} Event</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
