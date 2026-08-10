import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { user, logout } = useAuth();

  const linksByRole = {
    Employee: [{ to: '/employee', label: 'My Leave' }],
    Manager: [{ to: '/manager', label: 'Team Approvals' }],
    HRAdmin: [{ to: '/hr', label: 'HR Console' }]
  };

  const links = linksByRole[user?.role] || [];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="mark">SLAMS</span>
        <span className="name">Leave Management</span>
      </div>
      <nav className="sidebar-nav">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {l.label}
          </NavLink>
        ))}
        <button onClick={logout}>Sign out</button>
      </nav>
      <div className="sidebar-footer">
        <span className="role-badge">{user?.role}</span>
        <div>{user?.name}</div>
      </div>
    </aside>
  );
}
