import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function getAuthHeaders() {
  const session = await fetchAuthSession();

  const token = session.tokens?.idToken?.toString();

  if (!token) {
    throw new Error('No authenticated Cognito session found.');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function apiRequest(path, options = {}) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    try {
      const errorData = await response.json();
      message = errorData.message || errorData.error || message;
    } catch {
      // Response wasn't JSON
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}