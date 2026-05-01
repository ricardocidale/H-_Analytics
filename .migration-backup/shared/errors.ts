function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, 12);
}

export class FinancialCalculationError extends Error {
  public readonly propertyId: number | string;
  public readonly calculationType: string;
  public readonly inputHash: string;
  public readonly engineVersion: string;

  constructor(
    message: string,
    options: {
      propertyId: number | string;
      calculationType: string;
      inputs?: Record<string, unknown>;
      engineVersion?: string;
    },
  ) {
    super(message);
    this.name = "FinancialCalculationError";
    this.propertyId = options.propertyId;
    this.calculationType = options.calculationType;
    this.engineVersion = options.engineVersion ?? "1.0.0";
    this.inputHash = options.inputs
      ? simpleHash(JSON.stringify(options.inputs))
      : "unknown";
  }

  toSentryTags(): Record<string, string> {
    return {
      propertyId: String(this.propertyId),
      calculationType: this.calculationType,
      inputHash: this.inputHash,
      engineVersion: this.engineVersion,
    };
  }
}
