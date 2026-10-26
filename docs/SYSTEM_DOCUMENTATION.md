# Nidhi Suraksha — Complete System & Dashboard Documentation

**AI-Assisted Institutional Security Deposit (FDR) Management System**  
*AICTE Bureau of Regulation — Technical Architecture & Operations Guide*

---

## Table of Contents
1. [System Overview & Mission](#1-system-overview--mission)
2. [End-to-End User Roles & Access Control](#2-end-to-end-user-roles--access-control)
3. [Complete Dashboard & Screen Documentation](#3-complete-dashboard--screen-documentation)
   - [Central Authentication Portal](#31-central-authentication-portal)
   - [Executive Operations Dashboard](#32-executive-operations-dashboard)
   - [Deposit Records Register](#33-deposit-records-register)
   - [AI Document Registration Wizard](#34-ai-document-registration-wizard)
   - [FDR Record Deep Detail & Simulator](#35-fdr-record-deep-detail--simulator)
   - [Statutory Release & Sanction Bureau](#36-statutory-release--sanction-bureau)
   - [Statutory Reports Center](#37-statutory-reports-center)
   - [System Admin & Cryptographic Audit Cell](#38-system-admin--cryptographic-audit-cell)
   - [AI Copilot Regulatory Assistant](#39-ai-copilot-regulatory-assistant)
4. [FDR Lifecycle State Machine](#4-fdr-lifecycle-state-machine)
5. [Cryptographic & Zero-Trust Security Specification](#5-cryptographic--zero-trust-security-specification)
6. [API Route Reference](#6-api-route-reference)

---

## 1. System Overview & Mission

**Nidhi Suraksha** ("Verify. Track. Release.") is an enterprise-grade government portal developed for the **All India Council for Technical Education (AICTE)**. Its primary mission is the end-to-end verification, custody tracking, and lawful sanctioning of multi-crore fixed deposit security deposits pledged by technical education institutions across India.

### Core Objectives
1. **Automated Verification:** Replace manual receipt processing with Groq LLM Document AI (`openai/gpt-oss-120b`) and Core Banking System (CBS) integration.
2. **Proactive Maturation Tracking:** Continuously monitor deposit timelines, automated 90/60/30/7-day notice dispatch, and automated status elevation.
3. **Dual-Authorization Sanctioning:** Enforce statutory separation of duties so that release requests require scrutiny recommendation followed by independent approving authority sanction.
4. **Tamper-Evident Forensic Auditability:** Maintain an unbroken SHA-256 Merkle hash chain for every operation, ensuring forensic integrity.

---

## 2. End-to-End User Roles & Access Control

Access control is governed by strict Role-Based Access Control (RBAC) enforced on both client routes (`ProtectedRoute`) and server middleware (`authenticateToken` and `requireRole`):

### 1. `INSTITUTION` (University / College Representative)
- **Primary Persona:** `Dr. Rajiv Malhotra (Registrar, Delhi Institute of Engineering & Technology)`
- **Email:** `registrar@diet-delhi.ac.in` | **Password:** `Institute@123`
- **Scope:** Restricted solely to deposits belonging to their assigned `institutionId`.
- **Capabilities:**
  - Submit new fixed deposit receipts with scanned certificates.
  - Review AI OCR extraction and confirm certificate metadata.
  - Submit renewal certificates linking child deposits to parent records.
  - Initiate formal release requests for matured deposits.

### 2. `SCRUTINY_OFFICER` (AICTE Regulatory Bureau)
- **Primary Persona:** `Shri A. K. Sharma (AICTE Scrutiny Officer)`
- **Email:** `scrutiny.officer@aicte.gov.in` | **Password:** `Officer@123`
- **Scope:** Nationwide inspection of submitted receipts and release applications.
- **Capabilities:**
  - Perform bank lien mark checks and core banking reconciliation.
  - Review OCR fidelity and evaluate flagged discrepancies.
  - Review institution release applications and submit formal scrutiny recommendations.

### 3. `APPROVING_AUTHORITY` (Statutory Sanction Authority)
- **Primary Persona:** `Prof. T. G. Sitharam (Member Secretary / Approving Authority)`
- **Email:** `authority@aicte.gov.in` | **Password:** `Authority@123`
- **Scope:** Nationwide statutory decision-making.
- **Capabilities:**
  - Review recommended release applications.
  - Approve or reject release sanctions with digital sign-off.
  - Enforce regulatory hold periods and examine executive risk indicators.
  - *Hard Constraint:* Cannot approve any release request that they personally scrutinized or recommended.

### 4. `ADMIN` (AICTE Central IT & Security Cell)
- **Primary Persona:** `System Administrator (AICTE Cell)`
- **Email:** `admin@aicte.gov.in` | **Password:** `Admin@123`
- **Scope:** Full system configuration and cryptographic oversight.
- **Capabilities:**
  - Institution onboarding and user identity management.
  - Cryptographic key status verification and envelope encryption health checks.
  - Monitor daily Groq AI quota consumption and system load.

### 5. `AUDITOR` (Statutory Oversight & Vigilance Bureau)
- **Primary Persona:** `Chief Vigilance Auditor`
- **Email:** `auditor@aicte.gov.in` | **Password:** `Auditor@123`
- **Scope:** Independent read-only supervisory authority.
- **Capabilities:**
  - Execute full cryptographic verification of the SHA-256 audit ledger.
  - Export certified forensic logs and compliance audit trails.
  - Verify zero tampering across all database blocks.

---

## 3. Complete Dashboard & Screen Documentation

### 3.1 Central Authentication Portal
- **Route:** `/login` and `/login/:roleParam`
- **Component:** `LoginPage.tsx`
- **Features:**
  - **Statutory Gateway Tabs:** 5 dedicated role gateways with individual visual styling and security badge designations.
  - **Cookie-Backed Authentication:** Submits credentials to `POST /auth/login`. On success, the server responds with HTTP 200 and sets `access_token` (1 hour) and `refresh_token` (7 days) as `httpOnly`, `SameSite=Lax` cookies.
  - **Zero Token Leakage:** Authentication tokens are never exposed in JSON responses or saved in browser storage.
  - **Automatic Routing:** Upon authentication, routes the user directly to their respective primary workspace:
    - Institution &rarr; `/fdrs`
    - Scrutiny Officer & Approving Authority &rarr; `/release-requests`
    - Administrator & Auditor &rarr; `/admin`

### 3.2 Executive Operations Dashboard
- **Route:** `/`
- **Component:** `DashboardPage.tsx`
- **Key Visual Modules:**
  - **4 Top KPI Cards:**
    1. *Total Escrow Value:* Sum of all active fixed deposits denominated in ₹ Crores.
    2. *Active Deposits:* Total count of currently active and verified deposits.
    3. *Maturing Soon (30/60/90 Days):* Breakdown of near-term expiries requiring attention.
    4. *Flagged Discrepancies:* Count of deposits with non-zero risk scores or bank mismatches.
  - **Lifecycle Donut Chart:** Interactive distribution showing proportional breakdown across `ACTIVE`, `EXPIRING`, `MATURED`, `UNDER_SCRUTINY`, `RELEASE_REQUESTED`, and `RELEASED`.
  - **12-Month Maturity Timeline:** Bar chart forecasting upcoming monthly maturation sums.
  - **Bank Distribution Matrix:** Proportional holdings across scheduled commercial banks (SBI, HDFC, PNB, ICICI, Canara, BoB).
  - **Actionable Priority Alerts:** Direct drilldowns for flagged records.

### 3.3 Deposit Records Register
- **Route:** `/fdrs`
- **Component:** `FdrListPage.tsx`
- **Key Modules:**
  - **HMAC Blind Index Search:** Instant lookups over encrypted FDR numbers without exposing plaintexts.
  - **Multi-Parameter Filter Toolbar:** Filter by Bank, Status, Risk Tier, and Issue/Maturity date windows.
  - **Color-Coded Risk Badges:**
    - `0–19`: Low / Clean (Green)
    - `20–49`: Medium / Cautionary (Amber)
    - `50–100`: High / Discrepancy Flagged (Red)
  - **Formula-Sanitized CSV Export:** Exports visible or selected records with automatic formula prefix escaping.

### 3.4 AI Document Registration Wizard
- **Route:** `/fdrs/new`
- **Component:** `NewFdrPage.tsx`
- **Workflow:**
  1. *Document Upload:* Drag & drop scanned PDF or image.
  2. *AI OCR Extraction:* Sent to Groq `openai/gpt-oss-120b` via server-side streaming.
  3. *Side-by-Side Validation:* Extracted certificate number, bank name, branch, deposit amount, issue date, maturity date, and lien status presented with confidence percentages.
  4. *Prompt Injection & PII Defenses:* Strips adversarial system prompt override attempts and redacts irrelevant PII.
  5. *Envelope Encryption & Blind Index:* Upon user confirmation, generates AES-256-GCM ciphertext and HMAC blind index before writing to MongoDB.

### 3.5 FDR Record Deep Detail & Simulator
- **Route:** `/fdrs/:id`
- **Component:** `FdrDetailPage.tsx`
- **Key Capabilities:**
  - **Encrypted Document Viewer:** Streams decrypted PDF/image certificates directly in-memory.
  - **Core Banking Simulator:** Invokes mock CBS verification against simulated bank gateway.
  - **Explainable Risk Panel:** Shows exact calculated penalty factors (e.g., amount mismatch, missing lien mark, near-term expiry).
  - **Date Advancement Simulator:** Allows testing time-travel (+30d, +60d, +90d, +365d) to trigger lifecycle automated alerts.
  - **Child Renewal Linking:** Connects replacement FDR to current record, automatically transitioning parent status to `RENEWED`.

### 3.6 Statutory Release & Sanction Bureau
- **Route:** `/release-requests`
- **Component:** `ReleaseApprovalsPage.tsx`
- **Two-Tier Protocol:**
  - **Tier 1 (Scrutiny Recommendation):** Scrutiny Officer verifies compliance criteria and signs off recommendation.
  - **Tier 2 (Authority Digital Order):** Approving Authority issues final digital release sanction.
  - **Separation of Duties:** Enforces 403 Forbidden if the same user attempts both tiers on a single application.

### 3.7 Statutory Reports Center
- **Route:** `/reports`
- **Component:** `ReportsPage.tsx`
- **Capabilities:**
  - Generates state-wise, bank-wise, and lifecycle-filtered statutory reports.
  - Real-time preview with aggregate financial sums.
  - Instant CSV export with formula injection sanitization.

### 3.8 System Admin & Cryptographic Audit Cell
- **Route:** `/admin`
- **Component:** `AdminPage.tsx`
- **Capabilities:**
  - **Audit Hash Chain Verifier:** Performs real-time sequential hash verification over all audit blocks.
  - **Cryptographic Subsystem Status:** Displays live validation of 32-byte encryption keys and blind indexing salts.
  - **AI Token Quota Meter:** Live gauge tracking Groq API daily usage against configured budget.

### 3.9 AI Copilot Regulatory Assistant
- **Interface:** Floating drawer triggerable from any screen.
- **Component:** `CopilotDrawer.tsx`
- **Capabilities:**
  - Natural language queries across the deposit portfolio (e.g., *"Show all deposits in SBI expiring this quarter"*).
  - Drafting regulatory notice letters and deficiency notices.

---

## 4. FDR Lifecycle State Machine

```
              +---------------+
              |     DRAFT     |
              +---------------+
                      |
                      v
              +---------------+
              |   SUBMITTED   |
              +---------------+
                      |
        +-------------+-------------+
        |                           |
        v                           v
+------------------+       +------------------+
|  UNDER_SCRUTINY  | <---> |DISCREPANCY_FLAGGED|
+------------------+       +------------------+
        |                           |
        v                           v
+------------------+       +------------------+
|      ACTIVE      |       |     REJECTED     |
+------------------+       +------------------+
        |
        v (Time advances <= 90 days)
+------------------+
|     EXPIRING     |
+------------------+
        |
        +---------------------------+
        | (Maturity reached)        | (Renewal linked)
        v                           v
+------------------+       +------------------+
|     MATURED      |       |     RENEWED      |
+------------------+       +------------------+
        |
        v (Release requested)
+--------------------+
| RELEASE_REQUESTED  |
+--------------------+
        |
        v (Scrutiny recommended + Authority approved)
+--------------------+
|      RELEASED      |
+--------------------+
```

---

## 5. Cryptographic & Zero-Trust Security Specification

### 1. AES-256-GCM Envelope Encryption
- Sensitive fields (FDR number, certificate scans) are encrypted using AES-256-GCM.
- Each ciphertext contains: `IV (12 bytes) + Ciphertext + Auth Tag (16 bytes)`.
- Authentication tags prevent ciphertext tampering or bit-flipping attacks.

### 2. HMAC-SHA256 Blind Indexing
- Plaintext FDR numbers are hashed using HMAC-SHA256 with a secret salt:
  $$\text{Index} = \text{HMAC-SHA256}(\text{HMAC\_KEY}, \text{Normalize}(\text{fdrNumber}))$$
- Enables exact equality queries and duplicate prevention without ever decrypting database records.

### 3. Append-Only Cryptographic Hash Chain
- Every audit record contains:
  $$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} \,\|\, \text{seq} \,\|\, \text{timestamp} \,\|\, \text{actorId} \,\|\, \text{action} \,\|\, \text{canonicalJSON}(\text{state}))$$
- If any database record is altered, inserted, or deleted, `GET /audit/verify-chain` flags the tampering immediately.

### 4. Formula Injection Defense
- All CSV export routines prepend a single quote `'` to any cell whose first character is `=`, `+`, `-`, or `@`.

---

## 6. API Route Reference

### Authentication Routes
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Authenticate user, set session cookies | No (Rate-limited) |
| `POST` | `/auth/refresh`| Rotate and refresh session cookies | Refresh cookie |
| `POST` | `/auth/logout` | Clear session cookies | Yes |
| `GET`  | `/auth/me` | Return currently authenticated user | Session cookie |

### Deposit Management Routes
| Method | Endpoint | Description | Allowed Roles |
| :--- | :--- | :--- | :--- |
| `GET`  | `/fdrs` | List deposits with search/filter | All authenticated |
| `POST` | `/fdrs` | Register new deposit | `INSTITUTION`, `ADMIN` |
| `GET`  | `/fdrs/:id` | Get single deposit details | Scoped by tenant |
| `POST` | `/fdrs/extract-document` | Groq AI OCR extraction | `INSTITUTION`, `ADMIN` |
| `POST` | `/fdrs/:id/verify-bank` | Simulate CBS bank check | `SCRUTINY_OFFICER`, `ADMIN` |
| `POST` | `/fdrs/:id/renew` | Link renewal deposit | `INSTITUTION`, `ADMIN` |
| `POST` | `/fdrs/:id/advance-date` | Date advancement simulator | All authenticated |

### Release & Sanction Routes
| Method | Endpoint | Description | Allowed Roles |
| :--- | :--- | :--- | :--- |
| `POST` | `/release-requests` | Initiate release request | `INSTITUTION` |
| `GET`  | `/release-requests` | List active release requests | Officers, Authority, Admin |
| `POST` | `/release-requests/:id/scrutiny` | Submit scrutiny recommendation | `SCRUTINY_OFFICER`, `ADMIN` |
| `POST` | `/release-requests/:id/approve` | Final digital order approval | `APPROVING_AUTHORITY`, `ADMIN` |

### Audit & System Routes
| Method | Endpoint | Description | Allowed Roles |
| :--- | :--- | :--- | :--- |
| `GET`  | `/audit/verify-chain` | Verify unbroken SHA-256 chain | `ADMIN`, `AUDITOR` |
| `GET`  | `/dashboard/metrics` | Portfolio KPI metrics | All authenticated |
| `GET`  | `/reports/export-csv` | Formula-sanitized CSV export | All authenticated |
| `POST` | `/copilot/query` | Natural language portfolio query | All authenticated |
