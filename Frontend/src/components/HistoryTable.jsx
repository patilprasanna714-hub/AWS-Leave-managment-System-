import StatusPill from './StatusPill';
import { cancelLeaveRequest } from '../api/apiclient';

export default function HistoryTable({ requests, onChanged }) {
  if (!requests.length) {
    return <div className="empty-state">No leave requests yet. Apply above to see history here.</div>;
  }

  async function handleCancel(id) {
    await cancelLeaveRequest(id);
    onChanged?.();
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Dates</th>
          <th>Days</th>
          <th>Status</th>
          <th>Reason</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => (
          <tr key={r.request_id}>
            <td>{r.leave_type}</td>
            <td>{r.start_date} → {r.end_date}</td>
            <td>{r.days_requested}</td>
            <td><StatusPill status={r.status} /></td>
            <td style={{ color: 'var(--text-muted)' }}>{r.reason || '—'}</td>
            <td>
              {r.status.startsWith('PENDING') && (
                <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(r.request_id)}>
                  Cancel
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
