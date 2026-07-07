// src/lib/server/db.js — 서버 전용. Neon Postgres (Vercel 서버리스 배포용).
// 사진 파일은 Vercel Blob에, 데이터는 Neon에 저장된다.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import crypto from "node:crypto";

// Node 22 미만 런타임에는 전역 WebSocket이 없어 Neon 드라이버가 즉시 실패한다 — ws로 대체
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

let pool;
function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL이 설정되지 않았어요. Vercel 대시보드 → Storage에서 Neon DB를 연결하세요. (로컬은 `vercel env pull .env.local`)"
    );
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // 유휴 연결이 끊길 때 프로세스가 죽지 않도록 로그만 남긴다
    pool.on("error", (e) => console.error("[db] pool error:", e));
  }
  return pool;
}

// 콜드 스타트마다 한 번만 스키마를 보장한다.
// 실패한 promise를 캐시하면 이후 모든 요청이 같은 에러로 죽으므로, 실패 시 재시도 가능하게 초기화한다.
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = runSchema().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

function runSchema() {
  return getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      code       TEXT UNIQUE NOT NULL,
      nickname   TEXT NOT NULL DEFAULT '여행자',
      couple_id  TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS couples (
      id           TEXT PRIMARY KEY,
      member_a     TEXT NOT NULL,
      member_b     TEXT,
      connected_at TEXT NOT NULL,
      map_count    INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS trips (
      id              TEXT PRIMARY KEY,
      couple_id       TEXT NOT NULL,
      map_no          INTEGER NOT NULL DEFAULT 1,
      region_id       TEXT NOT NULL,
      region_name     TEXT NOT NULL,
      caption         TEXT NOT NULL DEFAULT '',
      visited_at      TEXT,
      cover_thumb_url TEXT NOT NULL DEFAULT '',
      cover_photo_id  TEXT,
      photo_count     INTEGER NOT NULL DEFAULT 0,
      created_by      TEXT,
      updated_by      TEXT,
      updated_at      TEXT,
      UNIQUE(couple_id, map_no, region_id)
    );
    CREATE TABLE IF NOT EXISTS photos (
      id          TEXT PRIMARY KEY,
      trip_id     TEXT NOT NULL,
      photo_url   TEXT NOT NULL,
      thumb_url   TEXT NOT NULL,
      photo_path  TEXT NOT NULL,
      thumb_path  TEXT NOT NULL,
      ord         INTEGER NOT NULL,
      uploaded_by TEXT,
      created_at  TEXT NOT NULL
    );
    -- 이미 만들어진 테이블에도 새 컬럼 반영 (멱등)
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS cover_photo_id TEXT;
  `);
}

/* ===== 쿼리 헬퍼 ===== */

export async function rows(text, params = []) {
  await ensureSchema();
  return (await getPool().query(text, params)).rows;
}

export async function row(text, params = []) {
  return (await rows(text, params))[0] ?? null;
}

// 반환값의 rowCount로 영향받은 행 수를 확인할 수 있다
export async function run(text, params = []) {
  await ensureSchema();
  return getPool().query(text, params);
}

// 인터랙티브 트랜잭션: fn(client) 안에서 client.query(...)를 사용한다
export async function tx(fn) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export const newId = () => crypto.randomUUID().replace(/-/g, "");
export const now = () => new Date().toISOString();

// 서버 로컬 기준 오늘 날짜 (YYYY-MM-DD) — 방문일 미래 날짜 검증용
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ===== row(snake_case) → 클라이언트 객체(camelCase) 변환 ===== */

export function toUser(r) {
  return r ? { id: r.id, code: r.code, nickname: r.nickname, coupleId: r.couple_id, createdAt: r.created_at } : null;
}

export function toCouple(r) {
  return r ? {
    id: r.id, memberA: r.member_a, memberB: r.member_b,
    connectedAt: r.connected_at, mapCount: r.map_count ?? 1,
  } : null;
}

export function toTrip(r) {
  return r ? {
    id: r.id, mapNo: r.map_no ?? 1, regionId: r.region_id, regionName: r.region_name,
    caption: r.caption, visitedAt: r.visited_at,
    coverThumbUrl: r.cover_thumb_url, coverPhotoId: r.cover_photo_id, photoCount: r.photo_count,
    createdBy: r.created_by, updatedBy: r.updated_by, updatedAt: r.updated_at,
  } : null;
}

export function toPhoto(r) {
  return r ? {
    id: r.id, photoUrl: r.photo_url, thumbUrl: r.thumb_url,
    photoPath: r.photo_path, thumbPath: r.thumb_path,
    order: r.ord, uploadedBy: r.uploaded_by, createdAt: r.created_at,
  } : null;
}

/* ===== HTTP 응답 헬퍼 ===== */

export const ok = (data, status = 200) => Response.json(data, { status });
export const fail = (message, status = 400) => Response.json({ error: message }, { status });
