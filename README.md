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

## Setup & Deployment

For full deployment instructions, please refer to the `Deployment_Instructions.md` file included in this repository.

---
*Built with ❤️ by Team Pressanna at F13 Technologies Pvt Ltd.*