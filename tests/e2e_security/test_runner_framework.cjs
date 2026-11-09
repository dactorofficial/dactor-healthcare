/**
 * Lightweight, zero-external-dependency E2E test runner framework
 * Designed for Node.js v18+ on Windows PowerShell and POSIX terminals.
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
    if (!actual || !actual.includes(item)) {
      const msg = message || `Expected collection to include "${item}"`;
      throw new AssertionError(msg, item, actual);
    }
  },

  doesNotInclude(actual, item, message) {
    if (actual && actual.includes(item)) {
      const msg = message || `Expected collection NOT to include "${item}"`;
      throw new AssertionError(msg, `not ${item}`, actual);
    }
  },

  inRange(val, min, max, message) {
    if (typeof val !== 'number' || Number.isNaN(val) || val < min || val > max) {
      const msg = message || `Expected value ${val} to be in range [${min}, ${max}]`;
      throw new AssertionError(msg, `[${min}, ${max}]`, val);
    }
  },

  async throws(asyncFn, message) {
    let threw = false;
    let thrownError = null;
    try {
      await asyncFn();
    } catch (err) {
      threw = true;
      thrownError = err;
    }
    if (!threw) {
      throw new AssertionError(message || 'Expected function to throw, but it succeeded', 'Error thrown', 'No error');
    }
    return thrownError;
  }
};

class TestSuite {
  constructor(name, tier) {
    this.name = name;
    this.tier = tier; // 1, 2, 3, or 4
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

    for (const testCase of this.tests) {
      const start = Date.now();
      try {
        await testCase.fn(assert);
        const duration = Date.now() - start;
        this.results.push({
          name: testCase.name,
          status: 'PASS',
          duration,
          error: null
        });
        passed++;
        if (verbose) {
          console.log(`  ${colors.green}√ [PASS]${colors.reset} ${testCase.name} ${colors.gray}(${duration}ms)${colors.reset}`);
        }
      } catch (err) {
        const duration = Date.now() - start;
        this.results.push({
          name: testCase.name,
          status: 'FAIL',
          duration,
          error: err
        });
        failed++;
        if (verbose) {
          console.error(`  ${colors.red}X [FAIL]${colors.reset} ${testCase.name} ${colors.gray}(${duration}ms)${colors.reset}`);
          console.error(`    ${colors.red}${err.message}${colors.reset}`);
          if (err.expected !== undefined && err.actual !== undefined) {
            console.error(`    ${colors.dim}Expected:${colors.reset} ${JSON.stringify(err.expected)}`);
            console.error(`    ${colors.dim}Actual:  ${colors.reset} ${JSON.stringify(err.actual)}`);
          }
        }
      }
    }

    const totalDuration = Date.now() - tierStart;
    const summary = {
      name: this.name,
      tier: this.tier,
      total: this.tests.length,
      passed,
      failed,
      duration: totalDuration
    };

    if (verbose) {
      console.log(`\n  Tier ${this.tier} Summary: ${colors.bright}${passed}/${this.tests.length} passed${colors.reset} (${totalDuration}ms)`);
      if (failed > 0) {
        console.log(`  ${colors.bright}${colors.red}WARNING: ${failed} tests failed in Tier ${this.tier}!${colors.reset}`);
      }
    }

    return summary;
  }
}

function createTestSuite(name, tier) {
  return new TestSuite(name, tier);
}

module.exports = {
  colors,
  assert,
  AssertionError,
  TestSuite,
  createTestSuite
};
