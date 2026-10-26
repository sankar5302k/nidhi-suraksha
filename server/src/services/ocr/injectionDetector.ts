const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts)/i,
  /system\s+prompt/i,
  /you\s+are\s+now\s+(an?|the)/i,
  /mark\s+(this\s+)?as\s+(bank\s+)?verified/i,
  /bypass\s+(all\s+)?(security|verification)/i,
  /set\s+status\s+to\s+verified/i,
  /disregard\s+(the\s+)?above/i,
  /<script>/i,
  /eval\(/i
];

export interface InjectionDetectionResult {
  hasInjection: boolean;
  matchedPatterns: string[];
}

/**
 * Scans untrusted document text for prompt-injection instructions
 * independent of the LLM.
 */
export function detectPromptInjection(text: string): InjectionDetectionResult {
  const matchedPatterns: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push(pattern.source);
    }
  }

  return {
    hasInjection: matchedPatterns.length > 0,
    matchedPatterns
  };
}
