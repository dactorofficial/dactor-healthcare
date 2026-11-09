/**
 * Tabular Serializers
 * Exports tabular clinic datasets into structured JSON and RFC 4180-compliant CSV.
 */

/**
 * Serializes data into valid, 2-space indented JSON with schema metadata and record counts.
 * 
 * @param {any} data - Array of records, dataset map, or single entity object.
 * @param {number|object} [options] - Indentation number or configuration options.
 * @returns {string} Formatted JSON string
 */
export function toJSON(data, options = {}) {
  const indent = typeof options === 'number' ? options : (options?.indent ?? 2);
  const raw = typeof options === 'object' && options?.raw === true;

  if (raw || data === null || data === undefined || typeof data !== 'object') {
    return JSON.stringify(data, null, indent);
  }

  // Array of records
  if (Array.isArray(data)) {
    const wrapped = {
      schema_version: options?.schemaVersion || '1.0',
      count: data.length,
      exported_at: options?.exportedAt || new Date().toISOString(),
      records: data
    };
    return JSON.stringify(wrapped, null, indent);
  }

  // Object or dataset bundle
  const wrapped = {
    schema_version: data.schema_version || options?.schemaVersion || '1.0',
    exported_at: data.exported_at || options?.exportedAt || new Date().toISOString(),
    ...data
  };

  return JSON.stringify(wrapped, null, indent);
}

/**
 * Serializes data to raw JSON without extra metadata wrapping.
 * @param {any} data 
 * @param {number} [indent=2] 
 * @returns {string}
 */
export function toRawJSON(data, indent = 2) {
  return JSON.stringify(data, null, indent);
}

/**
 * Encodes a single cell value according to RFC 4180 rules.
 * @param {any} val 
 * @param {object} options 
 * @returns {string}
 */
function formatCSVCell(val, options = {}) {
  if (val === null || val === undefined) {
    return '';
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }

  if (val instanceof Date) {
    return val.toISOString();
  }

  // Complex objects & arrays -> valid JSON string, escaped per RFC 4180
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val);
    return `"${jsonStr.replace(/"/g, '""')}"`;
  }

  const str = String(val);

  // RFC 4180: If field contains comma, CRLF/newline, or double quotes, it must be enclosed in double quotes.
  // Any double quotes inside must be escaped with two double quotes ("").
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  if (options.quoteAll) {
    return `"${str}"`;
  }

  return str;
}

/**
 * Serializes an array of records into an RFC 4180-compliant CSV string.
 * - Escapes quotes as "" and encloses values with commas, quotes, or newlines in "...".
 * - Serializes complex objects (arrays, JSON objects like items) as valid JSON strings.
 * - Preserves nulls/empty fields cleanly.
 * 
 * @param {Array<object>|object} records - Array of record objects (or single record)
 * @param {object} [options] - Options: columns, includeHeader, lineEnding, quoteAll
 * @returns {string} RFC 4180-compliant CSV
 */
export function toCSV(records, options = {}) {
  const lineEnding = options?.lineEnding || '\r\n';
  const includeHeader = options?.includeHeader !== false;

  // Normalize single object to array
  let list = records;
  if (list && typeof list === 'object' && !Array.isArray(list)) {
    list = [list];
  }

  if (!Array.isArray(list) || list.length === 0) {
    if (options?.columns && options.columns.length > 0 && includeHeader) {
      return options.columns.map(col => formatCSVCell(col, options)).join(',') + lineEnding;
    }
    return '';
  }

  // Determine columns: use provided options.columns or compute union of all keys across records
  let columns = options?.columns;
  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    const keySet = new Set();
    for (const record of list) {
      if (record && typeof record === 'object') {
        for (const key of Object.keys(record)) {
          keySet.add(key);
        }
      }
    }
    columns = Array.from(keySet);
  }

  const lines = [];

  // 1. Header row
  if (includeHeader) {
    const headerRow = columns.map(col => formatCSVCell(col, options)).join(',');
    lines.push(headerRow);
  }

  // 2. Data rows
  for (const record of list) {
    const row = columns.map(col => {
      const val = record ? record[col] : undefined;
      return formatCSVCell(val, options);
    }).join(',');
    lines.push(row);
  }

  return lines.join(lineEnding) + lineEnding;
}

/**
 * RFC 4180-compliant CSV parser.
 * Reads CSV text into an array of objects matching headers.
 * 
 * @param {string} csvText 
 * @returns {Array<object>}
 */
export function parseCSV(csvText, options = {}) {
  if (!csvText || typeof csvText !== 'string' || csvText.trim().length === 0) {
    return [];
  }

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;

  let i = 0;
  const len = csvText.length;

  while (i < len) {
    const char = csvText[i];
    const nextChar = i + 1 < len ? csvText[i + 1] : '';

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: ""
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // End of quoted cell
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // skip \n of \r\n
        }
        currentRow.push(currentCell);
        currentCell = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentCell);
        currentCell = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0];
  const records = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip empty trailing rows
    if (row.length === 1 && row[0] === '' && r === rows.length - 1) {
      continue;
    }
    const record = {};
    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const rawVal = c < row.length ? row[c] : '';
      
      // Attempt JSON parse for objects/arrays
      if ((rawVal.startsWith('{') && rawVal.endsWith('}')) || (rawVal.startsWith('[') && rawVal.endsWith(']'))) {
        try {
          record[colName] = JSON.parse(rawVal);
          continue;
        } catch {
          // keep as string
        }
      }

      // Parse booleans if enabled
      if (options?.parseBooleans && rawVal === 'true') {
        record[colName] = true;
        continue;
      }
      if (options?.parseBooleans && rawVal === 'false') {
        record[colName] = false;
        continue;
      }

      // Parse numbers if requested
      if (options?.parseNumbers && /^-?\d+(\.\d+)?$/.test(rawVal)) {
        const num = Number(rawVal);
        if (!isNaN(num)) {
          record[colName] = num;
          continue;
        }
      }

      record[colName] = rawVal;
    }
    records.push(record);
  }

  return records;
}

export default {
  toJSON,
  toRawJSON,
  toCSV,
  parseCSV
};
