/**
 * In-Memory Mock Supabase Client for Milestone 2 Unit Testing
 */

export interface MockSupabaseTable {
  records: Map<string, any>;
}

export class MockSupabaseClient {
  public tables: Map<string, Map<string, any>> = new Map();
  public shouldFailNext: boolean = false;
  public failureError: Error = new Error('NetworkError: Connection to Supabase failed');
  public callHistory: Array<{ action: string; table: string; payload?: any }> = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.tables.clear();
    this.shouldFailNext = false;
    this.callHistory = [];
  }

  private _getTable(name: string): Map<string, any> {
    if (!this.tables.has(name)) {
      this.tables.set(name, new Map());
    }
    return this.tables.get(name)!;
  }

  public from(tableName: string) {
    const table = this._getTable(tableName);

    const queryBuilder: any = {
      _filters: [] as Array<(row: any) => boolean>,

      select: (_fields: string = '*') => {
        return queryBuilder;
      },

      eq: (col: string, val: any) => {
        queryBuilder._filters.push((row: any) => row[col] === val);
        return queryBuilder;
      },

      gt: (col: string, val: any) => {
        queryBuilder._filters.push((row: any) => {
          if (!row[col]) return false;
          const rowTs = typeof row[col] === 'number' ? row[col] : Date.parse(row[col]);
          const valTs = typeof val === 'number' ? val : Date.parse(val);
          return rowTs > valTs;
        });
        return queryBuilder;
      },

      gte: (col: string, val: any) => {
        queryBuilder._filters.push((row: any) => {
          if (!row[col]) return false;
          const rowTs = typeof row[col] === 'number' ? row[col] : Date.parse(row[col]);
          const valTs = typeof val === 'number' ? val : Date.parse(val);
          return rowTs >= valTs;
        });
        return queryBuilder;
      },

      order: (_col: string, _opts: any = {}) => {
        return queryBuilder;
      },

      upsert: async (records: any, _options: any = { onConflict: 'id' }) => {
        this.callHistory.push({ action: 'upsert', table: tableName, payload: records });
        if (this.shouldFailNext) {
          throw this.failureError;
        }

        const list = Array.isArray(records) ? records : [records];
        for (const rec of list) {
          if (!rec || !rec.id) continue;
          table.set(rec.id, JSON.parse(JSON.stringify(rec)));
        }
        return { data: list, error: null };
      },

      delete: () => {
        return {
          eq: async (col: string, val: any) => {
            this.callHistory.push({ action: 'delete', table: tableName, payload: { [col]: val } });
            if (this.shouldFailNext) {
              throw this.failureError;
            }
            if (col === 'id') {
              table.delete(val);
            } else {
              for (const [id, row] of table.entries()) {
                if (row[col] === val) {
                  table.delete(id);
                }
              }
            }
            return { data: null, error: null };
          },
        };
      },

      then: (resolve: (val: any) => void, reject: (err: any) => void) => {
        this.callHistory.push({ action: 'select', table: tableName });
        if (this.shouldFailNext) {
          return reject(this.failureError);
        }

        let rows = Array.from(table.values()).map((r) => JSON.parse(JSON.stringify(r)));
        for (const filter of queryBuilder._filters) {
          rows = rows.filter(filter);
        }
        resolve({ data: rows, error: null });
      },
    };

    return queryBuilder;
  }
}
