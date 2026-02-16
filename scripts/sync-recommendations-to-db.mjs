import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in your environment.");
}

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function ensureSchema() {
  const schemaPath = path.resolve(process.cwd(), "db/schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");
  await pool.query(sql);
}

async function syncRecommendations() {
  const dataPath = path.resolve(process.cwd(), "data/buildRecommendations.json");
  const raw = await fs.readFile(dataPath, "utf8");
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const query = `
      INSERT INTO recommendation_agg (
        patch, champion, feature_bucket, comp_key, role, rank_tier,
        title, items, runes, reasoning, why, confidence, sample_size, updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12,$13,NOW()
      )
      ON CONFLICT (patch, champion, feature_bucket, comp_key, role, rank_tier, title)
      DO UPDATE SET
        items = EXCLUDED.items,
        runes = EXCLUDED.runes,
        reasoning = EXCLUDED.reasoning,
        why = EXCLUDED.why,
        confidence = EXCLUDED.confidence,
        sample_size = EXCLUDED.sample_size,
        updated_at = NOW();
    `;

    let count = 0;
    for (const row of rows) {
      await client.query(query, [
        row.patch,
        row.champion,
        row.featureBucket,
        row.compKey || "",
        row.role || "UNKNOWN",
        row.rankTier || "ANY",
        row.title,
        JSON.stringify(row.items || []),
        JSON.stringify(row.runes || []),
        row.reasoning || "",
        JSON.stringify(row.why || []),
        Number(row.confidence || 0),
        Number(row.sampleSize || 0)
      ]);
      count += 1;
    }

    await client.query("COMMIT");
    console.log(`Synced rows: ${count}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  await ensureSchema();
  await syncRecommendations();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
