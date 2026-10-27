export type CspViolation = {
  directive: string;
  source: string;
  line: number;
  blocked: string;
};

export function isScreenshotStyle(violation: CspViolation): boolean {
  return (
    violation.directive === "style-src-elem" &&
    violation.source === "" &&
    violation.line === 5 &&
    violation.blocked === "inline"
  );
}

export async function captureWithCspEvent<T>(
  capture: () => Promise<T>,
  blockedStyle: Promise<unknown>,
): Promise<T> {
  // Both promises must settle before the caller closes its tooling allowance.
  // Console delivery can follow completion of the screenshot protocol command.
  const [result] = await Promise.all([capture(), blockedStyle]);
  return result;
}
