import { useEffect, useState, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import BalanceCard from '../components/BalanceCard';
import LeaveForm from '../components/LeaveForm';
import HistoryTable from '../components/HistoryTable';
import { useAuth } from '../context/AuthContext';
import { getBalances, getLeaveHistory } from '../api/apiclient';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [balances, setBalances] = useState({});
  const [history, setHistory] = useState([]);

  const refresh = useCallback(async () => {
    const [b, h] = await Promise.all([
      getBalances(user.employee_id),
      getLeaveHistory(user.employee_id)
    ]);
    setBalances(b);
    setHistory(h);
  }, [user.employee_id]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="page-header">
          <div>
            <h1>My Leave</h1>
            <p>Apply for leave and track your balance and request history.</p>
          </div>
        </div>

        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          {Object.entries(balances).map(([type, b]) => (
            <BalanceCard key={type} type={type} {...b} />
          ))}
        </div>

        <div className="card-section">
          <h2>Apply for leave</h2>
          <LeaveForm employeeId={user.employee_id} onSubmitted={refresh} />
        </div>

        <div className="card-section">
          <h2>My requests</h2>
          <HistoryTable requests={history} onChanged={refresh} />
        </div>
      </main>
    </div>
  );
}
