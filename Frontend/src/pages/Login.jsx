import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const roleToRoute = { Employee: '/employee', Manager: '/manager', HRAdmin: '/hr' };

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Employee');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const user = await login(email || 'prasanna@f13.com', role);
    setLoading(false);
    navigate(roleToRoute[user.role]);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="mark">SLAMS</span>
        <h1>Sign in</h1>
        <p className="sub">Smart Leave &amp; Absence Management System</p>

        <form onSubmit={handleSubmit}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Email</label>
            <input
              type="email"
              placeholder="you@f13technologies.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>Sign in as</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="Employee">Employee</option>
              <option value="Manager">Manager</option>
              <option value="HRAdmin">HR Admin</option>
            </select>
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16 }}>
          This is a mock sign-in for frontend development. It will be replaced by
          Amazon Cognito hosted UI once Member 2 wires up authentication.
        </p>
      </div>
    </div>
  );
}
