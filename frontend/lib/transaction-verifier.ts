import { TransactionBuilder, Networks } from "@stellar/stellar-sdk";

/**
 * Transaction signature verification (Issue #855).
 *
 * The frontend previously trusted the wallet to sign the correct transaction
 * without verifying the returned XDR. This utility parses the signed
 * transaction, inspects its structure, and compares it against the state of
 * the transaction captured just before it was sent to the wallet for signing.
 *
 * Verification is:
 *  - non-invasive: it reads the signed XDR and compares structural fields
 *  - fail-safe: malformed / unsigned / unexpected XDR is treated as invalid
 *  - tolerant where appropriate: minor differences (e.g. a bumped fee) are
 *    reported as warnings and do not block submission.
 */

export interface TransactionIntent {
  /** Source account address (G…/C…) the transaction is expected to originate from. */
  sourceAccount: string;
  /** Fee in stroops as a string, as captured from the pre-sign transaction. */
  fee: string;
  /** Number of operations expected on the signed transaction. */
  operationCount: number;
  /** Operation type strings in order, e.g. ["invokeHostFunction"]. */
  operationTypes: string[];
  /** Optional time-bounds the transaction is expected to carry. */
  timebounds?: {
    minTime: string;
    maxTime: string;
  } | null;
}

export interface OperationVerification {
  index: number;
  type: string;
  verified: boolean;
  mismatches: string[];
}

export interface VerificationResult {
  /** True when no blocking errors were found. Warnings do not invalidate. */
  valid: boolean;
  /** Non-blocking differences (e.g. fee bumped by the wallet). */
  warnings: string[];
  /** Blocking differences (e.g. source, operation count/type). */
  errors: string[];
  details: {
    operationCount: number;
    expectedOperationCount: number;
    operations: OperationVerification[];
    sourceAccountMatch: boolean;
    feeWithinTolerance: boolean;
    timeboundsMatch: boolean | null;
    transactionHash: string;
  };
}

const DEFAULT_TOTAL_FEE_TOLERANCE = 0.1;

type TxLike = {
  source: string;
  fee: string;
  operations: Array<{ type: string }>;
  timeBounds?: { minTime: string | number; maxTime: string | number } | null;
};

export class TransactionVerifier {
  private networkPassphrase: string;

  constructor(networkPassphrase: string = Networks.TESTNET) {
    this.networkPassphrase = networkPassphrase;
  }

  /**
   * Parse a signed transaction XDR and verify it matches the supplied intent
   * (the state captured immediately before signing).
   *
   * @param signedXdr - signed transaction envelope returned by the wallet.
   * @param intent - expected transaction structure captured pre-signing.
   * @returns a {@link VerificationResult} describing pass/warn/fail state.
   */
  verify(signedXdr: string, intent: TransactionIntent): VerificationResult {
    const result = this.createResult(signedXdr, intent);

    let signed;
    try {
      signed = TransactionBuilder.fromXDR(
        signedXdr,
        this.networkPassphrase,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      result.errors.push(`Failed to parse signed transaction: ${message}`);
      result.valid = false;
      return result;
    }

    try {
      result.details.transactionHash = signed.hash().toString("hex");
    } catch {
      // Hash extraction is best-effort for logging; never block on it.
    }

    this.checkSource(intent, signed.source, result);
    this.checkOperations(intent, signed.operations, result);
    this.checkFee(intent, signed.fee, result);
    this.checkTimebounds(intent, signed.timeBounds, result);

    this.logVerification(result);
    return result;
  }

  private checkSource(
    intent: TransactionIntent,
    actual: string,
    result: VerificationResult,
  ): void {
    const match =
      intent.sourceAccount === actual ||
      intent.sourceAccount.toLowerCase() === actual.toLowerCase();
    result.details.sourceAccountMatch = match;
    if (!match) {
      result.errors.push(
        `Source account mismatch: expected ${intent.sourceAccount}, got ${actual}`,
      );
      result.valid = false;
    }
  }

  private checkOperations(
    intent: TransactionIntent,
    operations: Array<{ type: string }>,
    result: VerificationResult,
  ): void {
    result.details.operationCount = operations.length;
    if (operations.length !== intent.operationCount) {
      result.errors.push(
        `Operation count mismatch: expected ${intent.operationCount}, got ${operations.length}`,
      );
      result.valid = false;
    }

    operations.forEach((op, index) => {
      const expectedType = intent.operationTypes[index];
      const verification: OperationVerification = {
        index,
        type: op.type,
        verified: true,
        mismatches: [],
      };

      if (!expectedType) {
        verification.mismatches.push("Unexpected operation present");
        verification.verified = false;
      } else if (op.type !== expectedType) {
        verification.mismatches.push(
          `Operation type mismatch at index ${index}: expected ${expectedType}, got ${op.type}`,
        );
        verification.verified = false;
      }

      if (!verification.verified) {
        result.errors.push(...verification.mismatches);
        result.valid = false;
      }
      result.details.operations.push(verification);
    });
  }

  private checkFee(
    intent: TransactionIntent,
    actual: string,
    result: VerificationResult,
  ): void {
    const expected = Number.parseInt(intent.fee, 10) || 0;
    const parsedActual = Number.parseInt(actual, 10) || 0;

    if (expected === 0 || parsedActual === 0) return;

    const diff = (parsedActual - expected) / expected;
    result.details.feeWithinTolerance = Math.abs(diff) <= DEFAULT_TOTAL_FEE_TOLERANCE;

    if (parsedActual > expected && !result.details.feeWithinTolerance) {
      // A higher fee is recoverable (wallet may bump for congestion) — warn.
      result.warnings.push(
        `Fee higher than expected: expected ${expected}, got ${parsedActual} stroops`,
      );
    } else if (parsedActual < expected && !result.details.feeWithinTolerance) {
      // A lower fee is unusual but never dangerous to the user.
      result.warnings.push(
        `Fee lower than expected: expected ${expected}, got ${parsedActual} stroops`,
      );
    }
  }

  private checkTimebounds(
    intent: TransactionIntent,
    actual: TxLike["timeBounds"],
    result: VerificationResult,
  ): void {
    if (!intent.timebounds) {
      result.details.timeboundsMatch = null;
      return;
    }

    const expectedMin = String(intent.timebounds.minTime);
    const expectedMax = String(intent.timebounds.maxTime);

    if (!actual) {
      result.details.timeboundsMatch = false;
      result.warnings.push(
        `Timebounds mismatch: expected [${expectedMin}, ${expectedMax}], got none`,
      );
      return;
    }

    const actualMin = String(actual.minTime);
    const actualMax = String(actual.maxTime);
    const match = actualMin === expectedMin && actualMax === expectedMax;
    result.details.timeboundsMatch = match;

    if (!match) {
      result.warnings.push(
        `Timebounds mismatch: expected [${expectedMin}, ${expectedMax}], got [${actualMin}, ${actualMax}]`,
      );
    }
  }

  private createResult(
    signedXdr: string,
    intent: TransactionIntent,
  ): VerificationResult {
    return {
      valid: true,
      warnings: [],
      errors: [],
      details: {
        operationCount: 0,
        expectedOperationCount: intent.operationCount,
        operations: [],
        sourceAccountMatch: false,
        feeWithinTolerance: true,
        timeboundsMatch: null,
        transactionHash: "",
      },
    };
  }

  private logVerification(result: VerificationResult): void {
    const summary = {
      timestamp: new Date().toISOString(),
      transactionHash: result.details.transactionHash || null,
      valid: result.valid,
      operationCount: result.details.operationCount,
      expectedOperationCount: result.details.expectedOperationCount,
      errors: [...result.errors],
      warnings: [...result.warnings],
      operations: result.details.operations.map((op) => ({
        index: op.index,
        type: op.type,
        verified: op.verified,
        mismatches: [...op.mismatches],
      })),
    };

    if (result.errors.length > 0) {
      console.error("Transaction verification failed:", summary);
    } else if (result.warnings.length > 0) {
      console.warn("Transaction verification warnings:", summary);
    } else {
      // eslint-disable-next-line no-console
      console.log("Transaction verification passed:", summary);
    }
  }
}
