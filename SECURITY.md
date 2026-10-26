# Nidhi Suraksha - Application Security Documentation
**Brand:** Nidhi Suraksha  
**Tagline:** "Verify. Track. Release."  
**Target:** AICTE Regulation Bureau Security Deposit / Fixed Deposit Receipt (FDR) Management Portal

---

## 1. Security Architecture & Threat Model (STRIDE)

| Threat Category | Potential Threat Scenario | Implemented Security Control & Countermeasure |
| :--- | :--- | :--- |
| **Spoofing** | Attacker impersonates an AICTE official or institution | - Supabase authentication with httpOnly, Secure, SameSite=Strict cookies.<br>- Cryptographic JWT verification with `jose` (signature, issuer, aud, expiry).<br>- Mandatory multi-factor authentication (AAL2 / TOTP) for `SCRUTINY_OFFICER`, `APPROVING_AUTHORITY`, and `ADMIN`.<br>- Account lockout (15 minutes) after 5 consecutive failed attempts. |
| **Tampering** | Modification of FDR data or audit history | - Cryptographic SHA-256 hash chain on all audit log entries (`prevHash` + canonical JSON).<br>- MongoDB least-privilege database role: `app` user has only `insert` and `find` on `auditLogs` (strictly no `update` or `remove`).<br>- `/audit/verify-chain` endpoint to detect sequence gaps or tampered entries.<br>- Application-level AES-256-GCM encryption on FDR numbers. |
| **Repudiation** | User denies performing an action (e.g., approving release, submitting deposit) | - Immutable monotonic sequence allocation (`seq`) on audit logs within transactions.<br>- Captures actor ID, actor role, timestamp, IP, User-Agent, before & after state payloads.<br>- Separation of duties: Approving Authority cannot approve an FDR they processed as Scrutiny Officer. |
| **Information Disclosure** | IDOR: Institution A views Institution B's FDRs by guessing or enumerating IDs | - Object-level authorization enforced at the query layer.<br>- Institution role queries are strictly scoped to authenticated user's `institutionId`.<br>- **Deny by default**: Cross-tenant IDOR access attempts return HTTP 404 (Not Found), not 403, preventing resource existence enumeration.<br>- FDR number blind-indexing (HMAC-SHA256) ensures plaintext numbers are never stored or searchable. |
| **Denial of Service** | Brute force login, ReDoS, or API flooding | - `express-rate-limit` with strict threshold on `/auth/*` (20 attempts per 15 mins).<br>- 100kb JSON body size ceiling rejects payload flooding.<br>- Global and per-user daily AI call budget (`AI_DAILY_BUDGET`). |
| **Elevation of Privilege** | Client alters user role in metadata or bypasses RBAC | - User roles are stored in Supabase `app_metadata` (authoritative) and mirrored in `public.profiles`.<br>- RLS policies prevent client-side updates to `role` or `institution_id`.<br>- Server-side `requireRole()` and `requireMfa()` middlewares enforce permissions on every endpoint. |

---

## 2. Implemented Defense-in-Depth Controls

### A. MongoDB Hardening & Least Privilege Custom Role
The local Dockerized MongoDB replica set (`rs0`) executes under `--auth` and a shared keyFile. The operational database user `app` is restricted via the `nidhiAppRole`:
- Read & Write permissions on standard portal collections (`fdrs`, `documents`, `extractions`, `loginAttempts`, etc.).
- **Append-Only restriction on `auditLogs`**:
  ```javascript
  {
    resource: { db: "nidhi_suraksha", collection: "auditLogs" },
    actions: ["find", "insert", "createIndex"] // Strictly NO "update" or "remove"
  }
  ```

### B. NoSQL Injection Defenses
- Global Mongoose configuration: `mongoose.set('sanitizeFilter', true)`.
- Custom express middleware `nosqlSanitizer` recursively scans `req.body`, `req.query`, and `req.params`, immediately terminating requests containing keys starting with `$` or containing `.`.
- Strict schema validation using Zod `.strict()` to reject unknown fields.

### C. Cryptography & Envelope Encryption
- **FDR Numbers:** Encrypted with AES-256-GCM (`fdrNumberEnc`: ciphertext, iv, authTag) using `ENCRYPTION_MASTER_KEY`.
- **Searchable Encryption (Blind Index):** Blind index generated via `HMAC-SHA256(fdrNumber, HMAC_KEY)` stored in `fdrNumberHash`. Enforces uniqueness in `(bankName, fdrNumberHash)` without exposing plaintext numbers.
- **Audit Hash Chain:** Each log entry computes `hash = SHA256(prevHash + canonicalJson(payload))`. Keys are sorted deterministically via `canonicalJsonStringify`.

### D. Session & Cookie Security
- `access_token` and `refresh_token` are stored strictly in `httpOnly`, `SameSite=Strict`, `Secure` (in production) cookies.
- Tokens are never exposed to browser `localStorage` or JavaScript-readable storage, preventing XSS-based credential theft.

---

## 3. Known Limitations & Production Readiness Checklist

1. **ClamAV Integration:** Antivirus file scanning hook in `services/uploadService.ts` contains a documented interface stub; production deployment requires connecting to a live ClamAV daemon (`clamd`).
2. **KMS Migration:** Currently keys are loaded via validated environment variables; production setup should retrieve `ENCRYPTION_MASTER_KEY` and `HMAC_KEY` from AWS KMS, Azure Key Vault, or HashiCorp Vault.
3. **Data Processing Review for LLM:** OCR extraction text is stripped of PAN, Aadhaar, phone numbers, and email addresses prior to sending to Groq. For strict on-premise governance, evaluate self-hosting `gpt-oss` or using an on-premise Ollama/vLLM instance.
