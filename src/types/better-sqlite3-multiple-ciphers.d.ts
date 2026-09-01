declare module 'better-sqlite3-multiple-ciphers' {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export default class Database {
    constructor(filename: string, options?: Record<string, unknown>);
    pragma(source: string, options?: Record<string, unknown>): unknown;
    exec(source: string): this;
    prepare(source: string): Statement;
    transaction<F extends (...args: never[]) => unknown>(fn: F): F;
    close(): this;
  }
}
