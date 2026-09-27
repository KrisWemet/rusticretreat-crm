import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import EventOperations from "../../components/EventOperations";
import toast from "react-hot-toast";
export default function AssignedEvents() {
  const { getAdminAxios } = useAuth(),
    [events, setEvents] = useState([]),
    [active, setActive] = useState(null),
    [tasks, setTasks] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const api = getAdminAxios();
  async function load() {
    try {
      setEvents((await api.get("/api/operations/assigned")).data);
      setError("");
    } catch (e) {
      setError(e.response?.data?.error || "Could not load assigned events");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function open(c) {
    setActive(c);
    setTasks((await api.get(`/api/operations/${c.id}/assigned-tasks`)).data);
  }
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="page-title">Assigned events</h1>
      {error ? (
        <div>
          {error}
          <button className="btn-secondary" onClick={load}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <p>Loading assigned events…</p>
      ) : active ? (
        <>
          <button className="btn-secondary" onClick={() => setActive(null)}>
            Back to assigned events
          </button>
          <h2 className="font-semibold">
            {[active.partner1_name, active.partner2_name]
              .filter(Boolean)
              .join(" & ")}{" "}
            · {active.event_date}–{active.end_date}
          </h2>
          <EventOperations couple={active} api={api} operationsOnly />
          <div className="card p-4 space-y-2">
            <h3 className="font-semibold">Event tasks</h3>
            {tasks.map((t) => (
              <label key={t.id} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!t.completed}
                  onChange={async (e) => {
                    try {
                      await api.patch(
                        `/api/operations/${active.id}/assigned-tasks/${t.id}`,
                        { completed: e.target.checked },
                      );
                      await open(active);
                    } catch {
                      toast.error("Could not update task");
                    }
                  }}
                />
                {t.title} · {t.due_date}
              </label>
            ))}
          </div>
        </>
      ) : events.length ? (
        events.map((c) => (
          <button
            key={c.id}
            className="card p-4 text-left block w-full"
            onClick={() => open(c)}
          >
            {[c.partner1_name, c.partner2_name].filter(Boolean).join(" & ")} ·{" "}
            {c.event_date}–{c.end_date}
          </button>
        ))
      ) : (
        <p className="text-sm text-gray-500">
          No events are assigned to you yet. Ask the venue admin to assign an
          event.
        </p>
      )}
    </div>
  );
}
