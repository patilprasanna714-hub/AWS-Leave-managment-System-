import { useState } from 'react';
import { submitLeaveRequest } from '../api/apiclient';

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}

export default function LeaveForm({ employeeId, onSubmitted }) {
  const [form, setForm] = useState({ leave_type: 'CASUAL', start_date: '', end_date: '', reason: '' });
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const days = daysBetween(form.start_date, form.end_date);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!form.start_date || !form.end_date) {
      setMsg({ type: 'error', text: 'Please select both start and end dates.' });
      return;
    }
    if (days <= 0) {
      setMsg({ type: 'error', text: 'End date must be on or after the start date.' });
      return;
    }

    setLoading(true);
    try {
      const result = await submitLeaveRequest({
        employee_id: employeeId,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        days_requested: days,
        reason: form.reason,
        manager_id: 'MGR-01'
      });

      if (result.status === 'AUTO_REJECTED') {
        setMsg({ type: 'error', text: result.reason });
      } else {
        setMsg({ type: 'success', text: `Request submitted (${result.request_id}). Waiting for manager approval.` });
        setForm({ leave_type: 'CASUAL', start_date: '', end_date: '', reason: '' });
      }
      onSubmitted?.();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {msg && <div className={`form-msg ${msg.type}`}>{msg.text}</div>}

      <div className="form-row">
        <div className="field">
          <label>Leave type</label>
          <select value={form.leave_type} onChange={(e) => update('leave_type', e.target.value)}>
            <option value="CASUAL">Casual</option>
            <option value="SICK">Sick</option>
            <option value="EARNED">Earned</option>
            <option value="UNPAID">Unpaid</option>
          </select>
        </div>
        <div className="field">
          <label>Days requested</label>
          <input value={days || ''} disabled placeholder="Auto-calculated" />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Start date</label>
          <input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
        </div>
        <div className="field">
          <label>End date</label>
          <input type="date" value={form.end_date} onChange={(e) => update('end_date', e.target.value)} />
        </div>
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <label>Reason (optional)</label>
        <textarea rows={2} value={form.reason} onChange={(e) => update('reason', e.target.value)} />
      </div>

      <button className="btn btn-primary" disabled={loading}>
        {loading ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
