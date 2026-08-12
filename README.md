# Smart Leave & Absence Management System (SLAMS)

Welcome to the **AWS Leave Management System (SLAMS)**! This project is a comprehensive, serverless cloud application built on AWS to handle employee leave requests, multi-level approvals, and automated balance tracking.

## Overview

SLAMS automates the end-to-end leave lifecycle. It provides secure authentication, role-based access control (Employee, Manager, HRAdmin), and a robust backend to handle business logic, including overlap checks, balance verifications, and edge cases like manager timeouts.

## Architecture & Tech Stack

This project is built using a modern, serverless AWS architecture:
- **Authentication:** Amazon Cognito (User pools & JWT role claims)
- **API Layer:** Amazon API Gateway
- **Compute & Business Logic:** AWS Lambda (Node.js)
- **Workflow Orchestration:** AWS Step Functions
- **Database:** Amazon DynamoDB
- **Notifications:** Amazon SES (Emails) and Amazon SNS (Alerts)
- **Security & Monitoring:** AWS Secrets Manager & Amazon CloudWatch
- **Frontend:** Single Page Application (SPA) hosted on Amazon S3

## Sasikumar's Contributions 🚀

As the **Cloud Architect** and **Backend Engineer** for this project, I was responsible for designing and deploying critical infrastructure and core business logic:

### Cloud Infrastructure
- **Authentication & Security:** Configured Amazon Cognito user pools and role groups (Employee, Manager, HRAdmin) to secure the application. Integrated AWS Secrets Manager for secure token handling.
- **API Gateway:** Set up the API Gateway with Cognito Authorizers and integrated it with backend Lambdas using Proxy Integration.
- **Observability:** Configured baseline Amazon CloudWatch logging, alarms, and dashboards to ensure the operational health of the system.

### Backend & Database Implementation
- **Database Provisioning:** Designed and provisioned the Amazon DynamoDB tables (`leave_requests`, `leave_balances`, `leave_config`) including Global Secondary Indexes (GSIs).
- **AWS Lambda Development:** Deployed and managed the core Node.js Lambda functions:
  - `submitLeaveRequest`: Validations, balance checks, and overlap checks.
  - `approveRejectRequest`: Token verification and approval execution.
  - `finalizeApprovalRequest`: Secure single-writer balance deduction.
  - `reportsCalendar`: API backing for Manager/HR dashboards.
  - `carryForwardAndSummary`: Automated weekly balance recrediting.
- **Workflow Orchestration:** Designed and deployed the `SLAMS-Approval-Workflow` using **AWS Step Functions**, which manages the multi-level approval state machine (including wait-for-token callbacks, HR escalation branching, and 48-hour manager timeouts).

## How It Works (Core Logic)

### 1. Database Design (DynamoDB)
The system relies on a NoSQL architecture using **Amazon DynamoDB** for high performance and scalability. 
- **`leave_requests` table**: Stores every request. It utilizes a composite primary key (`employee_id` as partition key, `request_id` as sort key) and Global Secondary Indexes (GSIs) such as `status-start_date-index` to allow lightning-fast querying of overlapping leaves.
- **`leave_balances` table**: Tracks the exact number of entitled, used, and carried-forward days per employee per year.

### 2. Balance Calculation
When an employee requests leave, the system executes real-time balance calculations:
- The `submitLeaveRequest` Lambda retrieves the user's current year record from `leave_balances`.
- It calculates `Days Remaining = (Entitled + Carry Forward) - Used`.
- If the requested days exceed the remaining balance, the request is immediately intercepted and auto-rejected, preventing invalid requests from wasting manager time.
- Upon final approval, the `finalizeApprovalRequest` Lambda safely deducts the exact number of days using atomic update operations to prevent race conditions.

### 3. Overlap Detection
To prevent employees from booking double-leaves:
- The backend automatically queries the `leave_requests` DynamoDB table using the `status-start_date-index` GSI.
- It scans for any `APPROVED` (or pending) leave records for that specific employee where the requested date range overlaps with an existing record.
- If an overlap is detected, the system auto-rejects the request and sends a notification back to the employee.

## Setup & Deployment

Deployment is handled via the AWS CLI and AWS Management Console. First, the DynamoDB tables are provisioned using the provided Node.js setup scripts. Once the database is live, the core logic is deployed as individual Lambda functions and orchestrated via the AWS Step Functions visual editor.

---
*Built with ❤️ by Team Pressanna at F13 Technologies Pvt Ltd.*