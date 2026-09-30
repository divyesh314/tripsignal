import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as unknown as { mongoClient?: Promise<MongoClient> };

export async function mongo(): Promise<Db> {
  if (!globalForMongo.mongoClient) {
    const url = process.env.MONGODB_URL;
    if (!url) throw new Error("MONGODB_URL is not set");
    globalForMongo.mongoClient = new MongoClient(url, { serverSelectionTimeoutMS: 3000 }).connect();
  }
  const client = await globalForMongo.mongoClient;
  return client.db();
}

export type SourceSnapshot = {
  key: string;            // e.g. "nws:alerts:39.8561,-104.6737"
  source: string;
  fetchedAt: Date;
  expiresAt: Date;        // TTL index deletes the document after this
  payload: unknown;
};

/**
 * Cache-through fetch for external sources. Raw responses are stored in
 * MongoDB with a TTL so free APIs are not called on every check.
 * If Mongo is unreachable the fetch still runs (cache is best-effort).
 */
export async function cached<T>(key: string, source: string, ttlSeconds: number, load: () => Promise<T>): Promise<{ value: T; fromCache: boolean; fetchedAt: Date }> {
  // Mock payloads depend on the trip being checked, so they are never cached.
  if (process.env.SOURCE_MODE === "mock") return { value: await load(), fromCache: false, fetchedAt: new Date() };
  let db: Db | null = null;
  try {
    db = await mongo();
    const hit = await db.collection<SourceSnapshot>("source_snapshots").findOne(
      { key, expiresAt: { $gt: new Date() } },
      { sort: { fetchedAt: -1 } },
    );
    if (hit) return { value: hit.payload as T, fromCache: true, fetchedAt: hit.fetchedAt };
  } catch (e) {
    console.warn(`[cache] Mongo unavailable, fetching ${key} directly:`, (e as Error).message);
    db = null;
  }
  const value = await load();
  const fetchedAt = new Date();
  if (db) {
    try {
      await db.collection<SourceSnapshot>("source_snapshots").insertOne({
        key, source, fetchedAt, expiresAt: new Date(fetchedAt.getTime() + ttlSeconds * 1000), payload: value,
      });
    } catch (e) {
      console.warn(`[cache] could not store ${key}:`, (e as Error).message);
    }
  }
  return { value, fromCache: false, fetchedAt };
}
