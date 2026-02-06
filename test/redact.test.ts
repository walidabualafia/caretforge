import { describe, it, expect } from 'vitest';
import { redactValue, redactObject, isSecretKey } from '../src/util/redact.js';

describe('redactValue', () => {
  it('redacts a long string showing first 4 and last 2 chars', () => {
    expect(redactValue('sk-abc123456xyz')).toBe('sk-a****yz');
  });

  it('fully redacts short strings', () => {
    expect(redactValue('short')).toBe('******');
    expect(redactValue('')).toBe('******');
  });

  it('handles exactly 8 character strings', () => {
    const result = redactValue('12345678');
    expect(result).toBe('1234****78');
  });
});

describe('isSecretKey', () => {
  it('matches common secret key patterns', () => {
    expect(isSecretKey('apiKey')).toBe(true);
    expect(isSecretKey('API_KEY')).toBe(true);
    expect(isSecretKey('secretToken')).toBe(true);
    expect(isSecretKey('password')).toBe(true);
    expect(isSecretKey('dbPassword')).toBe(true);
  });

  it('does not match non-secret keys', () => {
    expect(isSecretKey('endpoint')).toBe(false);
    expect(isSecretKey('name')).toBe(false);
    expect(isSecretKey('description')).toBe(false);
  });
});

describe('redactObject', () => {
  it('redacts string values for keys matching secret patterns', () => {
    const input = {
      endpoint: 'https://example.com',
      apiKey: 'sk-abc123456xyz',
    };
    const result = redactObject(input);

    expect(result.endpoint).toBe('https://example.com');
    expect(result.apiKey).toBe('sk-a****yz');
  });

  it('handles nested objects', () => {
    const input = {
      providers: {
        azure: {
          endpoint: 'https://example.com',
          apiKey: 'long-secret-key-here-1234',
        },
      },
    };
    const result = redactObject(input);

    expect((result.providers as Record<string, Record<string, string>>)['azure']?.['apiKey']).toBe(
      'long****34',
    );
    expect(
      (result.providers as Record<string, Record<string, string>>)['azure']?.['endpoint'],
    ).toBe('https://example.com');
  });

  it('handles arrays of objects', () => {
    const input = {
      items: [{ apiKey: 'secret-value-12345' }, { name: 'safe' }],
    };
    const result = redactObject(input);

    expect((result.items as Array<Record<string, string>>)[0]?.['apiKey']).toBe('secr****45');
    expect((result.items as Array<Record<string, string>>)[1]?.['name']).toBe('safe');
  });

  it('does not mutate the original object', () => {
    const input = { apiKey: 'my-secret-api-key-value' };
    const copy = { ...input };
    redactObject(input);
    expect(input.apiKey).toBe(copy.apiKey);
  });
});
