import { createClient } from "@libsql/client";

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db = getDb();

    if (req.method === "GET") {
      const threadId = req.query?.thread_id;
      const result = threadId
        ? await db.execute({
            sql: `
              SELECT r.id, r.thread_id, r.author_id, r.content, r.created_at,
                     u.username AS author_username, u.email AS author_email
              FROM replies r
              JOIN users u ON u.id = r.author_id
              WHERE r.thread_id = ?
              ORDER BY r.id ASC
            `,
            args: [Number(threadId)],
          })
        : await db.execute(`
            SELECT r.id, r.thread_id, r.author_id, r.content, r.created_at,
                   u.username AS author_username, u.email AS author_email
            FROM replies r
            JOIN users u ON u.id = r.author_id
            ORDER BY r.id ASC
          `);

      return res.status(200).json({ ok: true, replies: result.rows });
    }

    if (req.method === "POST") {
      const { thread_id, author_id, content } = req.body || {};
      if (!thread_id || !author_id || !String(content || "").trim()) {
        return res.status(400).json({ error: "Konu, yazar ve yanit icerigi zorunludur." });
      }

      const inserted = await db.execute({
        sql: `
          INSERT INTO replies (thread_id, author_id, content)
          VALUES (?, ?, ?)
          RETURNING id, thread_id, author_id, content, created_at
        `,
        args: [Number(thread_id), Number(author_id), String(content).trim()],
      });

      return res.status(201).json({ ok: true, reply: inserted.rows[0] });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}