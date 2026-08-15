import { fetchAuthSession } from 'aws-amplify/auth';

// ============================================================
// API CONFIGURATION
// ============================================================

const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'ap-south-1';

let API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `https://0qg3z5d142.execute-api.${AWS_REGION}.amazonaws.com`;

// Remove accidental JavaScript assignment if it exists
API_BASE_URL = API_BASE_URL
  .replace(/^const\s+API_GATEWAY_URL\s*=\s*/i, '')
  .replace(/^VITE_API_BASE_URL\s*=\s*/i, '')
  .trim();

// Remove trailing slash
API_BASE_URL = API_BASE_URL.replace(/\/+$/, '');

// IMPORTANT:
// API_BASE_URL must be the base URL, NOT /leave
API_BASE_URL = API_BASE_URL.replace(/\/leave\/?$/i, '');

console.log('========================================');
console.log('SLAMS API CLIENT');
console.log('API BASE URL:', API_BASE_URL);
console.log('========================================');


// ============================================================
// AUTHENTICATION
// ============================================================

async function getAuthHeaders() {
  const session = await fetchAuthSession();

  const token = session.tokens?.idToken?.toString();

  if (!token) {
    throw new Error('No authenticated Cognito session found.');
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}


// ============================================================
// GENERIC API REQUEST
// ============================================================

export async function apiRequest(path, options = {}) {
  const cleanPath = path.startsWith('/')
    ? path
    : `/${path}`;

  const url = `${API_BASE_URL}${cleanPath}`;

  console.log('----------------------------------------');
  console.log('API REQUEST');
  console.log('URL:', url);
  console.log('METHOD:', options.method || 'GET');
  console.log('----------------------------------------');

  try {
    const authHeaders = await getAuthHeaders();

    const headers = {
      ...authHeaders,
      ...(options.headers || {}),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const requestOptions = {
      ...options,
      cache: 'no-store',
      headers,
    };

    const response = await fetch(url, requestOptions);

    console.log('API RESPONSE:', response.status);
    console.log('URL:', url);

    if (!response.ok) {
      let message = `API request failed (${response.status})`;

      try {
        const errorData = await response.json();

        message =
          errorData.message ||
          errorData.error ||
          errorData.detail ||
          message;

        console.error('API ERROR:', errorData);
      } catch {
        // Response isn't JSON
      }

      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    const contentType =
      response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();

  } catch (error) {
    console.error('========================================');
    console.error('API REQUEST FAILED');
    console.error('URL:', url);
    console.error('ERROR:', error);
    console.error('========================================');

    throw error;
  }
}


// ============================================================
// EMPLOYEE
// ============================================================

// GET /balances/{employee_id}
export async function getBalances(employeeId) {
  if (!employeeId) {
    throw new Error('Employee ID is required.');
  }

  return apiRequest(
    `/balances/${encodeURIComponent(employeeId)}`
  );
}


// GET /leave-requests/{employee_id}
export async function getLeaveHistory(employeeId) {
  if (!employeeId) {
    throw new Error('Employee ID is required.');
  }

  return apiRequest(
    `/leave-requests/${encodeURIComponent(employeeId)}`
  );
}


// POST /leave-requests
export async function submitLeaveRequest(payload) {
  if (!payload) {
    throw new Error('Leave request data is required.');
  }

  console.log('SUBMIT LEAVE PAYLOAD:', payload);

  return apiRequest('/leave-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


// POST /leave-requests/{request_id}/cancel
export async function cancelLeaveRequest(requestId) {
  if (!requestId) {
    throw new Error('Request ID is required.');
  }

  return apiRequest(
    `/leave-requests/${encodeURIComponent(requestId)}/cancel`,
    {
      method: 'POST',
    }
  );
}


// ============================================================
// MANAGER
// ============================================================

// GET /approvals/pending?manager_id={manager_id} or ?role=HRAdmin
export async function getPendingApprovals(target) {
  if (!target) {
    throw new Error('Approval target is required.');
  }

  if (target === 'HRAdmin') {
    return apiRequest('/approvals/pending?role=HRAdmin');
  }

  const params = new URLSearchParams({
    manager_id: target,
  });

  return apiRequest(
    `/approvals/pending?${params.toString()}`
  );
}


// GET /calendar?start_date={date}&end_date={date}
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

  return apiRequest(
    `/calendar?${params.toString()}`
  );
}


// ============================================================
// APPROVAL
// ============================================================

// GET /approve?token=...&action=approve
// Accept either a signed approval token or a direct request_id.
export async function approveRequest(tokenOrRequestId, role) {
  if (!tokenOrRequestId) {
    throw new Error('Approval target is required.');
  }

  const params = new URLSearchParams({
    action: 'approve',
  });

  if (typeof tokenOrRequestId === 'string' && tokenOrRequestId.includes('.')) {
    params.set('token', tokenOrRequestId);
  } else {
    params.set('request_id', tokenOrRequestId);
    if (role) params.set('role', role);
  }

  return apiRequest(
    `/approve?${params.toString()}`
  );
}


// GET /approve?token=...&action=reject
export async function rejectRequest(tokenOrRequestId, role) {
  if (!tokenOrRequestId) {
    throw new Error('Approval target is required.');
  }

  const params = new URLSearchParams({
    action: 'reject',
  });

  if (typeof tokenOrRequestId === 'string' && tokenOrRequestId.includes('.')) {
    params.set('token', tokenOrRequestId);
  } else {
    params.set('request_id', tokenOrRequestId);
    if (role) params.set('role', role);
  }

  return apiRequest(
    `/approve?${params.toString()}`
  );
}


// ============================================================
// HR
// ============================================================

// GET /reports/leave-summary
export async function getLeaveSummary() {
  return apiRequest('/reports/leave-summary');
}


// HR calendar
export async function getHRCalendar(startDate, endDate) {
  return getCalendar(startDate, endDate);
}


// PUT /config/leave-types
export async function getLeaveConfig() {
  return apiRequest('/config/leave-types');
}

export async function updateLeaveConfig(payload) {
  if (!payload) {
    throw new Error(
      'Leave configuration data is required.'
    );
  }

  return apiRequest('/config/leave-types', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function downloadReportCsv() {
  const result = await apiRequest('/reports/leave-summary');
  return typeof result === 'string' ? result : JSON.stringify(result);
}