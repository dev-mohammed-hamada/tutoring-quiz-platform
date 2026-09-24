import pg from 'pg';

// int8 (bigserial ids and ::int aggregates) arrives as a string by default because
// a bigint can exceed Number.MAX_SAFE_INTEGER. At this scale it cannot, and having
// ids come back as numbers keeps every comparison in the codebase honest.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
