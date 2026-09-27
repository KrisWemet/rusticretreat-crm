import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Input, { Select, Textarea } from "./ui/Input";
import Modal from "./ui/Modal";
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const notes = [
  ["arrival_instructions", "Arrival instructions"],
  ["departure_instructions", "Departure instructions"],
  ["day_of_contact", "Day-of contacts"],
  ["vendor_power", "Vendors and power requirements"],
  ["setup_responsibilities", "Setup responsibilities"],
  ["readiness", "Readiness checks"],
  ["closeout", "Departure and closeout notes"],
];
function OperationSection({ title, open = false, children }) {
  return (
    <details open={open} className="rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer font-semibold text-slate-800">
        {title}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
export default function EventOperations({
  couple,
  api,
  isAdmin,
  operationsOnly = false,
  onChange,
}) {
  const [data, setData] = useState(null),
    [details, setDetails] = useState({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [staff, setStaff] = useState([]),
    [staffError, setStaffError] = useState(false),
    [assignedUser, setAssignedUser] = useState(""),
    [dueChanges, setDueChanges] = useState(null),
    [showTemplates, setShowTemplates] = useState(false),
    [templates, setTemplates] = useState([]);
  const [hold, setHold] = useState({
    event_date: "",
    end_date: "",
    package_name: couple.venue_package || "",
    days: 7,
    reason: "",
  });
  const [deposit, setDeposit] = useState({
    kind: "received",
    amount: "",
    reason: "",
    reference: "",
    received_at: today(),
  });
  const [depositKey, setDepositKey] = useState(() => crypto.randomUUID());
  const [inspection, setInspection] = useState({
      stage: "arrival",
      notes: "",
      photo: null,
    }),
    [template, setTemplate] = useState({
      title: "",
      offset_days: -7,
      reference_date: "ceremony",
      owner: "",
    });
  const dirty =
    data && JSON.stringify(details) !== JSON.stringify(data.details);
  async function load(preserve = false) {
    try {
      const { data: d } = await api.get(`/api/operations/${couple.id}`);
      setData(d);
      if (!preserve) setDetails(d.details);
      setError("");
    } catch (e) {
      setError(e.response?.data?.error || "Could not load event operations");
    }
  }
  useEffect(() => {
    load();
    if (isAdmin)
      api
        .get("/api/auth/staff")
        .then((r) => setStaff(r.data))
        .catch(() => setStaffError(true));
  }, [couple.id]);
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function action(fn, message, plansSaved = false) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await load(dirty && !plansSaved);
      onChange?.();
    } catch (e) {
      toast.error(
        e.response?.data?.error ||
          "Could not save. Your entries are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  const close = () => {
    if (dirty && !window.confirm("Discard unsaved event plans?")) return;
    setDetails(data.details);
    setOpen(false);
  };
  if (error)
    return (
      <div className="card p-4 text-red-600">
        {error}
        <button className="btn-secondary ml-3" onClick={load}>
          Try again
        </button>
      </div>
    );
  if (!data)
    return <p className="text-sm text-gray-500">Loading event operations…</p>;
  return (
    <section className="card p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold">Event preparation and closeout</h2>
          <p className="text-sm text-gray-500">
            Plans, camping, inspections and date holds in one place.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setOpen(true)}>
          Open event operations
        </button>
      </div>
      {!operationsOnly && (
        <p className="text-sm">
          Damage deposit held: <strong>{money(data.deposit.held)}</strong> ·
          Returned: {money(data.deposit.returned)} · Retained:{" "}
          {money(data.deposit.retained)}
        </p>
      )}
      {data.holds
        .filter((h) => h.status === "active")
        .map((h) => (
          <p key={h.id} className="text-sm text-amber-700">
            Dates held {h.event_date}–{h.end_date} until{" "}
            {new Date(h.expires_at).toLocaleString()}
            <button
              disabled={busy}
              className="btn-ghost ml-2"
              onClick={() =>
                action(
                  () =>
                    api.delete(`/api/operations/${couple.id}/holds/${h.id}`),
                  "Date hold released",
                )
              }
            >
              Release hold
            </button>
          </p>
        ))}
      <Modal isOpen={open} onClose={close} title="Event operations" size="lg">
        <div className="space-y-6">
          <OperationSection title="Event plans and camping" open>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                action(
                  () =>
                    api.put(`/api/operations/${couple.id}`, {
                      details,
                      revision: data.revision,
                    }),
                  "Event plans saved",
                  true,
                );
              }}
            >
              {notes.map(([key, label]) => (
                <Textarea
                  key={key}
                  label={label}
                  rows={2}
                  value={details[key] || ""}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, [key]: e.target.value }))
                  }
                />
              ))}
              <h3 className="font-semibold">Nightly camping</h3>
              <p className="text-sm text-gray-500">
                Each night must fall within the reserved stay. Counts are
                planning details and do not change the signed price.
              </p>
              {(details.camping || []).map((n, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    ["date", "Night", "date"],
                    ["guests", "Overnight guests", "number"],
                    ["tents", "Tents", "number"],
                    ["rvs", "RVs", "number"],
                  ].map(([key, label, type]) => (
                    <Input
                      key={key}
                      label={label}
                      type={type}
                      min={type === "number" ? 0 : undefined}
                      value={n[key]}
                      onChange={(e) =>
                        setDetails((d) => ({
                          ...d,
                          camping: d.camping.map((x, j) =>
                            j === i ? { ...x, [key]: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  ))}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setDetails((d) => ({
                        ...d,
                        camping: d.camping.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    Remove night
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setDetails((d) => ({
                      ...d,
                      camping: [
                        ...(d.camping || []),
                        { date: "", guests: 0, tents: 0, rvs: 0 },
                      ],
                    }))
                  }
                >
                  Add camping night
                </button>
                <button className="btn-primary" disabled={busy || !dirty}>
                  {busy ? "Saving…" : "Save event plans"}
                </button>
              </div>
            </form>
          </OperationSection>
          {!operationsOnly && (
            <OperationSection title="Tasks and payment dates">
              {!operationsOnly && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold">Event tasks</h3>
                  <p className="text-sm text-gray-500">
                    Add missing tasks from the reusable task templates. Existing
                    and completed tasks are kept.
                  </p>
                  <button
                    className="btn-secondary mt-2"
                    disabled={busy}
                    onClick={() =>
                      action(
                        () => api.post(`/api/operations/${couple.id}/tasks`),
                        "Event tasks updated",
                      )
                    }
                  >
                    Add missing event tasks
                  </button>
                  {isAdmin && (
                    <button
                      className="btn-ghost"
                      onClick={async () => {
                        try {
                          setTemplates(
                            (await api.get("/api/operations/templates")).data,
                          );
                          setShowTemplates(true);
                        } catch {
                          toast.error("Could not load task templates");
                        }
                      }}
                    >
                      Manage task templates
                    </button>
                  )}
                </div>
              )}
              {!operationsOnly && (
                <div className="border-t pt-4 space-y-2">
                  <h3 className="font-semibold">
                    Review payment dates after a reschedule
                  </h3>
                  <p className="text-sm text-gray-500">
                    Only unpaid standard installments are suggested. Received
                    money, custom plans and signed agreements are kept.
                  </p>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        setDueChanges(
                          (
                            await api.get(
                              `/api/operations/${couple.id}/due-preview`,
                            )
                          ).data,
                        );
                      } catch (e) {
                        toast.error(
                          e.response?.data?.error || "Could not preview dates",
                        );
                      }
                    }}
                  >
                    Preview unpaid due dates
                  </button>
                  {dueChanges && (
                    <>
                      <ul className="text-sm">
                        {dueChanges.map((c) => (
                          <li key={c.id}>
                            {c.description}: {c.old_due || "No date"} →{" "}
                            {c.new_due}
                          </li>
                        ))}
                      </ul>
                      {dueChanges.length ? (
                        <button
                          className="btn-primary"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              await api.post(
                                `/api/operations/${couple.id}/due-preview`,
                                { changes: dueChanges },
                              );
                              setDueChanges(null);
                            }, "Reviewed payment dates saved")
                          }
                        >
                          Apply reviewed due dates
                        </button>
                      ) : (
                        <p className="text-sm text-gray-500">
                          No standard unpaid due dates need changing. Review
                          custom installments in Payments.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </OperationSection>
          )}
          <OperationSection title="Inspections and photos">
            <form
              className="border-t pt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData();
                form.append("stage", inspection.stage);
                form.append("notes", inspection.notes);
                if (inspection.photo) form.append("photo", inspection.photo);
                action(async () => {
                  await api.post(
                    `/api/operations/${couple.id}/inspections`,
                    form,
                  );
                  setInspection({ stage: "arrival", notes: "", photo: null });
                }, "Inspection recorded");
              }}
            >
              <h3 className="font-semibold">Inspection record</h3>
              <Select
                label="Inspection stage"
                value={inspection.stage}
                onChange={(e) =>
                  setInspection((i) => ({ ...i, stage: e.target.value }))
                }
              >
                <option value="arrival">Arrival</option>
                <option value="departure">Departure</option>
              </Select>
              <Textarea
                label="Inspection notes"
                required
                value={inspection.notes}
                onChange={(e) =>
                  setInspection((i) => ({ ...i, notes: e.target.value }))
                }
              />
              <Input
                label="Inspection photo (optional, up to 8 MB)"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) =>
                  setInspection((i) => ({ ...i, photo: e.target.files[0] }))
                }
              />
              <button disabled={busy} className="btn-primary">
                Record inspection
              </button>
            </form>
            <ul className="space-y-3">
              {data.inspections.map((i) => (
                <li key={i.id} className="text-sm">
                  <strong>
                    {i.stage} · {i.created_at}
                  </strong>
                  <p className="whitespace-pre-wrap">{i.notes}</p>
                  {i.filename && (
                    <button
                      className="btn-ghost"
                      onClick={async () => {
                        try {
                          const r = await api.get(
                            `/api/operations/${couple.id}/inspections/${i.id}/photo`,
                            { responseType: "blob" },
                          );
                          const url = URL.createObjectURL(r.data);
                          window.open(url, "_blank");
                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                        } catch {
                          toast.error("Could not open photo");
                        }
                      }}
                    >
                      Open {i.filename}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </OperationSection>
          {!operationsOnly && (
            <OperationSection title="Damage deposit">
              {isAdmin && (
                <form
                  className="border-t pt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      !window.confirm(
                        `Record damage deposit ${deposit.kind}: ${money(deposit.amount)}?`,
                      )
                    )
                      return;
                    action(async () => {
                      await api.post(`/api/operations/${couple.id}/deposit`, {
                        ...deposit,
                        idempotency_key: depositKey,
                      });
                      setDepositKey(crypto.randomUUID());
                      setDeposit((d) => ({
                        ...d,
                        amount: "",
                        reason: "",
                        reference: "",
                      }));
                    }, "Damage deposit entry saved");
                  }}
                >
                  <h3 className="font-semibold">Damage deposit</h3>
                  <p className="text-sm text-gray-500">
                    Held {money(data.deposit.held)}. This is separate from venue
                    fees and revenue. Record actual money received, returned or
                    retained after review.
                  </p>
                  <Select
                    label="Deposit disposition"
                    value={deposit.kind}
                    onChange={(e) =>
                      setDeposit((d) => ({ ...d, kind: e.target.value }))
                    }
                  >
                    <option value="received">Received</option>
                    <option value="returned">Returned to couple</option>
                    <option value="retained">Retained after inspection</option>
                  </Select>
                  <Input
                    label="Deposit amount ($)"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={deposit.amount}
                    onChange={(e) =>
                      setDeposit((d) => ({ ...d, amount: e.target.value }))
                    }
                  />
                  <Input
                    label="Deposit date"
                    type="date"
                    required
                    value={deposit.received_at}
                    onChange={(e) =>
                      setDeposit((d) => ({ ...d, received_at: e.target.value }))
                    }
                  />
                  <Input
                    label="Deposit reference"
                    value={deposit.reference}
                    onChange={(e) =>
                      setDeposit((d) => ({ ...d, reference: e.target.value }))
                    }
                  />
                  <Textarea
                    label="Deposit reason"
                    required
                    value={deposit.reason}
                    onChange={(e) =>
                      setDeposit((d) => ({ ...d, reason: e.target.value }))
                    }
                  />
                  <button className="btn-primary" disabled={busy}>
                    Record deposit entry
                  </button>
                </form>
              )}
              <ul className="text-sm space-y-2">
                {data.deposit?.entries.map((e) => (
                  <li key={e.id}>
                    {e.received_at} · {e.kind} · {money(e.amount_cents / 100)} ·{" "}
                    {e.reason}
                  </li>
                ))}
              </ul>
            </OperationSection>
          )}
          {!operationsOnly && (
            <OperationSection title="Date holds and assigned staff">
              {!operationsOnly &&
                !["booked", "completed", "cancelled"].includes(
                  couple.status,
                ) && (
                  <form
                    className="border-t pt-4 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(
                        () =>
                          api.post(`/api/operations/${couple.id}/holds`, hold),
                        "Date hold created",
                      );
                    }}
                  >
                    <h3 className="font-semibold">
                      Hold dates while preparing an agreement
                    </h3>
                    <p className="text-sm text-gray-500">
                      A hold is optional and expires automatically. A sent
                      proposal alone does not reserve dates.
                    </p>
                    <Input
                      label="Hold check-in"
                      type="date"
                      required
                      value={hold.event_date}
                      onChange={(e) =>
                        setHold((h) => ({ ...h, event_date: e.target.value }))
                      }
                    />
                    <Input
                      label="Hold check-out"
                      type="date"
                      required
                      value={hold.end_date}
                      onChange={(e) =>
                        setHold((h) => ({ ...h, end_date: e.target.value }))
                      }
                    />
                    <Select
                      label="Hold package"
                      value={hold.package_name}
                      onChange={(e) =>
                        setHold((h) => ({ ...h, package_name: e.target.value }))
                      }
                    >
                      <option value="">Choose package</option>
                      <option>3-Day Weekend</option>
                      <option>5-Day Experience</option>
                    </Select>
                    <Input
                      label="Hold duration (days)"
                      type="number"
                      min="1"
                      max="30"
                      required
                      value={hold.days}
                      onChange={(e) =>
                        setHold((h) => ({ ...h, days: e.target.value }))
                      }
                    />
                    <Textarea
                      label="Hold reason"
                      required
                      value={hold.reason}
                      onChange={(e) =>
                        setHold((h) => ({ ...h, reason: e.target.value }))
                      }
                    />
                    <button className="btn-primary" disabled={busy}>
                      Hold dates
                    </button>
                  </form>
                )}
              {isAdmin && (
                <div className="border-t pt-4 space-y-2">
                  <h3 className="font-semibold">Assigned event staff</h3>
                  {staffError && (
                    <p className="text-sm text-red-600">
                      Could not load staff names. Refresh before assigning
                      staff.
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    Logins with event-only access can see these plans and
                    inspections, without contracts or financial records.
                  </p>
                  <Select
                    label="Assign event staff"
                    value={assignedUser}
                    onChange={(e) => setAssignedUser(e.target.value)}
                  >
                    <option value="">Choose staff</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <button
                    className="btn-secondary"
                    disabled={busy || !assignedUser}
                    onClick={() =>
                      action(
                        () =>
                          api.post(`/api/operations/${couple.id}/assign`, {
                            user_id: Number(assignedUser),
                          }),
                        "Event staff assigned",
                      )
                    }
                  >
                    Assign to event
                  </button>
                  {data.assigned_staff?.map((s) => (
                    <p key={s.id} className="text-sm">
                      {s.name}
                      <button
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() =>
                          action(
                            () =>
                              api.delete(
                                `/api/operations/${couple.id}/assign/${s.id}`,
                              ),
                            "Assignment removed",
                          )
                        }
                      >
                        Remove assignment
                      </button>
                    </p>
                  ))}
                </div>
              )}
              <ul className="text-xs text-gray-500">
                {data.holds
                  .filter((h) => h.status !== "active")
                  .map((h) => (
                    <li key={h.id}>
                      {h.event_date}–{h.end_date}: {h.status}
                    </li>
                  ))}
              </ul>
            </OperationSection>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        title="Reusable event tasks"
        size="lg"
      >
        <p className="text-sm text-gray-500 mb-3">
          Choose ceremony or check-out as the reference date. Negative offsets
          are before; positive offsets are after. Changes affect new tasks; edit
          existing tasks separately.
        </p>
        <div className="space-y-4">
          {templates.map((t) => (
            <div key={t.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Input
                label="Task title"
                value={t.title}
                onChange={(e) =>
                  setTemplates((ts) =>
                    ts.map((x) =>
                      x.id === t.id ? { ...x, title: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                label="Days from reference date"
                type="number"
                value={t.offset_days}
                onChange={(e) =>
                  setTemplates((ts) =>
                    ts.map((x) =>
                      x.id === t.id ? { ...x, offset_days: e.target.value } : x,
                    ),
                  )
                }
              />
              <Select
                label="Reference date"
                value={t.reference_date || "ceremony"}
                onChange={(e) =>
                  setTemplates((ts) =>
                    ts.map((x) =>
                      x.id === t.id
                        ? { ...x, reference_date: e.target.value }
                        : x,
                    ),
                  )
                }
              >
                <option value="ceremony">Ceremony</option>
                <option value="checkout">Check-out</option>
              </Select>
              <Input
                label="Task owner"
                value={t.owner || ""}
                onChange={(e) =>
                  setTemplates((ts) =>
                    ts.map((x) =>
                      x.id === t.id ? { ...x, owner: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                disabled={busy}
                className="btn-secondary"
                onClick={() =>
                  action(
                    () => api.put(`/api/operations/templates/${t.id}`, t),
                    "Template saved",
                  )
                }
              >
                Save template
              </button>
            </div>
          ))}
        </div>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            action(async () => {
              await api.post("/api/operations/templates", template);
              setTemplates((await api.get("/api/operations/templates")).data);
              setTemplate({ title: "", offset_days: -7, owner: "" });
            }, "Task template added");
          }}
        >
          <Input
            label="New task title"
            required
            value={template.title}
            onChange={(e) =>
              setTemplate((t) => ({ ...t, title: e.target.value }))
            }
          />
          <Input
            label="New task offset (days)"
            type="number"
            required
            value={template.offset_days}
            onChange={(e) =>
              setTemplate((t) => ({ ...t, offset_days: e.target.value }))
            }
          />
          <Select
            label="New task reference date"
            value={template.reference_date || "ceremony"}
            onChange={(e) =>
              setTemplate((t) => ({ ...t, reference_date: e.target.value }))
            }
          >
            <option value="ceremony">Ceremony</option>
            <option value="checkout">Check-out</option>
          </Select>
          <Input
            label="New task owner"
            value={template.owner}
            onChange={(e) =>
              setTemplate((t) => ({ ...t, owner: e.target.value }))
            }
          />
          <button className="btn-primary" disabled={busy}>
            Add task template
          </button>
        </form>
      </Modal>
    </section>
  );
}
