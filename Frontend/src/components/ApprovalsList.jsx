import { useState } from 'react';
import { approveRequest, rejectRequest } from '../api/apiclient';

export default function ApprovalsList({ requests, role, onChanged }) {
  const [busyId, setBusyId] = useState(null);

  async function handle(action, request) {
    setBusyId(request.request_id);
    try {
      if (action === 'approve') {
        await approveRequest(request.request_id, role);
      } else {
        await rejectRequest(request.request_id, role);
      }
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  }

  if (!requests.length) {
    return <div className="empty-state">No pending approvals right now. 🎉</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Type</th>
          <th>Dates</th>
          <th>Days</th>
          <th>Reason</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => (
          <tr key={r.request_id}>
            <td>{r.employee_name || r.employee_id}</td>
            <td>{r.leave_type}</td>
            <td>{r.start_date} → {r.end_date}</td>
            <td>{r.days_requested}</td>
            <td style={{ color: 'var(--text-muted)' }}>{r.reason || '—'}</td>
            <td style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-approve btn-sm"
                disabled={busyId === r.request_id}
                onClick={() => handle('approve', r)}
              >
                Approve
              </button>
              <button
                className="btn btn-reject btn-sm"
                disabled={busyId === r.request_id}
                onClick={() => handle('reject', r)}
              >
                Reject
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
