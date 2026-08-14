import { useEffect, useState, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import ApprovalsList from '../components/ApprovalsList';
import AbsenceCalendar from '../components/AbsenceCalendar';
import { useAuth } from '../context/AuthContext';
import { getPendingApprovals, getCalendar } from '../api/apiclient';

const DEFAULT_MANAGER_ID = 'MGR-01';

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);

  const refresh = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const [p, a] = await Promise.all([
      getPendingApprovals(DEFAULT_MANAGER_ID),
      getCalendar(start, end),
    ]);

    setPending(p);
    setApproved(a);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const now = new Date();

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="page-header">
          <div>
            <h1>Team Approvals</h1>
            <p>Review pending leave requests and see who's out this month.</p>
          </div>
        </div>

        <div className="card-section">
          <h2>Pending approvals ({pending.length})</h2>
          <ApprovalsList requests={pending} role={user.role} onChanged={refresh} />
        </div>

        <div className="card-section">
          <h2>Team absence calendar</h2>
          <AbsenceCalendar approvedRequests={approved} year={now.getFullYear()} month={now.getMonth()} />
        </div>
      </main>
    </div>
  );
}
