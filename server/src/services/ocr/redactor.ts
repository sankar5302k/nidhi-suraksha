/**
 * Data Minimization Redactor:
 * Strips sensitive PII (PAN, Aadhaar, phone numbers, email addresses, full bank account numbers)
 * from OCR text BEFORE sending to external LLM providers (Groq/OpenAI).
 *
 * Retains required FDR metadata: FDR number, bank name, branch, deposit amounts, dates, depositor name.
 */
export function redactSensitivePii(rawText: string): { redactedText: string; redactedCounts: Record<string, number> } {
  const counts: Record<string, number> = {
    pan: 0,
    aadhaar: 0,
    phone: 0,
    email: 0,
    account: 0
  };

  let text = rawText;

  // 1. Redact Indian Permanent Account Numbers (PAN): [A-Z]{5}[0-9]{4}[A-Z]{1}
  const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g;
  text = text.replace(panRegex, () => {
    counts.pan++;
    return '[REDACTED_PAN]';
  });

  // 2. Redact Aadhaar Numbers: 12 digits, often formatted as 4-4-4
  const aadhaarRegex = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
  text = text.replace(aadhaarRegex, () => {
    counts.aadhaar++;
    return '[REDACTED_AADHAAR]';
  });

  // 3. Redact Indian Phone Numbers: 10 digits starting with 6-9, optional +91 or 0 prefix
  const phoneRegex = /(?:\+91[\-\s]?|0)?[6-9]\d{4}[\-\s]?\d{5}\b/g;
  text = text.replace(phoneRegex, () => {
    counts.phone++;
    return '[REDACTED_PHONE]';
  });

  // 4. Redact Email Addresses
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  text = text.replace(emailRegex, () => {
    counts.email++;
    return '[REDACTED_EMAIL]';
  });

  // 5. Redact full savings/current bank account numbers (11 to 18 consecutive digits)
  // Ensure we do not accidentally redact shorter numbers or dates
  const accountRegex = /\b(?!Aicte)\d{11,18}\b/g;
  text = text.replace(accountRegex, match => {
    counts.account++;
    return `[REDACTED_ACCOUNT_${match.slice(-4)}]`;
  });

  return {
    redactedText: text,
    redactedCounts: counts
  };
}
