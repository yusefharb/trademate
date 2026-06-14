import { runMigrations, closeDb } from './connection';

console.log('Running database migrations...');
try {
  runMigrations();
  console.log('✓ Migrations complete');
} catch (error) {
  console.error('✗ Migration failed:', error);
  process.exit(1);
} finally {
  closeDb();
}