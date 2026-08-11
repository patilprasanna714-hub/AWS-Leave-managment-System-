import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const roleToRoute = {
  Employee: '/employee',
  Manager: '/manager',
  HRAdmin: '/hr',
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      const user = await login(email, password);

      if (!user || !user.role) {
        throw new Error('Your account does not have a valid role.');
      }

      navigate(roleToRoute[user.role]);
    } catch (err) {
      console.error('Login error:', err);

      if (err.name === 'NotAuthorizedException') {
        setError('Incorrect email or password.');
      } else if (err.name === 'UserNotFoundException') {
        setError('User does not exist.');
      } else if (err.name === 'UserNotConfirmedException') {
        setError('Your account has not been confirmed.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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
              required
            />
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p
              style={{
                color: 'var(--danger, #dc2626)',
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              {error}
            </p>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p
          style={{
            fontSize: 11.5,
            color: 'var(--text-muted)',
            marginTop: 16,
          }}
        >
          Sign in securely using your F13 Technologies account.
        </p>
      </div>
    </div>
  );
}