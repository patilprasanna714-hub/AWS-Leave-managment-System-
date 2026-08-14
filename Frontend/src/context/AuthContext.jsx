import { createContext, useContext, useState } from 'react';
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';

const AuthContext = createContext(null);

const roleToRoute = {
  Employee: '/employee',
  Manager: '/manager',
  HRAdmin: '/hr',
};

function getRoleFromGroups(groups = []) {
  if (groups.includes('HRAdmin')) return 'HRAdmin';
  if (groups.includes('Manager')) return 'Manager';
  if (groups.includes('Employee')) return 'Employee';

  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadCurrentUser() {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();

      const groups =
        session.tokens?.idToken?.payload?.['cognito:groups'] || [];

      const role = getRoleFromGroups(groups);

      if (!role) {
        console.error('User does not belong to a valid SLAMS group.');
        await signOut();
        setUser(null);
        return null;
      }

      const loggedInUser = {
        id: currentUser.userId,
        employee_id: currentUser.userId,
        email: currentUser.signInDetails?.loginId || '',
        role,
      };

      setUser(loggedInUser);
      return loggedInUser;
    } catch {
      setUser(null);
      return null;
    }
  }

  async function login(email, password) {
    try {
      // Check whether another Cognito user is already signed in
      try {
        await getCurrentUser();
        await signOut();
      } catch {
        // No existing user — continue normally
      }

      const result = await signIn({
        username: email,
        password,
      });

      if (!result.isSignedIn) {
        return {
          needsConfirmation: true,
          nextStep: result.nextStep,
        };
      }

      return await loadCurrentUser();
    } catch (error) {
      console.error('Cognito login failed:', error);
      throw error;
    }
  }

  async function logout() {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }

    setUser(null);
  }

  async function initializeAuth() {
    await loadCurrentUser();
    setLoading(false);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        initializeAuth,
        roleToRoute,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}