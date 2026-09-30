// Creates the Postgres tables, loads seed data and sets up MongoDB indexes.
// Usage: npm run db:setup   (reads DATABASE_URL and MONGODB_URL from .env.local)
import { readFile } from "node:fs/promises";
import pg from "pg";
import { MongoClient } from "mongodb";

const dbUrl = process.env.DATABASE_URL;
const mongoUrl = process.env.MONGODB_URL;
if (!dbUrl || !mongoUrl) {
  console.error("Set DATABASE_URL and MONGODB_URL (see .env.example).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
for (const file of ["db/schema.sql", "db/seed.sql"]) {
  await client.query(await readFile(file, "utf8"));
  console.log(`Postgres: applied ${file}`);
}
await client.end();

const mongo = new MongoClient(mongoUrl);
await mongo.connect();
const db = mongo.db();
// Raw API responses expire on their own; this collection is also the cache.
try {
  await db.collection("source_snapshots").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
} catch (e) {
  // Some Mongo-compatible servers (e.g. FerretDB) don't support TTL indexes. The cache
  // still works because reads filter on expiresAt; old snapshots just aren't auto-deleted.
  console.warn(`MongoDB: TTL index not supported here (${e.message}). Continuing without auto-expiry.`);
}
await db.collection("source_snapshots").createIndex({ key: 1 });
await db.collection("evidence").createIndex({ assessmentId: 1 }, { unique: true });
await db.collection("evidence").createIndex({ tripId: 1, createdAt: -1 });
console.log("MongoDB: indexes ready");
await mongo.close();
console.log("Done.");
