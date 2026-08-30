import Database from 'better-sqlite3-multiple-ciphers';
import type { Env } from '../config/env.js';

export type DbClient = InstanceType<typeof Database>;

let instance: DbClient | undefined;

function openDatabase(env: Pick<Env, 'databasePath' | 'databaseEncryptionKey'>): DbClient {
  const db = new Database(env.databasePath);
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${env.databaseEncryptionKey}'`);
  db.pragma('foreign_keys = ON');
  return db;
}

export function getDb(env: Pick<Env, 'databasePath' | 'databaseEncryptionKey'>): DbClient {
  if (!instance) {
    instance = openDatabase(env);
  }
  return instance;
}
