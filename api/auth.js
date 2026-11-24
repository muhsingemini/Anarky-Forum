import crypto from "crypto";
import { createClient } from "@libsql/client";

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split(":");
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, "hex");
  if (derivedBuf.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, originalBuf);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const db = getDb();
    const { action, username, email, password } = req.body || {};

    if (action === "register") {
      const cleanUser = String(username || "").trim();
      const cleanEmail = String(email || "").trim().toLowerCase();
      const cleanPass = String(password || "");

      if (!cleanUser || !cleanEmail || cleanPass.length < 4) {
        return res.status(400).json({ error: "Kullanici adi, e-posta ve en az 4 karakter sifre gerekli." });
      }

      const existing = await db.execute({
        sql: "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1",
        args: [cleanUser, cleanEmail],
      });

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "Bu kullanici adi veya e-posta zaten kayitli." });
      }

      const passwordHash = hashPassword(cleanPass);
      const inserted = await db.execute({
        sql: "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'member') RETURNING id, username, email, role, created_at",
        args: [cleanUser, cleanEmail, passwordHash],
      });

      return res.status(201).json({ ok: true, user: inserted.rows[0] });
    }

    if (action === "login") {
      const identifier = String(username || email || "").trim();
      const cleanPass = String(password || "");

      if (!identifier || !cleanPass) {
        return res.status(400).json({ error: "Kullanici adi/e-posta ve sifre gerekli." });
      }

      const found = await db.execute({
        sql: "SELECT id, username, email, password_hash, role, created_at FROM users WHERE username = ? OR lower(email) = lower(?) LIMIT 1",
        args: [identifier, identifier],
      });

      if (found.rows.length === 0) {
        return res.status(401).json({ error: "Kullanici bulunamadi." });
      }

      const row = found.rows[0];
      if (!verifyPassword(cleanPass, row.password_hash)) {
        return res.status(401).json({ error: "Sifre hatali." });
      }

      return res.status(200).json({
        ok: true,
        user: {
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          created_at: row.created_at,
        },
      });
    }

    return res.status(400).json({ error: "Gecersiz islem." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}