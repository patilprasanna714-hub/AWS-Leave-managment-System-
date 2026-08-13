import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://9jtnqows6b.execute-api.ap-south-1.amazonaws.com';

console.log('REAL API CLIENT LOADED');
console.log('API BASE URL:', API_BASE_URL);

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
  const url = `${API_BASE_URL}${path}`;

  console.log('API REQUEST:', url);
  console.log('API METHOD:', options.method || 'GET');

  const headers = await getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  console.log('API RESPONSE:', response.status, url);

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    try {
      const errorData = await response.json();

      message =
        errorData.message ||
        errorData.error ||
        errorData.detail ||
        message;
    } catch {
      // Response was not JSON
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type');

  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

/*
|--------------------------------------------------------------------------
| EMPLOYEE APIs
|--------------------------------------------------------------------------
*/

/**
 * GET /balances/{employee_id}
 */
export async function getBalances(employeeId) {
  if (!employeeId) {
    throw new Error('Employee ID is required.');
  }

  return apiRequest(
    `/balances/${encodeURIComponent(employeeId)}`
  );
}

/**
 * GET /leave-requests/{employee_id}
 */
export async function getLeaveHistory(employeeId) {
  if (!employeeId) {
    throw new Error('Employee ID is required.');
  }

  return apiRequest(
    `/leave-requests/${encodeURIComponent(employeeId)}`
  );
}

/**
 * POST /leave
 */
export async function submitLeaveRequest(payload) {
  return apiRequest('/leave', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * POST /leave/{request_id}/cancel
 */
export async function cancelLeaveRequest(requestId) {
  if (!requestId) {
    throw new Error('Request ID is required.');
  }

  return apiRequest(
    `/leave/${encodeURIComponent(requestId)}/cancel`,
    {
      method: 'POST',
    }
  );
}

/*
|--------------------------------------------------------------------------
| MANAGER / HR APIs
|--------------------------------------------------------------------------
*/

/**
 * GET /approvals/pending?manager_id={manager_id}
 */
export async function getPendingApprovals(managerId) {
  if (!managerId) {
    throw new Error('Manager ID is required.');
  }

  return apiRequest(
    `/approvals/pending?manager_id=${encodeURIComponent(managerId)}`
  );
}

/**
 * GET /calendar?start_date={date}&end_date={date}
 */
export async function getCalendar(startDate, endDate) {
  if (!startDate || !endDate) {
    throw new Error(
      'Start date and end date are required for calendar.'
    );
  }

  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  return apiRequest(`/calendar?${params.toString()}`);
}

/*
|--------------------------------------------------------------------------
| APPROVAL APIs
|--------------------------------------------------------------------------
*/

/**
 * GET /approve?token={token}&action=approve
 */
export async function approveRequest(token) {
  if (!token) {
    throw new Error('Approval token is required.');
  }

  return apiRequest(
    `/approve?token=${encodeURIComponent(token)}&action=approve`
  );
}

/**
 * GET /approve?token={token}&action=reject
 */
export async function rejectRequest(token) {
  if (!token) {
    throw new Error('Approval token is required.');
  }

  return apiRequest(
    `/approve?token=${encodeURIComponent(token)}&action=reject`
  );
}