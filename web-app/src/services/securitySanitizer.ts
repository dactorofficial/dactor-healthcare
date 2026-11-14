/**
 * Dactor Healthcare Platform: Security Sanitization & Injection Prevention Layer
 *
 * Provides defense-in-depth against:
 * 1. Classic SQL Injection (tautologies, stacked queries, UNION SELECT, pg_sleep)
 * 2. PostgREST AST Filter Injection (operator tampering, unescaped commas/parentheses in .or() / .filter())
 * 3. Cross-Site Scripting (XSS) input contamination in query parameters
 * 4. Resource exhaustion / DoS via oversized input strings
 */

// Regex patterns detecting dangerous SQL injection primitives
const SQLI_PATTERNS = [
  /(\b(UNION(\s+ALL)?|SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|EXEC(UTE)?|PG_SLEEP|BENCHMARK)\b)/i,
  /(--|;\s*$|\/\*|\*\/|@@)/,
  /('|\b)OR(\s+true|\s+'?[1-9]\d*'?'?='?[1-9]\d*'?)(\s|--|;|$)/i,
  /('|\b)AND(\s+false|\s+'?[1-9]\d*'?'?!='?[1-9]\d*'?)(\s|--|;|$)/i,
  /(\b(INFORMATION_SCHEMA|PG_CATALOG|VERSION\(\))\b)/i,
]

// Regex detecting PostgREST filter operator keywords and delimiters
const POSTGREST_OPERATORS = /\b(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|sl|sr|nxr|nxl|adj|not)\b/i
const POSTGREST_DELIMITERS = /[,():;"']/g

// Valid UUID format (v4 / general UUID format)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Valid Tracking Code format (4 to 12 alphanumeric characters)
const TRACKING_CODE_REGEX = /^[A-Za-z0-9]{4,12}$/

// Valid Phone format (7 to 15 digits with optional leading +)
const PHONE_REGEX = /^\+?[0-9]{7,15}$/

export interface InjectionCheckResult {
  isSuspicious: boolean
  matchedPattern?: string
  sanitized: string
}

/**
 * Checks if a string contains known SQL injection or stacked command patterns.
 */
export function detectSqlInjection(input: string): { isSuspicious: boolean; matchedPattern?: string } {
  if (!input || typeof input !== 'string') return { isSuspicious: false }

  const trimmed = input.trim()
  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isSuspicious: true, matchedPattern: pattern.source }
    }
  }

  return { isSuspicious: false }
}

/**
 * Checks if a string attempts to inject PostgREST filter operators or delimiters.
 */
export function detectPostgrestFilterInjection(input: string): { isSuspicious: boolean; reason?: string } {
  if (!input || typeof input !== 'string') return { isSuspicious: false }

  // Detect unescaped PostgREST syntax delimiters like commas, parens, quotes
  if (POSTGREST_DELIMITERS.test(input)) {
    return { isSuspicious: true, reason: 'Contains PostgREST delimiters' }
  }

  // Detect embedded operators like .eq., .neq., .gt.
  if (/\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|not)\./i.test(input)) {
    return { isSuspicious: true, reason: 'Contains embedded PostgREST operator' }
  }

  return { isSuspicious: false }
}

/**
 * Sanitizes free-form text search input (e.g., patient name, clinic name, doctor search).
 * Strips SQL and PostgREST metacharacters while keeping valid human text (alphanumeric, spaces, hyphens).
 */
export function sanitizeSearchQuery(query: string, maxLength = 64): string {
  if (!query || typeof query !== 'string') return ''

  return query
    .trim()
    // Remove SQL comment tokens and delimiters
    .replace(/--/g, ' ')
    .replace(/['"`;\\%_]/g, '')
    // Remove PostgREST filter delimiters
    .replace(/[,()]/g, ' ')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

/**
 * Validates and sanitizes a UUID string. Returns null if invalid or tampered.
 */
export function sanitizeUuid(id: unknown): string | null {
  if (typeof id !== 'string') return null
  const clean = id.trim().toLowerCase()
  return UUID_REGEX.test(clean) ? clean : null
}

/**
 * Validates and sanitizes a 10-digit / alphanumeric appointment tracking code.
 * Returns null if invalid or tampered.
 */
export function sanitizeTrackingCode(code: unknown): string | null {
  if (typeof code !== 'string') return null
  const clean = code.trim().toUpperCase()
  return TRACKING_CODE_REGEX.test(clean) ? clean : null
}

/**
 * Validates and sanitizes a patient phone number. Returns null if invalid or tampered.
 */
export function sanitizePhoneNumber(phone: unknown): string | null {
  if (typeof phone !== 'string') return null
  const clean = phone.trim().replace(/[\s\-()]/g, '')
  return PHONE_REGEX.test(clean) ? clean : null
}

/**
 * Builds a safe PostgREST `.or(...)` filter string from a list of validated clauses.
 * Guarantees that values cannot inject delimiters (`,`, `(`, `)`) or alter query logic.
 */
export function buildSafePostgrestOrFilter(
  clauses: Array<{
    column: string
    op: 'eq' | 'ilike' | 'like' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
    value: string
  }>
): string | null {
  if (!clauses || clauses.length === 0) return null

  const validClauses: string[] = []

  for (const clause of clauses) {
    const col = clause.column.trim()
    // Column must only contain safe alphanumeric and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(col)) continue

    const val = clause.value.trim()
    if (!val) continue

    if (clause.op === 'ilike' || clause.op === 'like') {
      // For ilike, sanitize search term to prevent filter tampering
      const safeVal = sanitizeSearchQuery(val, 64)
      if (safeVal) {
        validClauses.push(`${col}.${clause.op}.%${safeVal}%`)
      }
    } else {
      // For equality, ensure no delimiters exist in value
      const safeVal = val.replace(/[,()]/g, '').trim()
      if (safeVal) {
        validClauses.push(`${col}.${clause.op}.${safeVal}`)
      }
    }
  }

  if (validClauses.length === 0) return null
  return validClauses.join(',')
}
