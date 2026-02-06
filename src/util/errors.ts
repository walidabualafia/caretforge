/**
 * Base error class for CaretForge.
 */
export class CaretForgeError extends Error {
  public readonly code: string;

  constructor(
    message: string,
    code: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = 'CaretForgeError';
    this.code = code;
  }
}

/**
 * Error originating from a provider (API call failure, bad response, etc.).
 */
export class ProviderError extends CaretForgeError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, cause?: Error) {
    super(message, 'PROVIDER_ERROR', cause);
    this.name = 'ProviderError';
    this.statusCode = statusCode;
  }
}

/**
 * Error relating to configuration loading or validation.
 */
export class ConfigError extends CaretForgeError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}

/**
 * Error from tool execution (filesystem, shell, etc.).
 */
export class ToolError extends CaretForgeError {
  constructor(message: string, cause?: Error) {
    super(message, 'TOOL_ERROR', cause);
    this.name = 'ToolError';
  }
}

/**
 * Format an error for user-friendly display.
 */
export function formatError(err: unknown): string {
  if (err instanceof CaretForgeError) {
    const parts = [`[${err.code}] ${err.message}`];
    if (err.cause) {
      parts.push(`  Caused by: ${err.cause.message}`);
    }
    return parts.join('\n');
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
