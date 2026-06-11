import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Textarea } from '../../components/ui/Input'
import { PlusIcon, ClockIcon, MapPinIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const emptyForm = { time: '', title: '', description: '', location: '', duration_minutes: '30' }

export default function Timeline() {
  const { getCoupleAxios } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchEvents = async () => {
    const r = await getCoupleAxios().get('/api/timeline/portal')
    setEvents(r.data)
  }

  useEffect(() => { fetchEvents().finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getCoupleAxios()
      const data = { ...form, duration_minutes: parseInt(form.duration_minutes) || 30 }
      if (editEvent) { await api.put(`/api/timeline/${editEvent.id}`, data); toast.success('Updated!') }
      else { await api.post('/api/timeline/portal', data); toast.success('Event added!') }
      setShowAdd(false); setEditEvent(null); setForm(emptyForm); fetchEvents()
    } catch { toast.error('Failed to save') }
  }

  const openEdit = (ev) => {
    setEditEvent(ev)
    setForm({ time: ev.time, title: ev.title, description: ev.description || '', location: ev.location || '', duration_minutes: ev.duration_minutes || 30 })
    setShowAdd(true)
  }

  const deleteEvent = async (id) => {
    if (!confirm('Remove this event?')) return
    await getCoupleAxios().delete(`/api/timeline/${id}`); fetchEvents()
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Day-Of Timeline</h1>
          <p className="page-subtitle">{events.length} events scheduled</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(emptyForm); setEditEvent(null); setShowAdd(true) }}>
          <PlusIcon className="w-4 h-4" />
          Add Event
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : events.length === 0 ? (
        <div className="card py-16 text-center">
          <ClockIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">No timeline events yet</p>
          <p className="text-xs text-slate-300 mt-1">Add your day-of schedule to stay organized</p>
        </div>
      ) : (
        <div className="relative pl-24">
          {/* Vertical line */}
          <div className="absolute left-16 top-3 bottom-3 w-0.5 bg-rose-100" />

          <div className="space-y-3">
            {events.map(ev => (
              <div key={ev.id} className="flex gap-4 relative group">
                {/* Time label */}
                <div className="absolute -left-24 w-20 text-right pt-3.5">
                  <span className="text-sm font-semibold text-rose-600">{ev.time}</span>
                </div>

                {/* Dot */}
                <div className="absolute -left-1 w-3.5 h-3.5 bg-rose-500 rounded-full border-2 border-white shadow mt-3.5 z-10" />

                {/* Card */}
                <div className="flex-1 card p-4 ml-3 mb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800">{ev.title}</h3>
                      {ev.description && <p className="text-sm text-slate-500 mt-0.5">{ev.description}</p>}
                      <div className="flex items-center gap-4 mt-2">
                        {ev.location && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <MapPinIcon className="w-3.5 h-3.5" />{ev.location}
                          </span>
                        )}
                        {ev.duration_minutes && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <ClockIcon className="w-3.5 h-3.5" />{ev.duration_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(ev)} className="text-xs text-rose-600 hover:text-rose-700 font-medium">Edit</button>
                      <button onClick={() => deleteEvent(ev.id)} className="text-xs text-slate-400 hover:text-red-500">Del</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditEvent(null) }} title={editEvent ? 'Edit Event' : 'Add Timeline Event'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Time" value={form.time} onChange={f('time')} required placeholder="4:00 PM" />
            <Input label="Duration (minutes)" type="number" value={form.duration_minutes} onChange={f('duration_minutes')} placeholder="30" />
          </div>
          <Input label="Event Title" value={form.title} onChange={f('title')} required placeholder="e.g. Ceremony, First Dance..." />
          <Input label="Location" value={form.location} onChange={f('location')} placeholder="Where does this happen?" />
          <Textarea label="Description" value={form.description} onChange={f('description')} rows={2} placeholder="Additional notes..." />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => { setShowAdd(false); setEditEvent(null) }}>Cancel</button>
            <button type="submit" className="btn-primary">{editEvent ? 'Update' : 'Add'} Event</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
