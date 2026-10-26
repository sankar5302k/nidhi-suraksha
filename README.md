# Nidhi Suraksha — "Verify. Track. Release."

**Institutional Security Deposit & Fixed Deposit Receipt (FDR) Management System**  
*Built for the All India Council for Technical Education (AICTE) Bureau of Regulation*

---

## Executive Summary

AICTE mandates that approved technical institutions (engineering colleges, polytechnics, management institutes) maintain mandatory security deposits in the form of **Fixed Deposit Receipts (FDRs)** with lien marked in favour of AICTE. These deposits guarantee regulatory compliance, faculty protections, and institutional stability.

Historically, tracking thousands of multi-crore fixed deposits across dozens of scheduled commercial banks involved manual spreadsheets, risk of doctored or fake receipts, untracked maturity expiries, and procedural delays during legitimate deposit returns.

**Nidhi Suraksha** ("Verify. Track. Release.") is an enterprise-grade, zero-trust, AI-assisted platform that manages the entire lifecycle of institutional security deposits:

- **Verify:** AI-driven document OCR extraction via Groq (`openai/gpt-oss-120b`) with human-in-the-loop review, automated PII sanitization, prompt injection defense, and automated core banking (CBS) verification.
- **Track:** Real-time escrow monitoring, explainable risk scoring (0–100), automated 90/60/30/7-day maturity alerts, and an interactive date advancement time-travel simulator.
- **Release:** Statutory multi-tier release workflows with strict separation of duties, dual authorization, and an append-only cryptographic SHA-256 audit hash chain.

---

## System Architecture

```
+-----------------------------------------------------------------------------------------+
|                                      CLIENT TIER                                        |
|  React 18 + Vite | Tailwind CSS (High-Trust Fintech) | TanStack Query | Recharts        |
|  Strict httpOnly / SameSite=Strict Session Cookies (Zero tokens stored in client storage) |
+-----------------------------------------------------------------------------------------+
                                             |
                                             | HTTPS / Encrypted REST API
                                             v
+-----------------------------------------------------------------------------------------+
|                                      SERVER TIER                                        |
|  Express.js (Node.js 20+) | Helmet CSP | NoSQL Operator Filter | Jose JWT Verification  |
|  Strict Multi-Tenancy & IDOR Defense (404 Not Found on cross-tenant resource requests)  |
+-----------------------------------------------------------------------------------------+
           |                                  |                             |
           v                                  v                             v
+-----------------------+          +-----------------------+     +-----------------------+
|    AUTHENTICATION     |          |       DATABASE        |     |     AI & ADAPTERS     |
|  Supabase Auth & RLS  |          |   MongoDB Atlas / 7   |     |  Groq LLM SDK         |
|  Postgres Profiles    |          |   AES-256-GCM Envelope|     |  (openai/gpt-oss-120b)|
|  Multi-Factor AAL1/2  |          |   HMAC Blind Indexes  |     |  Bank CBS Verification|
|  15m Login Lockout    |          |   SHA-256 Hash Chain  |     |  CSV Formula Sanitizer|
+-----------------------+          +-----------------------+     +-----------------------+
```

---

## Statutory User Roles & Access Control

The platform provides dedicated gateways and role-based access control (RBAC) across 5 statutory tiers:

| Statutory Role | Scope & Permissions | Security Level | Dedicated Gateway |
| :--- | :--- | :--- | :--- |
| **Institution** | Register new FDRs, upload bank certificates, request deposit releases, track maturation | AAL1 | [`/login/institution`](http://localhost:5173/login/institution) |
| **Scrutiny Officer** | Inspect OCR extractions, verify bank lien endorsements, evaluate discrepancy flags | AAL2 | [`/login/scrutiny`](http://localhost:5173/login/scrutiny) |
| **Approving Authority** | Review recommended release requests, execute dual-authorization sanctions | AAL2 | [`/login/authority`](http://localhost:5173/login/authority) |
| **System Administrator** | Institution onboarding, user management, cryptographic health, AI budget quotas | AAL2 | [`/login/admin`](http://localhost:5173/login/admin) |
| **Vigilance Auditor** | Independent oversight, verify SHA-256 Merkle chain integrity, audit forensics | AAL2 | [`/login/auditor`](http://localhost:5173/login/auditor) |

> **Security & Credential Hygiene:** Real secrets and credentials must reside exclusively in `.env`, which is included in `.gitignore`. The demo account list (`sample_accounts.txt`) is for local development only and must never be committed to source control or exposed in production environments.

### Least-Privilege Role Visibility & Access Matrix

*Legend: [Yes] Full Access | [Read] Read-Only | [Own] Own Institution Only | [No] Completely Hidden / Forbidden*

| Page / Feature | Institution | Scrutiny Officer | Approving Authority | System Admin | Vigilance Auditor |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Login Gateway** | [Yes] | [Yes] | [Yes] | [Yes] | [Yes] |
| **Dashboard** | [Own] Simple (Own FDRs, expiring, actions) | [Yes] Full + Scrutiny queue | [Yes] Release-focused | [Yes] System-focused | [Read] Full oversight |
| **Bank Distribution & Portfolio Charts** | [No] | [Yes] | [Read] | [Read] | [Read] |
| **Deposit Register (`/fdrs`)** | [Own] Own FDRs | [Yes] Full | [Read] | [Read] List only | [Read] |
| **New FDR Wizard (`/fdrs/new`)** | [Yes] | [No] | [No] | [No] | [No] |
| **FDR Detail: Data & Documents** | [Own] Own FDR & Docs | [Yes] Full | [Read] | [No] Documents | [Read] |
| **Run CBS Bank Verification** | [No] Result badge only | [Yes] | [No] | [No] | [No] |
| **Flag Discrepancy / Observation** | [No] | [Yes] | [No] | [No] | [No] |
| **Risk Score Breakdown with Reasons** | [No] Neutral message | [Yes] | [Read] | [No] | [Read] |
| **Renew / Link Child FDR** | [Own] | [No] | [No] | [No] | [No] |
| **Time-Travel Date Simulator** | [No] | [No] | [No] | [Yes] Demo mode only | [No] |
| **Release: Request** | [Own] | [No] | [No] | [No] | [No] |
| **Release: Recommend (Tier 1)** | [No] | [Yes] | [No] | [No] | [No] |
| **Release: Approve / Reject (Tier 2)** | [No] | [No] | [Yes] | [No] | [No] |
| **Release: View Sanction Order** | [Own] After approval | [Read] | [Yes] | [No] | [Read] |
| **Reports & CSV Export** | [No] | [Yes] | [Yes] | [Yes] Aggregates | [Yes] |
| **Admin: User & Institution Management** | [No] | [No] | [No] | [Yes] | [No] |
| **Admin: Crypto Status, DB Health, AI Quota** | [No] | [No] | [No] | [Yes] | [No] |
| **Audit Hash-Chain Verifier & Log Viewer** | [No] | [No] Per-FDR only | [No] Per-FDR only | [Yes] | [Yes] |
| **Copilot: Portfolio Queries** | [Own] Own FDRs only | [Yes] | [Yes] | [No] | [Read] Queries only |
| **Copilot: Draft Letters / Notices** | [No] | [Yes] | [Yes] | [No] | [No] |

---

## Dashboards & Pages Overview

### 1. Central Authentication Portal ([`/login`](http://localhost:5173/login) & `/login/:roleParam`)
- **Gateway Selector:** 5 dedicated role gateways with distinct color-coded accents and security indicators.
- **Session Cookie Driven:** Uses secure `httpOnly`, `SameSite=Strict` cookies with automatic session refresh.
- **Assurance Levels:** Privileged roles (Scrutiny Officer, Approving Authority, System Admin, Vigilance Auditor) require elevated AAL2 MFA assurance.

### 2. Executive Analytics Dashboard ([`/`](http://localhost:5173/))
- **Escrow KPI Cards:** Total Escrow Portfolio Value (INR Crores), Active Deposits, Expiring in 30/60/90 Days, Flagged Discrepancies.
- **Lifecycle Distribution Charts:** Interactive donut and bar charts showing FDRs across `ACTIVE`, `EXPIRING`, `MATURED`, `UNDER_SCRUTINY`, `RELEASED`, etc.
- **Maturity Horizon:** 12-month forward projection chart of maturing funds.
- **Bank Distribution Matrix:** Breakdown across State Bank of India, HDFC Bank, Punjab National Bank, ICICI Bank, Canara Bank, and Bank of Baroda.
- **Actionable Priority Alerts:** High-risk discrepancies with instant drilldown buttons.

### 3. Deposit Records Register ([`/fdrs`](http://localhost:5173/fdrs))
- **Blind Search & Filtering:** Real-time search by encrypted FDR number (via HMAC blind index), bank, status, and date range.
- **Risk Indicators:** Dynamic visual badges (Green = Verified / 0 Risk, Amber = Warning / 20–50 Risk, Red = Flagged / 60+ Risk).
- **Multi-Record Actions:** Batch export and selective review.
- **Secure CSV Export:** Client & server sanitization preventing spreadsheet formula injection (`=`, `+`, `-`, `@`).

### 4. AI-Powered FDR Registration Wizard ([`/fdrs/new`](http://localhost:5173/fdrs/new))
- **Document AI Extraction:** Scanned PDF/image upload processed by Groq (`openai/gpt-oss-120b`).
- **Human-in-the-Loop Review:** Side-by-side verification of extracted fields (FDR number, bank, branch, amount, issue date, maturity date, lien mark) with extraction confidence badges.
- **Security Defenses:** Built-in sanitization against OCR prompt injection and automatic PII redaction.
- **Duplicate Prevention:** Immediate collision check using HMAC-SHA256 blind indexing.

### 5. Deep Record Inspection & CBS Simulator ([`/fdrs/:id`](http://localhost:5173/fdrs/1))
- **Envelope-Encrypted Document Streaming:** Scanned certificates decrypted in-memory and streamed securely to authenticated users.
- **Bank CBS Gateway Simulator:** Simulates real-time core banking system API calls to verify account numbers, lien status, and deposit balance.
- **Explainable Risk Scoring:** Transparent 0–100 risk score breakdown explaining specific reasons for flags or holds.
- **Time-Travel Date Simulator:** Advance system time (+30, +60, +90, +365 days) to test lifecycle transitions, expiration alerts, and maturity triggers.
- **Child Renewal Linking:** Seamlessly link a renewed FDR to its parent record, automatically transitioning the parent to `RENEWED`.

### 6. Statutory Release & Sanction Bureau ([`/release-requests`](http://localhost:5173/release-requests))
- **Two-Tier Separation of Duties:**
  - *Tier 1 (Scrutiny Officer):* Validates maturity, verifies no pending compliance holds, and submits a formal release recommendation.
  - *Tier 2 (Approving Authority):* Reviews officer findings and executes digital sanction order.
- **Enforced Separation:** A Scrutiny Officer who evaluated or recommended a deposit is cryptographically barred from approving that same release.
- **Dual Authorization & Digital Order Certificate:** Generates a formatted digital release sanction order upon approval.

### 7. Statutory Reports Center ([`/reports`](http://localhost:5173/reports))
- **Custom Report Filtering:** Filter by institution, state, bank, lifecycle status, date range, and risk tier.
- **Live Report Preview:** Formatted data table with aggregate totals and counts.
- **Formula-Sanitized CSV Download:** Certified compliance export with tamper-evident headers.

### 8. System Admin & Cryptographic Audit Cell ([`/admin`](http://localhost:5173/admin))
- **SHA-256 Hash Chain Integrity Verifier:** Audits the unbroken sequence of SHA-256 blocks from the genesis block to head. Detects any database tampering immediately.
- **Cryptographic Subsystem Status:** Live checks for `ENCRYPTION_MASTER_KEY` (AES-256-GCM), `HMAC_KEY`, and `CSRF_SECRET`.
- **Database & Identity Health:** Connection health indicators for MongoDB Atlas and Supabase.
- **AI Quota & Usage Meter:** Real-time tracking of daily Groq API token consumption and budget limits.

### 9. AI Copilot Regulatory Assistant (Drawer across all pages)
- Natural language query interface over the deposit portfolio.
- Automated regulatory letter and deficiency notice drafting.
- Anomaly investigation assistance.

---

## Security Architecture & Cryptographic Controls

1. **Zero-Trust Multi-Tenancy & IDOR Defense:**
   - Database queries are scoped strictly to the authenticated user's `institutionId`.
   - Cross-tenant requests return `404 Not Found` (never `403`), eliminating resource enumeration attacks.
2. **Application-Level Envelope Encryption:**
   - Certificate numbers and sensitive banking details are encrypted via **AES-256-GCM** before touching storage.
   - Files are stored encrypted in MongoDB GridFS with ephemeral data keys wrapped by master encryption keys.
3. **HMAC-SHA256 Blind Indexing:**
   - Duplicate detection and exact lookups operate over salted blind hashes without exposing plaintext FDR numbers.
4. **Append-Only Cryptographic Audit Log:**
   - Every state transition is recorded in an immutable ledger where block `N` contains `SHA256(prevHash + seq + actorId + action + canonicalState)`.
   - Verifiable via `GET /audit/verify-chain`.
5. **Formula Injection Sanitization:**
   - All exported CSV files escape cells starting with `=`, `+`, `-`, or `@` to prevent spreadsheet command execution.
6. **Hard Separation of Duties:**
   - Scrutiny Officers and Approving Authorities have separate, mutually exclusive execution rights on release sanctions.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts, TanStack Query |
| **Backend** | Node.js 20+, Express.js, TypeScript, Helmet, Cookie-Parser, Mongoose, Jose JWT |
| **Databases** | MongoDB Atlas (Cluster0), Supabase (PostgreSQL & Identity) |
| **AI / LLM** | Groq SDK (`openai/gpt-oss-120b`), In-memory Document OCR |
| **Security** | AES-256-GCM, HMAC-SHA256, SHA-256 Hash Chain, HttpOnly Cookies |
| **Testing** | Vitest, Supertest, MongoMemoryServer |

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+
- Internet connection (for MongoDB Atlas and Groq API)

### 1. Clone & Configure Environment
Both the root and server use the configured `.env`:
```bash
# Verify environment keys in .env
cat .env
```

Key environment variables (sample template):
```env
PORT=5000
CLIENT_URL=http://localhost:5173
SUPABASE_URL=https://<your-project-id>.supabase.co
MONGODB_URI=mongodb+srv://<db-user>:<db-password>@<your-cluster>.mongodb.net/nidhi_suraksha?retryWrites=true&w=majority
ENCRYPTION_MASTER_KEY=<your-64-character-hex-aes-master-key>
HMAC_KEY=<your-64-character-hex-hmac-blind-index-key>
CSRF_SECRET=<your-random-csrf-secret-min32-chars>
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
```

### 2. Seed Database (Optional)
To populate 25 diverse FDRs across all lifecycle statuses:
```bash
cd server
npm run seed
```

### 3. Run Backend Server
```bash
cd server
npm run dev
# Server runs on http://localhost:5000
```

### 4. Run Frontend Client
```bash
cd client
npm run dev
# Client runs on http://localhost:5173
```

### 5. Access the Application
1. Open your browser: [http://localhost:5173/login](http://localhost:5173/login)
2. Open [`sample_accounts.txt`](sample_accounts.txt) to copy credentials for any of the 5 roles.
3. Sign in to experience the role-specific dashboard and capabilities.

---

## Testing Suite

The server includes 55 comprehensive Vitest integration and security tests:
```bash
cd server
npm test
```

Tests cover:
- Cryptographic encryption/decryption roundtrips
- HMAC blind index deterministic matching
- Separation of duties enforcement
- Multi-tenancy IDOR isolation
- Hash chain integrity verification and tamper detection
- Groq LLM mock fallbacks and prompt injection sanitization

---

## Project Directory Structure

```
nidhi-suraksha/
├── client/                     # React 18 + Vite Frontend
│   ├── src/
│   │   ├── api/client.ts       # Central fetch client with credentials: include
│   │   ├── components/         # Header, CopilotDrawer, Navigation
│   │   ├── context/            # AuthContext (cookie-backed session state)
│   │   ├── pages/              # 8 Full-Featured Pages
│   │   │   ├── AdminPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── FdrDetailPage.tsx
│   │   │   ├── FdrListPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── NewFdrPage.tsx
│   │   │   ├── ReleaseApprovalsPage.tsx
│   │   │   └── ReportsPage.tsx
│   │   ├── types.ts            # Shared frontend TypeScript interfaces
│   │   └── App.tsx             # Routes & ProtectedRoute implementation
│   └── package.json
│
├── server/                     # Node.js + Express Backend
│   ├── src/
│   │   ├── config/env.ts       # Zod-validated environment config
│   │   ├── controllers/        # Express handlers (auth, fdr, release, etc.)
│   │   ├── db/                 # MongoDB (Mongoose) & Supabase clients
│   │   ├── middleware/         # Auth JWT verifier, Helmet, NoSQL sanitizer
│   │   ├── models/             # Mongoose schemas (Fdr, AuditLog, Document)
│   │   ├── routes/             # REST route modules
│   │   ├── services/           # Business logic, Groq LLM, Audit chain
│   │   ├── utils/crypto.ts     # AES-256-GCM and HMAC utilities
│   │   └── index.ts            # Server entry point
│   ├── tests/                  # 55 Vitest automated test suites
│   └── package.json
│
├── docs/                       # Comprehensive documentation
│   ├── DEMO.md                 # Step-by-step scripted demo walkthrough
│   ├── openapi.yaml            # Complete OpenAPI 3.0 specification
│   └── SYSTEM_DOCUMENTATION.md # In-depth technical & architecture guide
│
├── sample_accounts.txt         # Official testing credentials directory
├── .env                        # Root environment variables
└── README.md                   # This documentation
```
