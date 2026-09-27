import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import PaymentReview from "../../components/PaymentReview";
import Modal from "../../components/ui/Modal";
import Input, { Select } from "../../components/ui/Input";
import {
  PlusIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  SparklesIcon,
  ScissorsIcon,
  XMarkIcon,
  PencilIcon,
  EnvelopeIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolid } from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import { format, parseISO, isPast, isToday, addDays } from "date-fns";

const EMPTY_FORM = {
  couple_id: "",
  description: "",
  amount: "",
  due_date: "",
  notes: "",
  payment: "",
};
const EMPTY_SCHEDULE = { couple_id: "", total_price: "", wedding_date: "" };
const PAYMENT_METHODS = [
  "E-Transfer",
  "Cash",
  "Cheque",
  "Credit Card",
  "Other",
];
const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

const clientName = (c) =>
  [c.partner1_name, c.partner2_name].filter(Boolean).join(" & ");
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const money = (n) =>
  `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// When a payment is split, the second part is due this many days after the first.
const SPLIT_GAP_DAYS = 14;

// Payment choices in Add Invoice. `key` picks the matching row of the standard
// schedule (for its label and due date); `pct` is the share of the booking total.
const PAYMENT_CHOICES = [
  { value: "deposit", label: "Deposit (25%)", key: "deposit", pct: 25 },
  { value: "second", label: "Second payment (25%)", key: "second", pct: 25 },
  { value: "balance", label: "Final balance (50%)", key: "balance", pct: 50 },
  {
    value: "deposit-half",
    label: "Half of the deposit (12.5%)",
    key: "deposit",
    pct: 12.5,
  },
];

function dueBadge(due_date, paid) {
  if (paid) return null;
  if (!due_date) return null;
  const d = parseISO(due_date);
  if (isPast(d) && !isToday(d))
    return { label: "Overdue", cls: "bg-red-100 text-red-700" };
  if (isToday(d))
    return { label: "Due Today", cls: "bg-amber-100 text-amber-700" };
  return null;
}

export default function Payments() {
  const { getAdminAxios, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [allocation, setAllocation] = useState({
    target_invoice_id: "",
    amount: "",
    reason: "",
    idempotency_key: crypto.randomUUID(),
  });
  const [invoices, setInvoices] = useState([]);
  const [couples, setCouples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE);
  const [scheduleItems, setScheduleItems] = useState([]);
  // Booking total and standard schedule for the couple picked in Add Invoice.
  const [addBooking, setAddBooking] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const sf = (k) => (e) =>
    setScheduleForm((p) => ({ ...p, [k]: e.target.value }));
  const [filterCouple, setFilterCouple] = useState(
    searchParams.get("couple") || "",
  );
  const [filterStatus, setFilterStatus] = useState("");
  // Record payment (date, method, reference, receipt) and edit-invoice dialogs
  const [paying, setPaying] = useState(null);
  const [payForm, setPayForm] = useState({
    paid_at: "",
    payment_method: "E-Transfer",
    reference: "",
    send_receipt: true,
  });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({
    description: "",
    amount: "",
    due_date: "",
    notes: "",
  });

  const fetchData = async () => {
    const api = getAdminAxios();
    const [iRes, cRes] = await Promise.all([
      api.get("/api/invoices"),
      api.get("/api/couples"),
    ]);
    setInvoices(iRes.data);
    setCouples(cRes.data);
  };

  useEffect(() => {
    fetchData()
      .catch((err) =>
        toast.error(
          err.response?.data?.error ||
            "Could not load payments. Check your connection and refresh.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const preview = async (total, checkIn) =>
    (
      await getAdminAxios().post("/api/invoices/schedule-preview", {
        total_price: Number(total),
        wedding_date: checkIn || null,
      })
    ).data;

  // When couple is selected in Add form, load their booking so a payment can be
  // picked as a share of its total.
  const handleCoupleSelectAdd = async (coupleId) => {
    setForm((p) => ({ ...p, couple_id: coupleId, payment: "" }));
    setAddBooking(null);
    if (!coupleId) return;
    try {
      const r = await getAdminAxios().get(`/api/bookings/couple/${coupleId}`);
      const b = r.data[0];
      if (b) setForm((p) => ({ ...p, due_date: b.event_date || "" }));
      if (b && Number(b.total_price) > 0) {
        setAddBooking({
          total: Number(b.total_price),
          checkIn: b.event_date,
          schedule: await preview(b.total_price, b.event_date),
        });
      }
    } catch {}
  };

  const choosePayment = (value) => {
    const choice = PAYMENT_CHOICES.find((c) => c.value === value);
    if (!choice || !addBooking) {
      setForm((p) => ({ ...p, payment: value }));
      return;
    }
    const row = addBooking.schedule.find((s) => s.key === choice.key);
    setForm((p) => ({
      ...p,
      payment: value,
      amount: String(round2((addBooking.total * choice.pct) / 100)),
      description:
        choice.value === "deposit-half"
          ? "Booking Deposit (25%) — half payment (12.5%)"
          : row.label,
      due_date: row.due_date || "",
    }));
  };

  // Paid invoices stay when the schedule is replaced, so the new payments only
  // need to cover what is left.
  const protectedInvoiceTotal = round2(
    invoices
      .filter(
        (i) =>
          String(i.couple_id) === String(scheduleForm.couple_id) &&
          i.has_payments,
      )
      .reduce((s, i) => s + i.amount, 0),
  );
  const scheduleOwed = round2(
    Number(scheduleForm.total_price || 0) - protectedInvoiceTotal,
  );
  const scheduleSum = round2(
    scheduleItems.reduce((s, i) => s + (Number(i.amount) || 0), 0),
  );
  const scheduleBalanced =
    scheduleOwed >= 0 && Math.abs(scheduleSum - scheduleOwed) < 0.005;

  // The standard schedule reloads whenever the total or date changes; staff
  // then adjust it (split a payment, move a date) before saving.
  useEffect(() => {
    if (!showSchedule || !(Number(scheduleForm.total_price) > 0)) {
      setScheduleItems([]);
      return;
    }
    let cancelled = false;
    preview(scheduleForm.total_price, scheduleForm.wedding_date)
      .then((rows) => {
        let covered = protectedInvoiceTotal;
        const remainder = rows
          .map((r) => {
            const take = Math.min(covered, r.amount);
            covered -= take;
            return { ...r, amount: round2(r.amount - take) };
          })
          .filter((r) => r.amount > 0);
        if (!cancelled)
          setScheduleItems(
            remainder.map((r) => ({
              description: r.label,
              amount: String(r.amount),
              due_date: r.due_date || "",
            })),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    showSchedule,
    scheduleForm.total_price,
    scheduleForm.wedding_date,
    scheduleForm.couple_id,
    protectedInvoiceTotal,
  ]);

  const editItem = (i, k) => (e) =>
    setScheduleItems((items) =>
      items.map((it, j) => (j === i ? { ...it, [k]: e.target.value } : it)),
    );
  const removeItem = (i) =>
    setScheduleItems((items) => items.filter((_, j) => j !== i));
  const addItem = () =>
    setScheduleItems((items) => [
      ...items,
      { description: "", amount: "", due_date: "" },
    ]);
  const splitItem = (i) =>
    setScheduleItems((items) => {
      const it = items[i];
      const first = round2((Number(it.amount) || 0) / 2);
      const second = round2((Number(it.amount) || 0) - first);
      const later = it.due_date
        ? format(addDays(parseISO(it.due_date), SPLIT_GAP_DAYS), "yyyy-MM-dd")
        : "";
      return [
        ...items.slice(0, i),
        {
          ...it,
          description: `${it.description} — part 1 of 2`,
          amount: String(first),
        },
        {
          ...it,
          description: `${it.description} — part 2 of 2`,
          amount: String(second),
          due_date: later,
        },
        ...items.slice(i + 1),
      ];
    });

  // When couple selected for schedule, auto-fill total + wedding date
  const handleCoupleSelectSchedule = async (coupleId) => {
    setScheduleForm((p) => ({ ...p, couple_id: coupleId }));
    if (!coupleId) return;
    try {
      const r = await getAdminAxios().get(`/api/bookings/couple/${coupleId}`);
      const b = r.data[0];
      if (b)
        setScheduleForm((p) => ({
          ...p,
          total_price: String(b.total_price || ""),
          wedding_date: b.event_date || "",
        }));
      else {
        const couple = couples.find((c) => String(c.id) === String(coupleId));
        if (couple)
          setScheduleForm((p) => ({
            ...p,
            wedding_date: couple.wedding_date || "",
          }));
      }
    } catch {}
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await getAdminAxios().post("/api/invoices", {
        couple_id: form.couple_id,
        description: form.description,
        amount: Number(form.amount),
        due_date: form.due_date || null,
        notes: form.notes || null,
      });
      toast.success("Invoice added!");
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to add invoice");
    }
  };

  const handleSchedule = async (e) => {
    e.preventDefault();
    try {
      const bRes = await getAdminAxios().get(
        `/api/bookings/couple/${scheduleForm.couple_id}`,
      );
      const booking = bRes.data[0];
      await getAdminAxios().post(
        `/api/invoices/schedule/${scheduleForm.couple_id}`,
        {
          booking_id: booking?.id || null,
          total_price: Number(scheduleForm.total_price),
          wedding_date:
            scheduleForm.wedding_date || booking?.event_date || null,
          items: scheduleItems.map((i) => ({
            description: i.description,
            amount: Number(i.amount),
            due_date: i.due_date || null,
          })),
        },
      );
      toast.success("Payment schedule created!");
      setShowSchedule(false);
      setScheduleForm(EMPTY_SCHEDULE);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create schedule");
    }
  };

  const [history, setHistory] = useState([]);
  const [recording, setRecording] = useState(false);
  const togglePaid = async (inv) => {
    setPayForm({
      paid_at: format(new Date(), "yyyy-MM-dd"),
      payment_method: "E-Transfer",
      reference: "",
      send_receipt: true,
      amount: String(inv.balance > 0 ? inv.balance : -inv.amount_paid),
      reason: "",
      idempotency_key: crypto.randomUUID(),
    });
    setHistory([]);
    setPaying(inv);
    try {
      const r = await getAdminAxios().get(`/api/invoices/${inv.id}/payments`);
      setHistory(r.data.entries);
    } catch {
      toast.error("Could not load payment history");
    }
  };
  const recordPayment = async (e) => {
    e.preventDefault();
    setRecording(true);
    try {
      const { data } = await getAdminAxios().post(
        `/api/invoices/${paying.id}/payments`,
        {
          amount: Number(payForm.amount),
          received_at: payForm.paid_at,
          method: payForm.payment_method,
          reference: payForm.reference,
          reason: payForm.reason,
          send_receipt: payForm.send_receipt,
          idempotency_key: payForm.idempotency_key,
        },
      );
      if (payForm.send_receipt && data.receipt_sent === false)
        toast.error(
          `Payment recorded, but the receipt did not send: ${data.receipt_error}`,
          { duration: 7000 },
        );
      else
        toast.success(
          data.receipt_sent
            ? "Payment recorded and receipt emailed"
            : "Payment recorded",
        );
      setPaying(null);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to record the payment");
    } finally {
      setRecording(false);
    }
  };

  const openEdit = (inv) => {
    setEditForm({
      description: inv.description,
      amount: String(inv.amount),
      due_date: inv.due_date || "",
      notes: inv.notes || "",
    });
    setEditing(inv);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await getAdminAxios().put(`/api/invoices/${editing.id}`, {
        description: editForm.description.trim(),
        amount: Number(editForm.amount),
        due_date: editForm.due_date || null,
        notes: editForm.notes || null,
      });
      toast.success("Invoice updated");
      setEditing(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update the invoice");
    }
  };

  const sendReminder = async (inv) => {
    if (
      !confirm(
        `Email ${clientName(inv)} a reminder about "${inv.description}" now?`,
      )
    )
      return;
    try {
      await getAdminAxios().post(`/api/invoices/${inv.id}/remind`);
      toast.success("Reminder emailed");
    } catch (err) {
      toast.error(err.response?.data?.error || "The reminder did not send", {
        duration: 7000,
      });
    }
  };

  // Fetched with the auth header, then shown in a new tab ready to print.
  const printStatement = async () => {
    const win = window.open("", "_blank");
    try {
      const { data } = await getAdminAxios().get(
        `/api/invoices/couple/${filterCouple}/statement/print`,
        { responseType: "text" },
      );
      win.document.open();
      win.document.write(data);
      win.document.close();
    } catch (err) {
      win?.close();
      toast.error("Could not open the statement");
    }
  };

  const deleteInvoice = async (id) => {
    if (!confirm("Delete this invoice?")) return;
    try {
      await getAdminAxios().delete(`/api/invoices/${id}`);
      toast.success("Deleted");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete", {
        duration: 6000,
      });
    }
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isOverdue = (i) => !i.paid && i.due_date && i.due_date < todayStr;
  const byCouple = filterCouple
    ? invoices.filter((i) => String(i.couple_id) === filterCouple)
    : invoices;
  const filtered = byCouple.filter(
    (i) =>
      !filterStatus ||
      (filterStatus === "paid" && i.has_payments) ||
      (filterStatus === "overdue" && isOverdue(i)) ||
      (filterStatus === "upcoming" && !i.paid && !isOverdue(i)),
  );
  // Totals follow the client filter, not the status tabs, so they stay meaningful.
  const totalOwed = byCouple.reduce((s, i) => s + i.balance, 0);
  const totalCollected = byCouple.reduce((s, i) => s + i.amount_paid, 0);
  const overdue = byCouple.filter(isOverdue);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            {invoices.length} invoices ·{" "}
            {overdue.length > 0 ? `${overdue.length} overdue` : "no overdue"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => setShowSchedule(true)}
          >
            <SparklesIcon className="w-4 h-4" />
            Auto Schedule
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <PlusIcon className="w-4 h-4" />
            Add Invoice
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">
                {money(totalCollected)}
              </div>
              <div className="text-xs text-slate-400">Collected</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <ClockIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">
                {money(totalOwed)}
              </div>
              <div className="text-xs text-slate-400">Outstanding</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${overdue.length > 0 ? "bg-red-100" : "bg-slate-100"}`}
            >
              <ExclamationTriangleIcon
                className={`w-5 h-5 ${overdue.length > 0 ? "text-red-600" : "text-slate-400"}`}
              />
            </div>
            <div>
              <button
                onClick={() => setFilterStatus("overdue")}
                className={`text-xl font-bold hover:underline ${overdue.length > 0 ? "text-red-700" : "text-slate-800"}`}
              >
                {overdue.length}
              </button>
              <div className="text-xs text-slate-400">Overdue</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setFilterStatus(s.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === s.key ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          id="payments-filter-couple"
          name="payments-filter-couple"
          aria-label="Filter invoices by client"
          value={filterCouple}
          onChange={(e) => setFilterCouple(e.target.value)}
          className="input-field w-full sm:w-64"
        >
          <option value="">All clients</option>
          {couples.map((c) => (
            <option key={c.id} value={c.id}>
              {clientName(c)}
            </option>
          ))}
        </select>
        {filterCouple && (
          <>
            <button
              onClick={printStatement}
              className="btn-secondary py-1.5 text-xs"
            >
              <PrinterIcon className="w-4 h-4" /> Print statement
            </button>
            <button
              onClick={() => setFilterCouple("")}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Clear filter
            </button>
          </>
        )}
      </div>

      {/* Invoice table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <CurrencyDollarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          {invoices.length === 0 ? (
            <>
              <p className="text-slate-400 font-medium">No invoices yet</p>
              <p className="text-xs text-slate-300 mt-1">
                Use "Auto Schedule" to generate a standard 3-payment schedule,
                or add invoices manually.
              </p>
            </>
          ) : (
            <p className="text-slate-400 font-medium">
              No invoices match these filters
            </p>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const badge = dueBadge(inv.due_date, inv.paid);
                return (
                  <tr key={inv.id} className={inv.paid ? "opacity-60" : ""}>
                    <td>
                      <Link
                        to={`/clients/${inv.couple_id}`}
                        className="font-medium text-slate-700 hover:text-rose-600"
                      >
                        {clientName(inv)}
                      </Link>
                    </td>
                    <td>
                      <div className="text-slate-700">{inv.description}</div>
                      {inv.notes && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {inv.notes}
                        </div>
                      )}
                    </td>
                    <td className="font-semibold text-slate-800">
                      {money(inv.amount)}
                      <div className="text-xs font-normal text-slate-500">
                        {money(inv.amount_paid)} received · {money(inv.balance)}{" "}
                        owing
                      </div>
                    </td>
                    <td>
                      {inv.due_date ? (
                        <div>
                          <div className="text-sm text-slate-600">
                            {format(parseISO(inv.due_date), "MMM d, yyyy")}
                          </div>
                          {badge && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => togglePaid(inv)}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          inv.paid
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {inv.paid ? (
                          <CheckCircleSolid className="w-3.5 h-3.5" />
                        ) : (
                          <ClockIcon className="w-3.5 h-3.5" />
                        )}
                        {inv.paid
                          ? "Paid · history"
                          : inv.amount_paid > 0
                            ? "Part paid · record payment"
                            : "Record payment"}
                      </button>
                      {/* !! matters: inv.paid is SQLite's integer 0, and React
                          renders a bare 0 as the text "0", not as nothing. */}
                      {!!inv.paid && inv.paid_at && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {format(parseISO(inv.paid_at), "MMM d")}
                          {inv.payment_method ? ` · ${inv.payment_method}` : ""}
                          {inv.payment_reference
                            ? ` · ${inv.payment_reference}`
                            : ""}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {!inv.paid && (
                        <button
                          onClick={() => sendReminder(inv)}
                          title="Email a payment reminder now"
                          aria-label="Email a payment reminder"
                          className="btn-ghost py-1 px-2 text-xs text-slate-500"
                        >
                          <EnvelopeIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(inv)}
                        title="Edit"
                        aria-label="Edit invoice"
                        className="btn-ghost py-1 px-2 text-xs text-slate-500"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteInvoice(inv.id)}
                        title="Delete"
                        aria-label="Delete invoice"
                        className="btn-ghost py-1 px-2 text-xs text-red-400 hover:bg-red-50"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {user?.role === "admin" && (
        <PaymentReview api={getAdminAxios()} onChange={fetchData} />
      )}

      {/* Payment history and recording */}
      <Modal
        isOpen={!!paying}
        onClose={() => setPaying(null)}
        title="Payments and history"
      >
        {paying && (
          <form onSubmit={recordPayment} className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>{clientName(paying)}</strong> — {paying.description},{" "}
              {money(paying.amount)}
            </p>
            <div>
              <label htmlFor="pay-amount" className="label">
                Amount received ($)
                {user?.role === "admin"
                  ? " — use a negative amount for a refund or correction"
                  : ""}
              </label>
              <input
                id="pay-amount"
                type="number"
                step="0.01"
                min={user?.role === "admin" ? undefined : "0.01"}
                required
                value={payForm.amount || ""}
                onChange={(e) =>
                  setPayForm((p) => ({ ...p, amount: e.target.value }))
                }
                className="input-field"
              />
            </div>
            {Number(payForm.amount) < 0 && (
              <div>
                <label htmlFor="pay-reason" className="label">
                  Reason for refund or correction
                </label>
                <input
                  id="pay-reason"
                  required
                  value={payForm.reason || ""}
                  onChange={(e) =>
                    setPayForm((p) => ({ ...p, reason: e.target.value }))
                  }
                  className="input-field"
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pay-date" className="label">
                  Date received
                </label>
                <input
                  id="pay-date"
                  type="date"
                  required
                  value={payForm.paid_at}
                  onChange={(e) =>
                    setPayForm((p) => ({ ...p, paid_at: e.target.value }))
                  }
                  className="input-field"
                />
              </div>
              <div>
                <label htmlFor="pay-method" className="label">
                  Method
                </label>
                <select
                  id="pay-method"
                  value={payForm.payment_method}
                  onChange={(e) =>
                    setPayForm((p) => ({
                      ...p,
                      payment_method: e.target.value,
                    }))
                  }
                  className="input-field"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="pay-ref" className="label">
                Reference{" "}
                <span className="text-slate-400 font-normal">
                  (e-Transfer reference, cheque number…)
                </span>
              </label>
              <input
                id="pay-ref"
                type="text"
                value={payForm.reference}
                onChange={(e) =>
                  setPayForm((p) => ({ ...p, reference: e.target.value }))
                }
                className="input-field"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={payForm.send_receipt}
                onChange={(e) =>
                  setPayForm((p) => ({ ...p, send_receipt: e.target.checked }))
                }
              />
              Email a receipt to the couple
            </label>
            {history.length > 0 && (
              <div className="text-sm space-y-2 border-t pt-3">
                <h3 className="font-semibold">Payment history</h3>
                {history.map((h) => (
                  <p key={h.id}>
                    {h.received_at || "Date unknown"} · {money(h.amount)} ·{" "}
                    {h.kind} · {h.method || "Unknown method"} {h.reference}
                    {h.reason ? ` — ${h.reason}` : ""}
                  </p>
                ))}
              </div>
            )}
            {user?.role === "admin" && history.length > 0 && (
              <details className="border-t pt-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Correct which invoice received the money
                </summary>
                <p className="text-xs text-gray-500 my-2">
                  Transfer an allocation within this couple’s invoices. This
                  preserves both entries and does not record another payment or
                  refund.
                </p>
                <Select
                  label="Move received amount to invoice"
                  value={allocation.target_invoice_id}
                  onChange={(e) =>
                    setAllocation((a) => ({
                      ...a,
                      target_invoice_id: e.target.value,
                    }))
                  }
                >
                  <option value="">Choose another invoice</option>
                  {invoices
                    .filter(
                      (i) =>
                        i.couple_id === paying.couple_id && i.id !== paying.id,
                    )
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.description}
                      </option>
                    ))}
                </Select>
                <Input
                  label="Amount to reallocate ($)"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={allocation.amount}
                  onChange={(e) =>
                    setAllocation((a) => ({ ...a, amount: e.target.value }))
                  }
                />
                <Input
                  label="Allocation correction reason"
                  value={allocation.reason}
                  onChange={(e) =>
                    setAllocation((a) => ({ ...a, reason: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn-secondary mt-2"
                  disabled={
                    recording ||
                    !allocation.target_invoice_id ||
                    !allocation.amount ||
                    !allocation.reason.trim()
                  }
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Move this received amount to the selected invoice?",
                      )
                    )
                      return;
                    setRecording(true);
                    try {
                      await getAdminAxios().post(
                        `/api/invoices/${paying.id}/reallocate`,
                        allocation,
                      );
                      setAllocation({
                        target_invoice_id: "",
                        amount: "",
                        reason: "",
                        idempotency_key: crypto.randomUUID(),
                      });
                      setPaying(null);
                      toast.success("Payment allocation corrected");
                      await fetchData();
                    } catch (e) {
                      toast.error(
                        e.response?.data?.error || "Could not move allocation",
                      );
                    } finally {
                      setRecording(false);
                    }
                  }}
                >
                  Move allocation
                </button>
              </details>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaying(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={recording}
                className="btn-primary"
              >
                {recording ? "Recording…" : "Record payment"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit invoice */}
      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title="Edit invoice"
      >
        {editing && (
          <form onSubmit={saveEdit} className="space-y-4">
            <div>
              <label htmlFor="edit-desc" className="label">
                Description
              </label>
              <input
                id="edit-desc"
                required
                disabled={editing?.has_payments}
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, description: e.target.value }))
                }
                className="input-field"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-amount" className="label">
                  Amount (incl. GST)
                </label>
                <input
                  id="edit-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  disabled={editing?.has_payments}
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, amount: e.target.value }))
                  }
                  className="input-field"
                />
              </div>
              <div>
                <label htmlFor="edit-due" className="label">
                  Due date
                </label>
                <input
                  id="edit-due"
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, due_date: e.target.value }))
                  }
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label htmlFor="edit-notes" className="label">
                Notes
              </label>
              <input
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, notes: e.target.value }))
                }
                className="input-field"
              />
            </div>
            {!!editing.paid && (
              <p className="text-xs text-amber-700">
                This invoice is already allocated to invoices with payment
                history. Changes are recorded in the couple's history.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add invoice modal */}
      <Modal
        isOpen={showAdd}
        onClose={() => {
          setShowAdd(false);
          setForm(EMPTY_FORM);
          setAddBooking(null);
        }}
        title="Add Invoice"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="invoice-couple" className="label">
              Client Couple <span className="text-red-500">*</span>
            </label>
            <select
              id="invoice-couple"
              name="invoice-couple"
              value={form.couple_id}
              onChange={(e) => handleCoupleSelectAdd(e.target.value)}
              required
              className="input-field"
            >
              <option value="">Select couple...</option>
              {couples.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientName(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Select
              label="Payment"
              value={form.payment}
              onChange={(e) => choosePayment(e.target.value)}
              disabled={!addBooking}
            >
              <option value="">Custom amount</option>
              {PAYMENT_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-400 mt-1">
              {!form.couple_id
                ? "Pick a couple to choose a share of their booking total."
                : !addBooking
                  ? "This couple has no booking total yet, so enter the amount yourself."
                  : form.payment
                    ? `${PAYMENT_CHOICES.find((c) => c.value === form.payment).pct}% of the ${money(addBooking.total)} booking total.`
                    : `Booking total ${money(addBooking.total)}.`}
            </p>
          </div>
          <Input
            label="Description"
            value={form.description}
            onChange={f("description")}
            required
            placeholder="e.g. Booking Deposit (25%)"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="payment-amount" className="label">
                Amount ($) <span className="text-red-500">*</span>
              </label>
              <input
                id="payment-amount"
                name="payment-amount"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    amount: e.target.value,
                    payment: "",
                  }))
                }
                className="input-field"
                placeholder="0.00"
              />
            </div>
            <Input
              type="date"
              label="Due Date"
              value={form.due_date}
              onChange={f("due_date")}
            />
          </div>
          <Input
            label="Notes (optional)"
            value={form.notes}
            onChange={f("notes")}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowAdd(false);
                setForm(EMPTY_FORM);
                setAddBooking(null);
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Add Invoice
            </button>
          </div>
        </form>
      </Modal>

      {/* Auto schedule modal */}
      <Modal
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
        title="Generate Payment Schedule"
        size="lg"
      >
        <form onSubmit={handleSchedule} className="space-y-4">
          <p className="text-sm text-slate-500">
            Starts from the three payments in the signed agreement: 25% deposit
            now, 25% at 180 days before check-in, and the 50% balance at 90 days
            before check-in. If you've agreed a different plan with the couple,
            adjust the payments below. For example, split the deposit into two
            payments two weeks apart.
          </p>
          <div>
            <label htmlFor="schedule-couple" className="label">
              Client Couple <span className="text-red-500">*</span>
            </label>
            <select
              id="schedule-couple"
              name="schedule-couple"
              value={scheduleForm.couple_id}
              onChange={(e) => handleCoupleSelectSchedule(e.target.value)}
              required
              className="input-field"
            >
              <option value="">Select couple...</option>
              {couples.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientName(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="schedule-total-price" className="label">
                Total Contract Price ($) <span className="text-red-500">*</span>
              </label>
              <input
                id="schedule-total-price"
                name="schedule-total-price"
                type="number"
                min="0"
                step="0.01"
                required
                value={scheduleForm.total_price}
                onChange={sf("total_price")}
                className="input-field"
                placeholder="0.00"
              />
            </div>
            <Input
              type="date"
              label="Check-In Date"
              value={scheduleForm.wedding_date}
              onChange={sf("wedding_date")}
            />
          </div>
          {scheduleItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label mb-0">Payments</span>
                <span className="text-xs text-slate-400">
                  Changing the total or date resets these.
                </span>
              </div>
              {protectedInvoiceTotal > 0 && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2">
                  Invoices with payment history already account for{" "}
                  {money(protectedInvoiceTotal)}. They are kept with their
                  remaining balances. The instalments below cover the rest of
                  the total.
                </p>
              )}
              {scheduleItems.map((it, i) => (
                <div
                  key={i}
                  className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-center border-b border-slate-100 pb-2 sm:border-0 sm:pb-0"
                >
                  <input
                    aria-label={`Payment ${i + 1} description`}
                    className="input-field col-span-6"
                    value={it.description}
                    onChange={editItem(i, "description")}
                    required
                  />
                  <input
                    aria-label={`Payment ${i + 1} amount`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="input-field col-span-2"
                    value={it.amount}
                    onChange={editItem(i, "amount")}
                    required
                  />
                  <input
                    aria-label={`Payment ${i + 1} due date`}
                    type="date"
                    className="input-field col-span-3"
                    value={it.due_date}
                    onChange={editItem(i, "due_date")}
                  />
                  <div className="col-span-1 flex">
                    <button
                      type="button"
                      title="Split into two payments"
                      aria-label={`Split payment ${i + 1} into two`}
                      onClick={() => splitItem(i)}
                      className="btn-ghost p-1 text-slate-500"
                    >
                      <ScissorsIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      aria-label={`Remove payment ${i + 1}`}
                      onClick={() => removeItem(i)}
                      className="btn-ghost p-1 text-red-400"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  className="text-xs text-rose-600 hover:underline"
                  onClick={addItem}
                >
                  + Add payment
                </button>
                <span
                  data-testid="schedule-sum"
                  className={`text-xs font-medium ${scheduleBalanced ? "text-emerald-600" : "text-red-600"}`}
                >
                  {money(scheduleSum)} of {money(scheduleOwed)}
                  {protectedInvoiceTotal > 0
                    ? ` to allocate (${money(protectedInvoiceTotal)} retained on existing invoices)`
                    : ""}
                  {!scheduleBalanced &&
                    ` · ${scheduleSum > scheduleOwed ? "over" : "short"} by ${money(Math.abs(scheduleSum - scheduleOwed))}`}
                </span>
              </div>
            </div>
          )}
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            This will delete any unpaid invoices for this couple and replace
            them with the new schedule. Paid invoices are kept.
          </p>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowSchedule(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!scheduleBalanced}
            >
              Create Schedule
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
