const SECRET_KEY_PATTERNS = [/apiKey/i, /secret/i, /password/i, /token/i, /credential/i, /key$/i];

/**
 * Redact a single secret string, showing only first 4 and last 2 characters.
 */
export function redactValue(value: string): string {
  if (!value || value.length < 8) {
    return '******';
  }
  return value.slice(0, 4) + '****' + value.slice(-2);
}

/**
 * Return true if a key name looks like it holds a secret.
 */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((p) => p.test(key));
}

/**
 * Deep-clone an object, replacing any string values whose keys match
 * secret patterns with a redacted version.
 */
export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>;

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && isSecretKey(key)) {
      result[key] = redactValue(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return redactObject(item as Record<string, unknown>);
        }
        return item;
      });
    }
  }

  return result as T;
}
