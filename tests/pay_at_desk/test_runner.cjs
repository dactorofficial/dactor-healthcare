/**
 * Zero-dependency asynchronous test harness and assertion engine
 * Designed for Node.js v18+ CommonJS on Windows PowerShell and POSIX terminals.
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

  throws(fn, expectedRegexOrMsg, message) {
    let threw = false;
    let thrownError = null;
    try {
      fn();
    } catch (err) {
      threw = true;
      thrownError = err;
    }
    if (!threw) {
      throw new AssertionError(message || 'Expected function to throw an error, but it did not', 'Error thrown', 'No error');
    }
    if (expectedRegexOrMsg) {
      const errMsg = thrownError ? thrownError.message || String(thrownError) : '';
      if (expectedRegexOrMsg instanceof RegExp) {
        if (!expectedRegexOrMsg.test(errMsg)) {
          throw new AssertionError(`Thrown error "${errMsg}" does not match pattern ${expectedRegexOrMsg}`, expectedRegexOrMsg.toString(), errMsg);
        }
      } else if (typeof expectedRegexOrMsg === 'string') {
        if (!errMsg.toLowerCase().includes(expectedRegexOrMsg.toLowerCase())) {
          throw new AssertionError(`Thrown error "${errMsg}" does not contain "${expectedRegexOrMsg}"`, expectedRegexOrMsg, errMsg);
        }
      }
    }
  },

  async rejects(asyncFn, expectedRegexOrMsg, message) {
    let threw = false;
    let thrownError = null;
    try {
      await asyncFn();
    } catch (err) {
      threw = true;
      thrownError = err;
    }
    if (!threw) {
      throw new AssertionError(message || 'Expected async function to reject, but it resolved', 'Rejection', 'Resolved');
    }
    if (expectedRegexOrMsg) {
      const errMsg = thrownError ? thrownError.message || String(thrownError) : '';
      if (expectedRegexOrMsg instanceof RegExp) {
        if (!expectedRegexOrMsg.test(errMsg)) {
          throw new AssertionError(`Thrown error "${errMsg}" does not match pattern ${expectedRegexOrMsg}`, expectedRegexOrMsg.toString(), errMsg);
        }
      } else if (typeof expectedRegexOrMsg === 'string') {
        if (!errMsg.toLowerCase().includes(expectedRegexOrMsg.toLowerCase())) {
          throw new AssertionError(`Thrown error "${errMsg}" does not contain "${expectedRegexOrMsg}"`, expectedRegexOrMsg, errMsg);
        }
      }
    }
  }
};

class TestHarness {
  constructor(tierName) {
    this.tierName = tierName;
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
    this.startTime = 0;
    this.endTime = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    this.startTime = Date.now();
    console.log(`\n${colors.bright}${colors.cyan}======================================================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  ${this.tierName.toUpperCase()}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}======================================================================${colors.reset}`);

    for (const t of this.tests) {
      const testStart = Date.now();
      try {
        await t.fn();
        const duration = Date.now() - testStart;
        this.passed++;
        console.log(`  ${colors.green}√ [PASS]${colors.reset} ${t.name} ${colors.gray}(${duration}ms)${colors.reset}`);
      } catch (err) {
        const duration = Date.now() - testStart;
        this.failed++;
        console.log(`  ${colors.red}× [FAIL]${colors.reset} ${t.name} ${colors.gray}(${duration}ms)${colors.reset}`);
        console.log(`    ${colors.red}Error: ${err.message}${colors.reset}`);
        if (err.expected !== undefined && err.actual !== undefined) {
          console.log(`    ${colors.yellow}Expected: ${JSON.stringify(err.expected)}${colors.reset}`);
          console.log(`    ${colors.yellow}Actual:   ${JSON.stringify(err.actual)}${colors.reset}`);
        }
        if (err.stack && !err.expected) {
          console.log(`    ${colors.gray}${err.stack.split('\n').slice(1, 4).join('\n    ')}${colors.reset}`);
        }
        this.errors.push({ testName: t.name, error: err });
      }
    }

    this.endTime = Date.now();
    const totalTime = this.endTime - this.startTime;
    console.log(`\n  ${colors.bright}${this.tierName} Summary: ${this.passed}/${this.tests.length} passed (${totalTime}ms)${colors.reset}`);

    return {
      name: this.tierName,
      passed: this.passed,
      failed: this.failed,
      total: this.tests.length,
      timeMs: totalTime,
      errors: this.errors
    };
  }
}

module.exports = {
  assert,
  colors,
  AssertionError,
  TestHarness
};
