export interface ScanResult {
  isClean: boolean;
  threatName?: string;
}

/**
 * Antivirus scanning hook.
 *
 * TODO (Production ClamAV Integration):
 * In production, connect to a running clamd daemon via TCP (e.g., port 3310)
 * or unix domain socket using clamdjs or clamscan:
 *
 * ```ts
 * const scanner = clamav.createScanner(3310, '127.0.0.1');
 * const result = await scanner.scanBuffer(buffer);
 * return { isClean: !result.isInfected, threatName: result.viruses[0] };
 * ```
 */
export async function scanFileBuffer(buffer: Buffer): Promise<ScanResult> {
  // Check for EICAR standard test signature in non-production/test environments
  const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  if (buffer.toString('utf-8').includes(eicarString)) {
    return {
      isClean: false,
      threatName: 'EICAR-Test-Signature'
    };
  }

  // Clean by default for prototype/dev
  return {
    isClean: true
  };
}
