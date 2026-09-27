import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Modal from "../../components/ui/Modal";
import Input, { Textarea, Select } from "../../components/ui/Input";
import {
  MapIcon,
  CheckCircleIcon,
  XMarkIcon,
  CalendarDaysIcon,
  PhoneIcon,
  EnvelopeIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { format, parseISO } from "date-fns";

const statusStyle = {
  requested: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function fmtDateTime(v) {
  if (!v) return "—";
  try {
    return format(parseISO(v), "MMM d, yyyy · h:mm a");
  } catch {
    return v;
  }
}
function fmtDate(v) {
  if (!v) return null;
  try {
    return format(parseISO(v), "MMM d, yyyy");
  } catch {
    return v;
  }
}

export default function Tours() {
  const { getAdminAxios } = useAuth();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [couples, setCouples] = useState([]);
  const [addForm, setAddForm] = useState({
    couple_id: "",
    name: "",
    email: "",
    phone: "",
    scheduled_at: "",
    notes: "",
  });
  const [loadError, setLoadError] = useState(null);

  const fetchData = async () => {
    const r = await getAdminAxios().get("/api/tours");
    setTours(r.data);
  };
  useEffect(() => {
    fetchData()
      .then(() => setLoadError(null))
      .catch((err) =>
        setLoadError(err.response?.data?.error || "Could not load tours"),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [params, setParams] = useSearchParams();
  // From the calendar: /tours?new=2026-10-03 opens "Add tour" on that day.
  useEffect(() => {
    const day = params.get("new");
    if (day === "1" && params.get("couple")) openAdd("", params.get("couple"));
    else if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) openAdd(`${day}T10:00`);
    else return;
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = async (scheduledAt = "", coupleId = "") => {
    setAddForm({
      couple_id: "",
      name: "",
      email: "",
      phone: "",
      scheduled_at: typeof scheduledAt === "string" ? scheduledAt : "",
      notes: "",
    });
    setAdding(true);
    try {
      const rows = couples.length
        ? couples
        : (await getAdminAxios().get("/api/couples")).data;
      setCouples(rows);
      const c = rows.find((c) => String(c.id) === String(coupleId));
      if (c)
        setAddForm((p) => ({
          ...p,
          couple_id: String(c.id),
          name: [c.partner1_name, c.partner2_name].filter(Boolean).join(" & "),
          email: c.email || "",
          phone: c.phone || "",
        }));
    } catch {
      toast.error("Could not load couples. Try opening the tour form again.");
    }
  };
  const pickCouple = (id) => {
    const c = couples.find((x) => String(x.id) === id);
    setAddForm((p) => ({
      ...p,
      couple_id: id,
      ...(c
        ? {
            name: [c.partner1_name, c.partner2_name]
              .filter(Boolean)
              .join(" & "),
            email: c.email || "",
            phone: c.phone || "",
          }
        : {}),
    }));
  };
  const saveAdd = async (e) => {
    e.preventDefault();
    try {
      await getAdminAxios().post("/api/tours", {
        ...addForm,
        couple_id: addForm.couple_id || null,
        scheduled_at: addForm.scheduled_at || null,
        status: addForm.scheduled_at ? "scheduled" : "requested",
      });
      toast.success(
        addForm.scheduled_at
          ? "Tour added to the calendar"
          : "Tour request added",
      );
      setAdding(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not add the tour");
    }
  };

  const update = async (id, body, msg) => {
    try {
      await getAdminAxios().put(`/api/tours/${id}`, body);
      if (msg) toast.success(msg);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update");
    }
  };

  const openSchedule = (t) => {
    setScheduling(t);
    // Pre-fill with preferred date at 10:00 AM if available
    setScheduledAt(
      t.scheduled_at
        ? t.scheduled_at.slice(0, 16)
        : t.preferred_date
          ? `${t.preferred_date}T10:00`
          : "",
    );
    setNotes(t.notes || "");
    setNotify(!!t.email);
  };

  const saveSchedule = async (e) => {
    e.preventDefault();
    if (!scheduledAt) {
      toast.error("Pick a date and time");
      return;
    }
    try {
      const { data } = await getAdminAxios().put(
        `/api/tours/${scheduling.id}`,
        { scheduled_at: scheduledAt, status: "scheduled", notes, notify },
      );
      if (notify && data.confirmation_sent === false)
        toast.error(
          `Tour scheduled, but the confirmation did not send: ${data.confirmation_error}`,
          { duration: 7000 },
        );
      else
        toast.success(
          notify ? "Tour scheduled and confirmation emailed" : "Tour scheduled",
        );
      setScheduling(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to schedule");
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this tour request?")) return;
    try {
      await getAdminAxios().delete(`/api/tours/${id}`);
      toast.success("Deleted");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not delete");
    }
  };

  const counts = {
    requested: tours.filter((t) => t.status === "requested").length,
    scheduled: tours.filter((t) => t.status === "scheduled").length,
    completed: tours.filter((t) => t.status === "completed").length,
  };

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Site Tours</h1>
          <p className="page-subtitle">
            {counts.requested} awaiting scheduling · {counts.scheduled} upcoming
            · {counts.completed} completed
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <PlusIcon className="w-4 h-4" /> Add tour
        </button>
      </div>

      {/* Counts double as filters: click one to see just those tours. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          {
            key: "requested",
            label: "Tour Requests",
            value: counts.requested,
            color: "text-amber-700",
          },
          {
            key: "scheduled",
            label: "Scheduled",
            value: counts.scheduled,
            color: "text-blue-700",
          },
          {
            key: "completed",
            label: "Completed",
            value: counts.completed,
            color: "text-emerald-700",
          },
        ].map(({ key, label, value, color }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
            aria-pressed={statusFilter === key}
            className={`card p-3 sm:p-4 text-center transition-shadow hover:shadow-md ${statusFilter === key ? "ring-2 ring-rose-400" : ""}`}
          >
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{label}</div>
          </button>
        ))}
      </div>
      {statusFilter && (
        <p className="text-xs text-slate-500">
          Showing {statusFilter} tours only.{" "}
          <button
            onClick={() => setStatusFilter("")}
            className="text-rose-600 hover:underline"
          >
            Show all
          </button>
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" />
        </div>
      ) : loadError ? (
        <div className="card py-10 text-center text-sm text-red-600">
          {loadError}
        </div>
      ) : tours.length === 0 ? (
        <div className="card py-16 text-center">
          <MapIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No tour requests yet</p>
          <p className="text-xs text-slate-300 mt-1">
            Tour requests from the website inquiry form will appear here.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Contact</th>
                <th>Preferred</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tours
                .filter((t) => !statusFilter || t.status === statusFilter)
                .map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.couple_id ? (
                        <Link
                          to={`/clients/${t.couple_id}`}
                          className="font-medium text-rose-600 hover:text-rose-700"
                        >
                          {t.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-800">
                          {t.name}
                        </span>
                      )}
                      {t.notes && (
                        <div
                          className="text-xs text-slate-400 mt-0.5 max-w-xs truncate"
                          title={t.notes}
                        >
                          {t.notes}
                        </div>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">
                      {t.email && (
                        <div className="flex items-center gap-1">
                          <EnvelopeIcon className="w-3 h-3" />
                          {t.email}
                        </div>
                      )}
                      {t.phone && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <PhoneIcon className="w-3 h-3" />
                          {t.phone}
                        </div>
                      )}
                    </td>
                    <td className="text-slate-500 text-xs">
                      {fmtDate(t.preferred_date) || (
                        <span className="text-slate-300">Flexible</span>
                      )}
                    </td>
                    <td className="text-slate-600 text-xs">
                      {t.scheduled_at ? (
                        fmtDateTime(t.scheduled_at)
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusStyle[t.status]}`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 justify-end">
                        {t.status !== "completed" &&
                          t.status !== "cancelled" && (
                            <button
                              onClick={() => openSchedule(t)}
                              className="btn-ghost py-1 px-2 text-xs text-blue-600 hover:bg-blue-50"
                              title="Schedule tour"
                            >
                              <CalendarDaysIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        {t.status === "scheduled" && (
                          <button
                            onClick={() =>
                              update(
                                t.id,
                                { status: "completed" },
                                "Marked completed",
                              )
                            }
                            className="btn-ghost py-1 px-2 text-xs text-emerald-600 hover:bg-emerald-50"
                            title="Mark completed"
                          >
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {t.status !== "cancelled" &&
                          t.status !== "completed" && (
                            <button
                              onClick={() =>
                                update(
                                  t.id,
                                  { status: "cancelled" },
                                  "Cancelled",
                                )
                              }
                              className="btn-ghost py-1 px-2 text-xs text-slate-400 hover:bg-slate-100"
                              title="Cancel"
                            >
                              <XMarkIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        <button
                          onClick={() => remove(t.id)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!scheduling}
        onClose={() => setScheduling(null)}
        title="Schedule Site Tour"
      >
        {scheduling && (
          <form onSubmit={saveSchedule} className="space-y-4">
            <p className="text-sm text-slate-500">
              Booking a tour for{" "}
              <strong className="text-slate-800">{scheduling.name}</strong>. It
              will appear on the venue calendar.
            </p>
            <Input
              label="Tour Date & Time"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
            <Textarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to prep for this tour..."
            />
            <label
              className={`flex items-center gap-2 text-sm ${scheduling.email ? "text-slate-700" : "text-slate-400"}`}
            >
              <input
                type="checkbox"
                checked={notify && !!scheduling.email}
                disabled={!scheduling.email}
                onChange={(e) => setNotify(e.target.checked)}
              />
              {scheduling.email
                ? `Email ${scheduling.email} a confirmation`
                : "No email address, so no confirmation can be sent"}
            </label>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setScheduling(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Schedule Tour
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        isOpen={adding}
        onClose={() => setAdding(false)}
        title="Add a site tour"
      >
        <form onSubmit={saveAdd} className="space-y-4">
          <Select
            label="Couple (optional)"
            value={addForm.couple_id}
            onChange={(e) => pickCouple(e.target.value)}
          >
            <option value="">Someone not in the CRM yet</option>
            {couples.map((c) => (
              <option key={c.id} value={c.id}>
                {c.partner1_name} & {c.partner2_name}
              </option>
            ))}
          </Select>
          <Input
            label="Visitor name"
            value={addForm.name}
            onChange={(e) =>
              setAddForm((p) => ({ ...p, name: e.target.value }))
            }
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={addForm.email}
              onChange={(e) =>
                setAddForm((p) => ({ ...p, email: e.target.value }))
              }
            />
            <Input
              label="Phone"
              value={addForm.phone}
              onChange={(e) =>
                setAddForm((p) => ({ ...p, phone: e.target.value }))
              }
            />
          </div>
          <Input
            label="Date & time (leave empty for a request to schedule later)"
            type="datetime-local"
            value={addForm.scheduled_at}
            onChange={(e) =>
              setAddForm((p) => ({ ...p, scheduled_at: e.target.value }))
            }
          />
          <Textarea
            label="Notes"
            value={addForm.notes}
            onChange={(e) =>
              setAddForm((p) => ({ ...p, notes: e.target.value }))
            }
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Add tour
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
