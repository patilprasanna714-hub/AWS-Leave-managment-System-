import { useEffect, useState, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import ApprovalsList from '../components/ApprovalsList';
import AbsenceCalendar from '../components/AbsenceCalendar';
import { useAuth } from '../context/AuthContext';
import {
  getPendingApprovals,
  getCalendar,
  getLeaveConfig,
  updateLeaveConfig,
  downloadReportCsv
} from '../api/apiclient';

export default function HRDashboard() {
  const { user } = useAuth();
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [config, setConfig] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);

  const refresh = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const [p, a, c] = await Promise.all([
      getPendingApprovals(user.id || user.employee_id || 'MGR-01'),
      getCalendar(start, end),
      getLeaveConfig()
    ]);
    setPending(p);
    setApproved(a);
    setConfig(c);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleSaveConfig(e) {
    e.preventDefault();
    await updateLeaveConfig(config);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  async function handleDownload() {
    const csv = await downloadReportCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leave-summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const now = new Date();

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="page-header">
          <div>
            <h1>HR Console</h1>
            <p>Approvals escalated to HR, org-wide calendar, and leave policy configuration.</p>
          </div>
          <button className="btn btn-ghost" onClick={handleDownload}>Download report (CSV)</button>
        </div>

        <div className="card-section">
          <h2>Pending HR approvals ({pending.length})</h2>
          <ApprovalsList requests={pending} role={user.role} onChanged={refresh} />
        </div>

        <div className="card-section">
          <h2>Org absence calendar</h2>
          <AbsenceCalendar approvedRequests={approved} year={now.getFullYear()} month={now.getMonth()} />
        </div>

        {config && (
          <div className="card-section">
            <h2>Leave policy configuration</h2>
            {savedMsg && <div className="form-msg success">Configuration saved.</div>}
            <form onSubmit={handleSaveConfig}>
              <div className="form-row">
                <div className="field">
                  <label>HR approval threshold (days)</label>
                  <input
                    type="number"
                    value={config.hrApprovalThresholdDays}
                    onChange={(e) =>
                      setConfig({ ...config, hrApprovalThresholdDays: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="field">
                  <label>Manager timeout (hours)</label>
                  <input
                    type="number"
                    value={config.managerTimeoutHours}
                    onChange={(e) =>
                      setConfig({ ...config, managerTimeoutHours: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <button className="btn btn-primary">Save configuration</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
