import { createContext, useContext, useState } from 'react';
import { login as apiLogin } from '../api/mockApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('slams_user');
    return saved ? JSON.parse(saved) : null;
  });

  async function login(email, role) {
    const { user: loggedInUser } = await apiLogin({ email, role });
    setUser(loggedInUser);
    sessionStorage.setItem('slams_user', JSON.stringify(loggedInUser));
    return loggedInUser;
  }

  function logout() {
    setUser(null);
    sessionStorage.removeItem('slams_user');
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
