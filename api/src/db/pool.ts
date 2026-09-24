import pg from 'pg';

// int8 arrives as a string by default because a bigint can exceed
// Number.MAX_SAFE_INTEGER. At this scale it cannot, and ids coming back as
// numbers keeps every comparison in the codebase honest.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

// The scalar parser above does NOT cover bigint[] - arrays carry their own type
// OID. Without this, array_agg(some_bigint) returns ["1"] and an includes(1)
// check silently fails, which surfaces as a puzzling 404 rather than an error.
// pg's parameter type only names scalar OIDs, so the array OID is cast to
// whatever setTypeParser actually accepts rather than to a hand-named type.
type TypeOid = Parameters<typeof pg.types.setTypeParser>[0];
const INT8_ARRAY_OID = 1016 as TypeOid;
pg.types.setTypeParser(INT8_ARRAY_OID, (v: string) =>
  v === '{}' ? [] : v.slice(1, -1).split(',').map((x) => (x === 'NULL' ? null : Number(x))));

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
