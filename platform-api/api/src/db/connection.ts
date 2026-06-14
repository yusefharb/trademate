import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SCHEMA_SQL } from './schema';

let db: Database.Database | null = null;

/**
 * Get or initialize the database connection.
 * Creates the database file and tables if they don't exist.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || './data/trademate.db';
  const dbDir = path.dirname(dbPath);

  // Ensure the data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Run database migrations (create tables)
 */
export function runMigrations(): void {
  const database = getDb();
  
  // Execute each statement separately for better error reporting
  const statements = SCHEMA_SQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const transaction = database.transaction(() => {
    for (const stmt of statements) {
      database.exec(stmt + ';');
    }
  });

  transaction();
  console.log('✓ Database migrations completed successfully');
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}