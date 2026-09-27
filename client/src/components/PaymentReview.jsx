import { useState, useEffect } from "react";
import toast from "react-hot-toast";
export default function PaymentReview({ api, onChange }) {
  const [unmatched, setUnmatched] = useState([]);
  const [rows, setRows] = useState([]),
    [busy, setBusy] = useState(null),
    [error, setError] = useState("");
  async function load() {
    try {
      setRows((await api.get("/api/operations/checkout-review")).data);
      setUnmatched(
        (await api.get("/api/operations/unmatched-card-receipts")).data,
      );
      setError("");
    } catch {
      setError("Could not load card receipts needing review");
    }
  }
  useEffect(() => {
    load();
  }, []);
  return error ? (
    <div className="card p-4 text-red-600">
      {error}
      <button className="btn-secondary" onClick={load}>
        Try again
      </button>
    </div>
  ) : rows.length || unmatched.length ? (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold text-amber-700">
        Card receipts need reconciliation
      </h2>
      {unmatched.map((r) => (
        <div key={r.id} className="text-sm text-amber-700">
          <p>
            Unmatched provider receipt: {r.currency.toUpperCase()}{" "}
            {(r.amount_cents / 100).toFixed(2)} · {r.id}
          </p>
          <p className="text-xs">
            {r.reason} Ask the owner to match or refund this in the provider
            dashboard before recording an allocation.
          </p>
          <button
            className="btn-secondary mt-2"
            disabled={busy === r.id}
            onClick={async () => {
              const reason = window.prompt(
                "After checking the provider and CRM payment history, explain how this receipt was matched or refunded. This closes the review without recording new money.",
              );
              if (!reason?.trim()) return;
              setBusy(r.id);
              try {
                await api.post(
                  `/api/operations/unmatched-card-receipts/${r.id}/resolve`,
                  { reason },
                );
                await load();
                toast.success("Review closed; receipt retained in history");
              } catch (e) {
                toast.error(
                  e.response?.data?.error || "Could not close review",
                );
              } finally {
                setBusy(null);
              }
            }}
          >
            Close reviewed receipt
          </button>
        </div>
      ))}
      {rows.map((r) => (
        <div key={r.id} className="text-sm">
          <p>
            {[r.partner1_name, r.partner2_name].filter(Boolean).join(" & ")} · $
            {(r.amount_cents / 100).toFixed(2)} · {r.id}
          </p>
          <p className="text-xs text-gray-500">{r.error}</p>
          <button
            className="btn-secondary mt-2"
            disabled={busy === r.id}
            onClick={async () => {
              const reason = window.prompt(
                "Review the provider receipt and invoice first. Explain why this receipt should be applied to the revised invoice.",
              );
              if (!reason?.trim()) return;
              setBusy(r.id);
              try {
                await api.post(
                  `/api/operations/checkout-review/${r.id}/accept`,
                  { reason },
                );
                toast.success("Card receipt reconciled");
                await load();
                onChange?.();
              } catch (e) {
                toast.error(
                  e.response?.data?.error || "Could not reconcile receipt",
                );
              } finally {
                setBusy(null);
              }
            }}
          >
            Review and apply receipt
          </button>
        </div>
      ))}
    </div>
  ) : null;
}
