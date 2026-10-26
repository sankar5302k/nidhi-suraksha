import {
  BankVerificationProvider,
  BankVerificationQuery,
  BankVerificationResponse
} from './BankVerificationProvider.js';

interface SeededBankRecord {
  bankName: string;
  fdrNumber: string;
  amount: number;
  maturityDate: string; // YYYY-MM-DD
  branch: string;
  lienInFavourOfAicte: boolean;
}

export class MockBankProvider implements BankVerificationProvider {
  private bankRegistry: SeededBankRecord[] = [
    {
      bankName: 'State Bank of India',
      fdrNumber: 'SBIN00012345',
      amount: 1500000,
      maturityDate: '2029-01-01',
      branch: 'Nariman Point, Mumbai',
      lienInFavourOfAicte: true
    },
    {
      bankName: 'HDFC Bank',
      fdrNumber: 'HDFC00098765',
      amount: 2500000,
      maturityDate: '2029-02-01',
      branch: 'Connaught Place, New Delhi',
      lienInFavourOfAicte: true
    },
    {
      bankName: 'Punjab National Bank',
      fdrNumber: 'PNB00055555',
      amount: 1000000,
      maturityDate: '2029-03-01',
      branch: 'Bandra, Mumbai',
      lienInFavourOfAicte: true
    },
    {
      bankName: 'Canara Bank',
      fdrNumber: 'CNRB00088899',
      amount: 1200000,
      maturityDate: '2029-05-01',
      branch: 'MG Road, Bengaluru',
      lienInFavourOfAicte: true
    },
    {
      // Intentionally seeded with 1,000,000 to test MISMATCH when institution claims 1,500,000
      bankName: 'Bank of Baroda',
      fdrNumber: 'BOB00077711',
      amount: 1000000,
      maturityDate: '2028-12-31',
      branch: 'Alkapuri, Vadodara',
      lienInFavourOfAicte: true
    }
  ];

  async verifyFdr(query: BankVerificationQuery): Promise<BankVerificationResponse> {
    const cleanBank = query.bankName.trim().toLowerCase();
    const cleanNumber = query.fdrNumber.trim().toUpperCase();

    const record = this.bankRegistry.find(
      r => r.bankName.toLowerCase() === cleanBank && r.fdrNumber.toUpperCase() === cleanNumber
    );

    if (!record) {
      return {
        status: 'NOT_FOUND',
        verifiedAt: new Date(),
        discrepancyNotes: `No active Fixed Deposit Receipt found in ${query.bankName} core banking records under number ${query.fdrNumber}.`
      };
    }

    // Check amount or date discrepancies
    const queryDateStr = new Date(query.maturityDate).toISOString().slice(0, 10);
    const amountMatches = Math.abs(record.amount - query.amount) < 0.01;
    const dateMatches = record.maturityDate === queryDateStr;

    if (!amountMatches || !dateMatches) {
      const issues: string[] = [];
      if (!amountMatches) {
        issues.push(`Amount mismatch: Bank confirms ₹${record.amount.toLocaleString('en-IN')}, institution claimed ₹${query.amount.toLocaleString('en-IN')}`);
      }
      if (!dateMatches) {
        issues.push(`Maturity date mismatch: Bank records show ${record.maturityDate}, institution claimed ${queryDateStr}`);
      }

      return {
        status: 'MISMATCH',
        verifiedAt: new Date(),
        bankResponseDetails: {
          bankName: record.bankName,
          branchName: record.branch,
          confirmedAmount: record.amount,
          confirmedMaturityDate: record.maturityDate,
          lienConfirmed: record.lienInFavourOfAicte
        },
        discrepancyNotes: issues.join('; ')
      };
    }

    // Exact verification
    const refCode = `BNK-VER-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

    return {
      status: 'VERIFIED',
      verificationReference: refCode,
      verifiedAt: new Date(),
      bankResponseDetails: {
        bankName: record.bankName,
        branchName: record.branch,
        confirmedAmount: record.amount,
        confirmedMaturityDate: record.maturityDate,
        lienConfirmed: record.lienInFavourOfAicte
      }
    };
  }

  addRecord(record: SeededBankRecord): void {
    this.bankRegistry.push(record);
  }
}

export const mockBankProvider = new MockBankProvider();
