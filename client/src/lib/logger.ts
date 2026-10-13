/**
 * Dev-only logger. Diagnostic logs are silenced in production builds while
 * genuine warnings/errors keep using console.warn / console.error directly.
 */
export const debugLog = import.meta.env.DEV
  ? (...args: unknown[]): void => console.log(...args)
  : (): void => {};
