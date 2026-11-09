/**
 * Lightweight, zero-external-dependency E2E test runner framework
 * Designed for Node.js v18+ / v24+ on Windows PowerShell and POSIX terminals.
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

class AssertionError extends Error {
  constructor(message, expected, actual) {
    super(message);
    this.name = 'AssertionError';
    this.expected = expected;
    this.actual = actual;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

const assert = {
  ok(condition, message = 'Condition expected to be truthy') {
    if (!condition) {
      throw new AssertionError(message, true, condition);
    }
  },

  equal(actual, expected, message) {
    if (actual !== expected) {
      const msg = message || `Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`;
      throw new AssertionError(msg, expected, actual);
    }
  },

  notEqual(actual, expected, message) {
    if (actual === expected) {
      const msg = message || `Expected not to equal: ${JSON.stringify(expected)}`;
      throw new AssertionError(msg, `not ${expected}`, actual);
    }
  },

  deepEqual(actual, expected, message) {
    const actStr = JSON.stringify(actual);
    const expStr = JSON.stringify(expected);
    if (actStr !== expStr) {
      const msg = message || `Deep equal failure.\nExpected: ${expStr}\nActual:   ${actStr}`;
      throw new AssertionError(msg, expected, actual);
    }
  },

  match(actual, regex, message) {
    if (typeof actual !== 'string' || !regex.test(actual)) {
      const msg = message || `String "${actual}" does not match regex ${regex}`;
      throw new AssertionError(msg, regex.toString(), actual);
    }
  },

  doesNotMatch(actual, regex, message) {
    if (typeof actual === 'string' && regex.test(actual)) {
      const msg = message || `String "${actual}" unexpectedly matches regex ${regex}`;
      throw new AssertionError(msg, `not ${regex.toString()}`, actual);
    }
  },

  includes(actual, item, message) {
    if (typeof actual === 'string') {
      if (!actual.includes(item)) {
        throw new AssertionError(message || `Expected string to include "${item}"`, item, actual);
      }
    } else if (Array.isArray(actual)) {
      if (!actual.includes(item)) {
        throw new AssertionError(message || `Expected array to include "${JSON.stringify(item)}"`, item, actual);
      }
    } else if (actual && typeof actual === 'object') {
      if (!(item in actual)) {
        throw new AssertionError(message || `Expected object to have key "${item}"`, item, Object.keys(actual));
      }
    } else {
      throw new AssertionError(message || `Collection did not contain item`, item, actual);
    }
  },

  doesNotInclude(actual, item, message) {
    if (typeof actual === 'string') {
      if (actual.includes(item)) {
        throw new AssertionError(message || `Expected string NOT to include "${item}"`, `not "${item}"`, actual);
      }
    } else if (Array.isArray(actual)) {
      if (actual.includes(item)) {
        throw new AssertionError(message || `Expected array NOT to include "${JSON.stringify(item)}"`, `not ${item}`, actual);
      }
    } else if (actual && typeof actual === 'object') {
      if (item in actual) {
        throw new AssertionError(message || `Expected object NOT to have key "${item}"`, `not "${item}"`, Object.keys(actual));
      }
    }
  },

  inRange(val, min, max, message) {
    if (typeof val !== 'number' || Number.isNaN(val) || val < min || val > max) {
      const msg = message || `Expected value ${val} to be in range [${min}, ${max}]`;
      throw new AssertionError(msg, `[${min}, ${max}]`, val);
    }
  },

  isUUID(val, message = 'Expected string to be a valid UUIDv4') {
    if (typeof val !== 'string' || !UUID_REGEX.test(val)) {
      throw new AssertionError(message, 'UUIDv4 string', val);
    }
  },

  isISODate(val, message = 'Expected string to be a valid ISO 8601 UTC timestamp') {
    if (typeof val !== 'string' || !ISO_DATE_REGEX.test(val) || Number.isNaN(Date.parse(val))) {
      throw new AssertionError(message, 'ISO 8601 UTC timestamp', val);
    }
  },

  isSHA256(val, message = 'Expected string to be a 64-character hex SHA-256 hash') {
    if (typeof val !== 'string' || !SHA256_REGEX.test(val)) {
      throw new AssertionError(message, '64-hex SHA-256 hash', val);
    }
  },

  async throws(fn, expectedPattern, message) {
    let threw = false;
    let thrownError = null;
    try {
      const res = fn();
      if (res && typeof res.then === 'function') {
        await res;
      }
    } catch (err) {
      threw = true;
      thrownError = err;
    }
    if (!threw) {
      throw new AssertionError(message || 'Expected function to throw, but it succeeded', 'Error thrown', 'No error');
    }
    if (expectedPattern) {
      if (expectedPattern instanceof RegExp) {
        if (!expectedPattern.test(thrownError.message)) {
          throw new AssertionError(
            message || `Thrown error message "${thrownError.message}" does not match ${expectedPattern}`,
            expectedPattern.toString(),
            thrownError.message
          );
        }
      } else if (typeof expectedPattern === 'string') {
        if (!thrownError.message.includes(expectedPattern)) {
          throw new AssertionError(
            message || `Thrown error message "${thrownError.message}" does not contain "${expectedPattern}"`,
            expectedPattern,
            thrownError.message
          );
        }
      }
    }
  },

  doesNotThrow(fn, message) {
    try {
      fn();
    } catch (err) {
      throw new AssertionError(message || `Expected function not to throw, but got error: ${err.message}`, 'No error', err.message);
    }
  }
};

class TestSuite {
  constructor(name, tier) {
    this.name = name;
    this.tier = tier;
    this.tests = [];
    this.results = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run(verbose = true) {
    if (verbose) {
      console.log(`\n${colors.bright}${colors.cyan}======================================================================${colors.reset}`);
      console.log(`${colors.bright}${colors.cyan}  TIER ${this.tier}: ${this.name.toUpperCase()}${colors.reset}`);
      console.log(`${colors.bright}${colors.cyan}======================================================================${colors.reset}`);
    }

    const tierStart = Date.now();
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < this.tests.length; i++) {
      const { name, fn } = this.tests[i];
      const start = Date.now();
      try {
        const res = fn(assert);
        if (res && typeof res.then === 'function') {
          await res;
        }
        const duration = Date.now() - start;
        passed++;
        this.results.push({ name, status: 'PASS', duration });
        if (verbose) {
          console.log(`  ${colors.green}√${colors.reset} [Tier ${this.tier}] ${name} ${colors.dim}(${duration}ms)${colors.reset}`);
        }
      } catch (err) {
        const duration = Date.now() - start;
        failed++;
        this.results.push({ name, status: 'FAIL', duration, error: err });
        if (verbose) {
          console.log(`  ${colors.red}×${colors.reset} [Tier ${this.tier}] ${name} ${colors.dim}(${duration}ms)${colors.reset}`);
          console.log(`    ${colors.red}Error: ${err.message}${colors.reset}`);
          if (err.expected !== undefined && err.actual !== undefined) {
            console.log(`    ${colors.gray}Expected: ${JSON.stringify(err.expected)}${colors.reset}`);
            console.log(`    ${colors.gray}Actual:   ${JSON.stringify(err.actual)}${colors.reset}`);
          }
          if (err.stack) {
            const stackLines = err.stack.split('\n').slice(1, 4).join('\n');
            console.log(`    ${colors.gray}${stackLines}${colors.reset}`);
          }
        }
      }
    }

    const tierDuration = Date.now() - tierStart;
    const summary = {
      tier: this.tier,
      name: this.name,
      total: this.tests.length,
      passed,
      failed,
      duration: tierDuration
    };

    if (verbose) {
      const color = failed === 0 ? colors.green : colors.red;
      console.log(`\n  Tier ${this.tier} Summary: ${color}${passed}/${this.tests.length} passed${colors.reset} in ${tierDuration}ms`);
    }

    return summary;
  }
}

function createTestSuite(name, tier) {
  return new TestSuite(name, tier);
}

module.exports = {
  assert,
  createTestSuite,
  colors
};
