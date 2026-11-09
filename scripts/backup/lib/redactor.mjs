/**
 * Security Redaction Engine
 * In-memory recursive redaction of sensitive third-party credentials and gateway secrets.
 * Ensures zero secrets appear in raw form in any exported file or archive.
 */

export const REDACTED_VALUE = '[REDACTED]';

/**
 * List of known sensitive property names and patterns
 */
const SENSITIVE_KEY_EXACT = new Set([
  'payment_secret_key',
  'payment_api_key',
  'esewa_secret_key',
  'secret_key',
  'secret',
  'api_key',
  'apikey',
  'service_role_key',
  'service_role',
  'servicerole',
  'servicerolekey',
  'private_key',
  'privatekey',
  'access_token',
  'accesstoken',
  'auth_token',
  'authtoken',
  'id_token',
  'idtoken',
  'refresh_token',
  'refreshtoken',
  'bearer_token',
  'bearertoken',
  'password',
  'merchant_secret',
  'merchantsecret',
  'client_secret',
  'clientsecret',
  'webhook_secret',
  'webhooksecret',
  'esewasecretkey',
  'paymentsecretkey',
  'paymentapikey'
]);

/**
 * Checks whether a given key name is classified as sensitive and requires redaction.
 * @param {string} key 
 * @returns {boolean}
 */
export function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  const lower = key.trim().toLowerCase();
  const snake = lower.replace(/-/g, '_');
  const stripped = snake.replace(/_/g, '');
  
  if (SENSITIVE_KEY_EXACT.has(lower) || SENSITIVE_KEY_EXACT.has(snake) || SENSITIVE_KEY_EXACT.has(stripped)) {
    return true;
  }

  // Suffix or pattern matching
  if (
    snake.startsWith('secret_') ||
    snake.endsWith('_secret_key') ||
    snake.endsWith('_api_key') ||
    snake.endsWith('_secret') ||
    snake.endsWith('_private_key') ||
    snake.endsWith('_token') ||
    stripped.endsWith('secretkey') ||
    stripped.endsWith('apikey') ||
    stripped.endsWith('privatekey') ||
    stripped.endsWith('token') ||
    stripped.endsWith('secret')
  ) {
    return true;
  }

  return false;
}

/**
 * Redacts a clinic description field if it contains stringified JSON or plain-text secrets.
 * Preserves normal text descriptions while sanitizing JSON configurations (e.g. payment_gateways_json).
 * @param {any} description 
 * @returns {any}
 */
export function redactDescription(description) {
  if (typeof description !== 'string') {
    return redactSecrets(description);
  }

  const trimmed = description.trim();

  // If description is a JSON object/array string
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const redacted = redactSecrets(parsed);
      return JSON.stringify(redacted);
    } catch {
      // Fall through to regex redaction if JSON parsing fails
    }
  }

  // Regex redaction for embedded key-value pairs in text descriptions (quoted and unquoted)
  let sanitized = description;
  const regexPatterns = [
    /(["']?(?:payment[-_]?)?(?:secret|api)[-_]?key["']?\s*[:=]\s*["']?)([^"'\r\n\s,;]+)(["']?)/gi,
    /(["']?esewa[-_]?secret[-_]?key["']?\s*[:=]\s*["']?)([^"'\r\n\s,;]+)(["']?)/gi,
    /(["']?(?:private[-_]?key|client[-_]?secret|merchant[-_]?secret|webhook[-_]?secret|access[-_]?token|auth[-_]?token)["']?\s*[:=]\s*["']?)([^"'\r\n\s,;]+)(["']?)/gi,
    /(["']?secret(?:[-_]?key)?["']?\s*[:=]\s*["']?)([^"'\r\n\s,;]+)(["']?)/gi
  ];

  for (const pattern of regexPatterns) {
    sanitized = sanitized.replace(pattern, `$1${REDACTED_VALUE}$3`);
  }

  return sanitized;
}

/**
 * Deep recursive in-memory redaction.
 * Creates a sanitized deep clone of the input data, replacing sensitive credentials with [REDACTED].
 * Does NOT mutate the input object.
 * Preserves Directed Acyclic Graph (DAG) shared references while safely breaking circular cycles.
 * 
 * @param {any} data - Any JavaScript object, array, or primitive
 * @param {Set} [ancestors=new Set()] - Active call stack recursion tracker for circular reference detection
 * @param {WeakMap} [memo=new WeakMap()] - Memoization cache for DAG shared objects
 * @returns {any} Sanitized deep copy
 */
export function redactSecrets(data, ancestors = new Set(), memo = new WeakMap()) {
  if (data === null || data === undefined) {
    return data;
  }

  // Primitives
  if (typeof data !== 'object') {
    return data;
  }

  // Date objects - preserve ISO string / clone
  if (data instanceof Date) {
    return new Date(data.getTime());
  }

  // Buffer or Uint8Array - return copy
  if (ArrayBuffer.isView(data)) {
    return data;
  }

  // Ensure ancestors is a Set and memo is a WeakMap
  if (!(ancestors instanceof Set)) {
    ancestors = new Set();
  }
  if (!(memo instanceof WeakMap)) {
    memo = new WeakMap();
  }

  // Prevent circular reference infinite recursion (cycle back to an active ancestor in the recursion stack)
  if (ancestors.has(data)) {
    return '[Circular]';
  }

  // Return memoized copy for legitimate shared references in Directed Acyclic Graphs (DAGs)
  if (memo.has(data)) {
    return memo.get(data);
  }

  ancestors.add(data);
  try {
    // Arrays
    if (Array.isArray(data)) {
      const sanitizedArray = data.map(item => redactSecrets(item, ancestors, memo));
      memo.set(data, sanitizedArray);
      return sanitizedArray;
    }

    // Plain objects & Records
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      // 1. Direct sensitive key check
      if (isSensitiveKey(key)) {
        sanitized[key] = value === null || value === undefined ? value : REDACTED_VALUE;
        continue;
      }

      // 2. Free-text columns or string values containing sensitive key patterns
      const isFreeTextColumn =
        key === 'description' ||
        key === 'remarks' ||
        key === 'notes' ||
        key === 'activation_notes' ||
        key === 'memo';

      if (typeof value === 'string') {
        if (isFreeTextColumn) {
          sanitized[key] = redactDescription(value);
          continue;
        }

        if (
          value.includes('secret_key') ||
          value.includes('secretKey') ||
          value.includes('secret-key') ||
          value.includes('api_key') ||
          value.includes('apiKey') ||
          value.includes('api-key') ||
          value.includes('private_key') ||
          value.includes('privateKey') ||
          value.includes('private-key') ||
          value.includes('payment_secret') ||
          value.includes('esewa_secret')
        ) {
          sanitized[key] = redactDescription(value);
          continue;
        }
      }

      // 3. Special handling for payment_gateways_json stringified or object
      if (key === 'payment_gateways_json') {
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            sanitized[key] = JSON.stringify(redactSecrets(parsed, ancestors, memo));
            continue;
          } catch {
            sanitized[key] = redactDescription(value);
            continue;
          }
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = redactSecrets(value, ancestors, memo);
          continue;
        }
      }

      // 4. Nested string that might be stringified JSON containing secrets
      if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
        try {
          const parsed = JSON.parse(value.trim());
          if (typeof parsed === 'object' && parsed !== null) {
            const redactedParsed = redactSecrets(parsed, ancestors, memo);
            sanitized[key] = JSON.stringify(redactedParsed);
            continue;
          }
        } catch {
          // Not JSON, continue with normal assignment
        }
      }

      // 5. Recursive descent for nested objects/arrays
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = redactSecrets(value, ancestors, memo);
      } else {
        sanitized[key] = value;
      }
    }

    memo.set(data, sanitized);
    return sanitized;
  } finally {
    ancestors.delete(data);
  }
}

export default {
  REDACTED_VALUE,
  isSensitiveKey,
  redactDescription,
  redactSecrets
};
