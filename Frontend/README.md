# SLAMS Frontend

React frontend for the Smart Leave \& Absence Management System (SLAMS), covering
all three roles defined in the Technical Implementation Document: Employee,
Manager, and HR Admin.

This is currently wired to a **mock API layer** so the UI can be developed,
demoed, and reviewed independently of backend progress. Once the backend team
delivers the real API, only one file needs to change (see "Connecting to the
real backend" below) — the rest of the UI code stays as-is.

## Getting started

**Prerequisites:** Node.js (LTS) installed — check with `node -v` and `npm -v`.

```bash
npm install
npm run dev
```

Open the printed local URL (e.g. `http://localhost:5173`) in a browser. Sign in
by selecting a role (Employee / Manager / HR Admin) — auth is mocked for now.

## Project structure

```
src/
  api/mockApi.js         Mock backend layer (see mapping table below)
  context/AuthContext.jsx Session/role state
  components/             Reusable UI pieces (form, table, calendar, etc.)
  pages/
    Login.jsx
    EmployeeDashboard.jsx
    ManagerDashboard.jsx
    HRDashboard.jsx
  App.jsx                 Routing and role-based route protection
```

## Features by role

**Employee** — leave balance cards, apply-leave form with automatic day
calculation and balance/overlap validation, leave history with cancel action.

**Manager** — pending approvals list with approve/reject actions, team absence
calendar.

**HR Admin** — HR-level escalated approvals, org-wide absence calendar, leave
policy configuration (HR approval threshold, manager timeout), CSV report
download.

## Connecting to the real backend

Every function in `src/api/mockApi.js` is named and shaped to match an endpoint
in the Technical Implementation Document (Section 8, API Design):

|Frontend function|Backend endpoint|
|-|-|
|`getBalances()`|`GET /balances/{employee\\\_id}`|
|`getLeaveHistory()`|`GET /leave-requests/{employee\\\_id}`|
|`submitLeaveRequest()`|`POST /leave-requests`|
|`cancelLeaveRequest()`|`POST /leave-requests/{id}/cancel`|
|`getPendingApprovals()`|`GET /approvals/pending`|
|`approveRequest()` / `rejectRequest()`|`GET /approve` / `GET /reject`|
|`getCalendar()`|`GET /calendar`|
|`getLeaveConfig()` / `updateLeaveConfig()`|`GET` / `PUT /config/leave-types`|
|`downloadReportCsv()`|`GET /reports/leave-summary`|

Once API Gateway and the Lambda functions are deployed:

1. Set `BASE\\\_URL` at the top of `mockApi.js` to the API Gateway invoke URL.
2. Inside each function, replace the mock logic with a `fetch()` call to the
corresponding endpoint, keeping the function name and return shape
unchanged.
3. Replace the mock `login()` in `AuthContext.jsx` with Cognito Hosted UI or
Amplify Auth.

Because function signatures already match the API contract, no changes are
required in `components/` or `pages/`.

## Production build

```bash
npm run build
```

Outputs static files to `dist/`.

## Deploying to Amazon S3 (static website hosting)

1. Create an S3 bucket (globally unique name, e.g. `slams-frontend-f13`).
2. Bucket → Permissions → disable "Block public access".
3. Bucket → Properties → enable Static website hosting. Set index document to
`index.html` and error document to `index.html` (required for SPA routing).
4. Bucket → Permissions → Bucket Policy:

```json
   {
     "Version": "2012-10-17",
     "Statement": \\\[
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "\\\*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::slams-frontend-f13/\\\*"
       }
     ]
   }
   ```

5. Upload the contents of `dist/` (not the folder itself) to the bucket.
6. The bucket's website endpoint (Properties tab) is the live URL.

(CloudFront can be added later for HTTPS/caching per Section 9.3 of the
Technical Implementation Document.)



