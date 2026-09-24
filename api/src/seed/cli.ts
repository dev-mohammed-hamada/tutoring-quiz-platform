import { migrate } from '../db/migrate.js';
import { seed } from './index.js';
import { pool } from '../db/pool.js';

await migrate();
await seed();
console.log('seed complete');
await pool.end();
