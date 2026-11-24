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
      const result = await db.execute(`
        SELECT
          t.id,
          t.author_id,
          t.title,
          t.content,
          t.category,
          t.poll_question,
          t.poll_options,
          t.created_at,
          u.username AS author_username,
          u.email AS author_email
        FROM threads t
        JOIN users u ON u.id = t.author_id
        ORDER BY t.id DESC
      `);
      return res.status(200).json({ ok: true, threads: result.rows });
    }

    if (req.method === "POST") {
      const { author_id, title, content, category, poll_question, poll_options } = req.body || {};
      if (!author_id || !String(title || "").trim() || !String(content || "").trim()) {
        return res.status(400).json({ error: "Yazar, baslik ve icerik zorunludur." });
      }

      const inserted = await db.execute({
        sql: `
          INSERT INTO threads (author_id, title, content, category, poll_question, poll_options)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING id, author_id, title, content, category, poll_question, poll_options, created_at
        `,
        args: [
          Number(author_id),
          String(title).trim(),
          String(content).trim(),
          String(category || "general").trim(),
          poll_question ? String(poll_question).trim() : null,
          poll_options ? JSON.stringify(poll_options) : null,
        ],
      });

      return res.status(201).json({ ok: true, thread: inserted.rows[0] });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}