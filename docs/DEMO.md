# Nidhi Suraksha — Scripted Prototype Demonstration Guide
**Tagline:** *Verify. Track. Release.*  
**Entity:** All India Council for Technical Education (AICTE) Bureau of Regulation  

---

## Overview

This guide walks through the 7 primary functional flows of the **Nidhi Suraksha** Security Deposit & Fixed Deposit Receipt (FDR) Management Portal.

To follow this demo:
1. Ensure the backend server is running (`npm run dev` in `/server` or running via container).
2. Ensure the frontend client is running (`npm run dev` in `/client`).
3. Open `http://localhost:5173` in your browser.
4. Use the **Role Persona Switcher** in the top navigation bar to switch between user personas:
   - **Institute:** `INSTITUTION` (e.g., Delhi Institute of Advanced Technology)
   - **Officer:** `SCRUTINY_OFFICER` (e.g., Scrutiny Officer Mukherjee, MFA AAL2)
   - **Authority:** `APPROVING_AUTHORITY` (e.g., Bureau Head Dr. Sen, MFA AAL2)
   - **Admin:** `ADMIN` (e.g., Super Administrator)
   - **Auditor:** `AUDITOR` (e.g., Comptroller & Auditor General Liaison)

---

## Flow 1: New FDR Registration with AI Pre-Fill & Confidence Review

1. Switch persona to **Institute** in the top navigation bar.
2. Navigate to **"Register New FDR"** (`/fdrs/new`).
3. Under **"AI Assisted Pre-Fill (Optional)"**:
   - Choose a sample scanned FDR certificate or test document (e.g. `sbi_deposit_receipt.pdf`).
   - Click **"Auto-Fill Form"**.
   - Notice that the Document AI pipeline reads the text, extracts key fields (`FDR Number`, `Bank Name`, `Principal Amount`, `Maturity Date`, `Lien Marking`), and displays confidence scores next to each populated field.
4. Inspect and edit any fields as desired.
5. Ensure the **"Lien Marked in Favour of AICTE Regulation Bureau"** checkbox is checked.
6. Click **"Save & Register Deposit Draft"**.
7. You are redirected to the **Deposit Detail Page** (`/fdrs/:id`) where the record status is initialized as `DRAFT`.
8. Click **"Submit for Scrutiny"**. The status advances to `SUBMITTED`.

---

## Flow 2: Automated Scrutiny & Document AI Extraction Review

1. Switch persona to **Officer** in the header.
2. From the Deposit Ledger (`/fdrs`), find the newly submitted deposit.
3. Click **"Inspect"** to open the detail view.
4. Click **"Take Under Scrutiny"**. The status transitions to `UNDER_SCRUTINY`.
5. Under **Evidence & Scanned Receipts**:
   - Click **"Download"** to test streaming and real-time AES-256-GCM decryption of the original document.
   - Click **"Run AI OCR"** to execute the Groq LLM (or mock fallback) extraction pipeline.
6. Review the **Document AI Extraction & Confidence** panel on the right:
   - Observe extracted fields with confidence levels. Fields below 80% confidence are highlighted with an amber warning badge.
   - Click **"Confirm Extracted Values"**. The extraction status updates to `Human Confirmed` and the audit trail logs the officer's cryptographic sign-off.

---

## Flow 3: Bank Verification Provider Adapter Trigger (MFA AAL2 Enforced)

1. While still viewing the deposit as **Officer** (with MFA AAL2 active):
2. Click **"Verify Against Bank"**.
3. The server invokes the Bank Adapter (`BankVerificationProvider`):
   - In live mode, this connects to the bank's SFTP/API escrow gateway.
   - In demo mode, it matches against the deterministic seeded mock registry.
4. A modal appears presenting the bank response:
   - **Status:** `VERIFIED`
   - **Bank Reference Code:** e.g., `BANK-REF-SBI-9921`
   - **State Transition:** The FDR transitions to `ACTIVE`, verification badge shows `Bank Verified`, and risk score is lowered.
5. If testing a mismatch scenario (e.g. amount discrepancy or doctored document), the bank adapter returns `MISMATCH`, the deposit is flagged `DISCREPANCY_FLAGGED`, and the risk engine adds a 30-point penalty.

---

## Flow 4: Validity Tracking & Approaching Maturity via Date Simulator

1. Switch persona to **Admin**.
2. Navigate to **"System Admin & Audit"** (`/admin`).
3. Under **"Maturity Date Advancement Simulator"**:
   - Notice the current simulated date input.
   - Click the **"+90 Days"** preset button (or choose a date beyond deposit maturity).
   - Click **"Evaluate Schedule"**.
4. The background scheduler evaluates all active deposits against the simulated date:
   - Deposits within 90 days of maturity transition from `ACTIVE` to `EXPIRING`.
   - Deposits past maturity transition to `MATURED`.
   - Scheduled reminder logs are recorded (simulating 90/60/30/7-day notice emails sent to institutional nodal officers).
5. Review the **Action Ledger** detailing which deposit references were transitioned.

---

## Flow 5: Renewal Child FDR Linking & Parent Status Transition

1. Switch persona back to **Institute**.
2. Navigate to **"Deposit Records"** (`/fdrs`) and select an FDR that is `EXPIRING` or `MATURED`.
3. In the detail view, click **"Submit Renewal FDR"**.
4. In the modal:
   - Enter a new FDR certificate number (e.g. `FDR-2026-RNW-8802`).
   - Enter the renewal deposit amount and extended maturity date (e.g., +5 years).
   - Click **"Confirm Renewal"**.
5. The system automatically:
   - Marks the parent FDR as `RENEWED` (terminal active state).
   - Creates a new child FDR in `SUBMITTED` status.
   - Establishes a bidirectional cryptographic parent/child lineage link viewable in both records.

---

## Flow 6: Multi-Tier Release Workflow & Separation of Duties Hard Enforcement

1. Switch persona to **Institute**.
2. Open an `ACTIVE` or `MATURED` deposit.
3. Click **"Request Release / Refund"**.
4. Enter justification (e.g., *"10-year regulatory tenure completed without compliance breaches"*). Click **"Submit Release Request"**.
5. Navigate to **"Release Approvals"** (`/release-requests`):
   - Switch persona to **Officer** (`officer-1` or `officer-2`).
   - Open **"Officer Scrutiny Queue"**.
   - Input scrutiny notes (e.g., *"All regulatory compliance reports verified clean"*).
   - Click **"Recommend for Approval"**.
6. **Testing Separation of Duties Protection:**
   - Attempt to approve this request while logged in as the same user: the action is forbidden.
   - Switch persona to **Authority** (`authority-1`).
   - Open **"Authority Approval Queue"**.
   - Notice the separation of duties check: if the user ID differs from the officer who recommended the release, the **"Officially Approve & Release FDR"** button is enabled.
   - Click **"Officially Approve & Release FDR"**.
   - The release request transitions to `APPROVED`, the underlying FDR status transitions to `RELEASED`, and the escrow is marked for refund.

---

## Flow 7: Copilot Natural Language Query & Cryptographic Chain Verification

### Part A: Copilot Assistant
1. Click the **"Copilot Assistant"** button in the top navigation header.
2. In the slide-over drawer:
   - Click one of the suggested query chips, e.g., *"SBI deposits expiring in 90 days"* or *"High risk deposits flagged with discrepancies"*.
   - Click **"Run"**.
   - The Groq LLM translates the question into a structured MongoDB query, executing strictly within the user's tenant scope (IDOR safe).
   - Click on any matched deposit to navigate directly to it.
3. Switch to the **"Draft Deficiency Notice"** tab:
   - Provide an FDR reference ID.
   - Click **"Draft Notice"**.
   - The Copilot generates a formal, plain-text institutional deficiency notice letter based on verified case facts with prompt injection defense.
   - Click **"Copy Letter"** to copy the notice to your clipboard for human review.

### Part B: Cryptographic Audit Chain Verifier
1. Switch persona to **Auditor** or **Admin**.
2. Navigate to **"System Admin & Audit"** (`/admin`).
3. Click **"Run Cryptographic Verification"**.
4. The server walks the entire append-only MongoDB `auditLogs` collection:
   - Re-computes SHA-256 hash chains `hash = SHA256(prevHash + seq + actorId + action + entityId + canonicalData)`.
   - Confirms zero broken links, zero unauthorized modifications, and strictly monotonic sequence numbers.
   - Displays **"VALID & UNTAMPERED"** with the latest sequence number and top block hash.
