/*
  mockApi.js
  ----------
  Har function ka naam aur shape EXACTLY us API endpoint se match karta hai
  jo Technical Implementation Document ke Section 8 (API Design) mein hai.

  ABHI: sab kuch in-memory mock data se chal raha hai, taaki frontend
  turant test ho sake bina backend ka wait kiye.

  JAB Member 2 (Auth & API Gateway) ka real API Gateway URL ban jaye:
  1. Neeche BASE_URL set karo (API Gateway invoke URL)
  2. Har function ke andar wala mock code hata ke fetch() call daal do
  3. Function ka NAAM aur RETURN SHAPE same rakhna - baaki UI code
     bilkul nahi badalna padega.

  Example real call (jab backend ready ho):
    export async function submitLeaveRequest(payload) {
      const res = await fetch(`${BASE_URL}/leave-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Request failed');
      return res.json();
    }
*/

const BASE_URL = 'https://REPLACE-WITH-API-GATEWAY-URL.execute-api.ap-south-1.amazonaws.com/prod';

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

// ---------------- Mock data store ----------------

let leaveConfig = {
  SICK: { entitled: 12 },
  CASUAL: { entitled: 8 },
  EARNED: { entitled: 15 },
  UNPAID: { entitled: 0 },
  hrApprovalThresholdDays: 5,
  managerTimeoutHours: 48
};

let leaveBalances = {
  'EMP-101': {
    SICK: { entitled: 12, used: 2, carry_forward: 0 },
    CASUAL: { entitled: 8, used: 3, carry_forward: 1 },
    EARNED: { entitled: 15, used: 5, carry_forward: 2 },
    UNPAID: { entitled: 0, used: 0, carry_forward: 0 }
  }
};

let leaveRequests = [
  {
    request_id: 'REQ-1001',
    employee_id: 'EMP-101',
    employee_name: 'Prasanna Patil',
    leave_type: 'CASUAL',
    start_date: '2026-08-18',
    end_date: '2026-08-19',
    days_requested: 2,
    status: 'PENDING_MANAGER',
    manager_id: 'MGR-01',
    reason: 'Family function',
    created_at: '2026-08-09'
  },
  {
    request_id: 'REQ-1000',
    employee_id: 'EMP-101',
    employee_name: 'Prasanna Patil',
    leave_type: 'SICK',
    start_date: '2026-07-20',
    end_date: '2026-07-20',
    days_requested: 1,
    status: 'APPROVED',
    manager_id: 'MGR-01',
    reason: 'Fever',
    created_at: '2026-07-19'
  },
  {
    request_id: 'REQ-0998',
    employee_id: 'EMP-102',
    employee_name: 'Ayan Bose',
    leave_type: 'EARNED',
    start_date: '2026-08-22',
    end_date: '2026-08-26',
    days_requested: 5,
    status: 'PENDING_MANAGER',
    manager_id: 'MGR-01',
    reason: 'Travel',
    created_at: '2026-08-08'
  }
];

let requestSeq = 1002;

// ---------------- Auth (mock Cognito login) ----------------
// Real endpoint: Cognito hosted UI / SDK sign-in, not a custom REST route
export async function login({ email, role }) {
  await delay(300);
  return {
    token: 'mock-jwt-token',
    user: {
      employee_id: role === 'Employee' ? 'EMP-101' : role === 'Manager' ? 'MGR-01' : 'HR-01',
      name: email.split('@')[0],
      email,
      role // 'Employee' | 'Manager' | 'HRAdmin'
    }
  };
}

// GET /balances/{employee_id}
export async function getBalances(employeeId) {
  await delay();
  return leaveBalances[employeeId] || {};
}

// GET /leave-requests/{employee_id}
export async function getLeaveHistory(employeeId) {
  await delay();
  return leaveRequests
    .filter((r) => r.employee_id === employeeId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// POST /leave-requests
export async function submitLeaveRequest(payload) {
  await delay(500);
  const bal = leaveBalances[payload.employee_id]?.[payload.leave_type];
  const available = bal ? bal.entitled + bal.carry_forward - bal.used : 0;

  // Mirrors Section 7.1 - balance check at submission
  if (available < payload.days_requested) {
    const rejected = {
      request_id: `REQ-${requestSeq++}`,
      ...payload,
      status: 'AUTO_REJECTED',
      created_at: new Date().toISOString().slice(0, 10),
      reason: `Insufficient balance: only ${available} day(s) available`
    };
    leaveRequests.unshift(rejected);
    return rejected;
  }

  // Mirrors Section 7.2 - overlap detection
  const overlap = leaveRequests.some(
    (r) =>
      r.employee_id === payload.employee_id &&
      ['PENDING_MANAGER', 'PENDING_HR', 'APPROVED'].includes(r.status) &&
      !(payload.end_date < r.start_date || payload.start_date > r.end_date)
  );
  if (overlap) {
    throw new Error('Dates overlap with an existing pending/approved request.');
  }

  const newRequest = {
    request_id: `REQ-${requestSeq++}`,
    ...payload,
    status: 'PENDING_MANAGER',
    created_at: new Date().toISOString().slice(0, 10)
  };
  leaveRequests.unshift(newRequest);
  return newRequest;
}

// POST /leave-requests/{request_id}/cancel
export async function cancelLeaveRequest(requestId) {
  await delay(300);
  const r = leaveRequests.find((x) => x.request_id === requestId);
  if (r && r.status.startsWith('PENDING')) r.status = 'CANCELLED';
  return r;
}

// GET /approvals/pending  (role-aware: Manager sees PENDING_MANAGER, HR sees PENDING_HR)
export async function getPendingApprovals(role) {
  await delay();
  const wanted = role === 'HRAdmin' ? 'PENDING_HR' : 'PENDING_MANAGER';
  return leaveRequests.filter((r) => r.status === wanted);
}

// GET /approve?token=...  (in real app this is the signed-link Lambda; UI button simulates it)
export async function approveRequest(requestId, role) {
  await delay(400);
  const r = leaveRequests.find((x) => x.request_id === requestId);
  if (!r) return null;
  if (role === 'Manager') {
    r.status = r.days_requested > leaveConfig.hrApprovalThresholdDays ? 'PENDING_HR' : 'APPROVED';
  } else {
    r.status = 'APPROVED';
  }
  if (r.status === 'APPROVED') {
    const bal = leaveBalances[r.employee_id]?.[r.leave_type];
    if (bal) bal.used += r.days_requested; // finalizeApprovalRequest equivalent
  }
  return r;
}

// GET /reject?token=...
export async function rejectRequest(requestId) {
  await delay(400);
  const r = leaveRequests.find((x) => x.request_id === requestId);
  if (r) r.status = 'REJECTED';
  return r;
}

// GET /calendar?from=&to=
export async function getCalendar() {
  await delay();
  return leaveRequests.filter((r) => r.status === 'APPROVED');
}

// GET /config/leave-types (read) + PUT /config/leave-types (HR write)
export async function getLeaveConfig() {
  await delay();
  return leaveConfig;
}
export async function updateLeaveConfig(newConfig) {
  await delay(300);
  leaveConfig = { ...leaveConfig, ...newConfig };
  return leaveConfig;
}

// GET /reports/leave-summary (HR download)
export async function downloadReportCsv() {
  await delay(300);
  const header = 'request_id,employee_id,leave_type,start_date,end_date,days,status\n';
  const rows = leaveRequests
    .map((r) => `${r.request_id},${r.employee_id},${r.leave_type},${r.start_date},${r.end_date},${r.days_requested},${r.status}`)
    .join('\n');
  return header + rows;
}
