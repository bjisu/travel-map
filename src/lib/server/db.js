// src/lib/server/db.js — 서버 전용. Node 내장 SQLite(node:sqlite) 사용.
// 데이터는 프로젝트 루트의 data/ 폴더에 저장된다 (DB 파일 + 업로드 사진).
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

function createDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  d.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
  `);
  migrate(d);
  return d;
}

// 스키마 변경분 반영 (기존 DB 파일에도 적용)
function migrate(d) {
  // 1) couples.member_b가 NOT NULL이던 예전 스키마 → 혼자 시작을 위해 NULL 허용으로 재생성
  const col = d.prepare(
    `SELECT "notnull" AS nn FROM pragma_table_info('couples') WHERE name = 'member_b'`
  ).get();
  if (col && col.nn === 1) {
    d.exec(`
      BEGIN;
      CREATE TABLE couples_new (
        id TEXT PRIMARY KEY, member_a TEXT NOT NULL, member_b TEXT, connected_at TEXT NOT NULL
      );
      INSERT INTO couples_new SELECT id, member_a, member_b, connected_at FROM couples;
      DROP TABLE couples;
      ALTER TABLE couples_new RENAME TO couples;
      COMMIT;
    `);
  }
  // 2) 지도 여러 장 지원: couples.map_count / trips.map_no 컬럼이 없던 예전 DB 보정
  const hasMapCount = d.prepare(
    `SELECT COUNT(*) AS n FROM pragma_table_info('couples') WHERE name = 'map_count'`
  ).get().n > 0;
  if (!hasMapCount) {
    d.exec("ALTER TABLE couples ADD COLUMN map_count INTEGER NOT NULL DEFAULT 1");
  }
  const hasMapNo = d.prepare(
    `SELECT COUNT(*) AS n FROM pragma_table_info('trips') WHERE name = 'map_no'`
  ).get().n > 0;
  if (!hasMapNo) {
    // UNIQUE 제약이 (couple_id, region_id) → (couple_id, map_no, region_id)로 바뀌므로 테이블 재생성
    d.exec(`
      BEGIN;
      CREATE TABLE trips_new (
        id              TEXT PRIMARY KEY,
        couple_id       TEXT NOT NULL,
        map_no          INTEGER NOT NULL DEFAULT 1,
        region_id       TEXT NOT NULL,
        region_name     TEXT NOT NULL,
        caption         TEXT NOT NULL DEFAULT '',
        visited_at      TEXT,
        cover_thumb_url TEXT NOT NULL DEFAULT '',
        photo_count     INTEGER NOT NULL DEFAULT 0,
        created_by      TEXT,
        updated_by      TEXT,
        updated_at      TEXT,
        UNIQUE(couple_id, map_no, region_id)
      );
      INSERT INTO trips_new (id, couple_id, map_no, region_id, region_name, caption, visited_at,
                             cover_thumb_url, photo_count, created_by, updated_by, updated_at)
        SELECT id, couple_id, 1, region_id, region_name, caption, visited_at,
               cover_thumb_url, photo_count, created_by, updated_by, updated_at FROM trips;
      DROP TABLE trips;
      ALTER TABLE trips_new RENAME TO trips;
      COMMIT;
    `);
  }

  // 3) 커플(지도)이 없는 예전 사용자에게 혼자용 지도를 만들어준다
  const orphans = d.prepare("SELECT id FROM users WHERE couple_id IS NULL").all();
  for (const u of orphans) {
    const cid = crypto.randomUUID().replace(/-/g, "");
    d.prepare(
      "INSERT INTO couples (id, member_a, member_b, connected_at) VALUES (?, ?, NULL, ?)"
    ).run(cid, u.id, new Date().toISOString());
    d.prepare("UPDATE users SET couple_id = ? WHERE id = ?").run(cid, u.id);
  }
}

// dev 핫리로드로 모듈이 다시 평가돼도 DB 연결은 하나만 유지
const g = globalThis;
export const db = g.__travelMapDb ?? (g.__travelMapDb = createDb());

export const newId = () => crypto.randomUUID().replace(/-/g, "");
export const now = () => new Date().toISOString();

// 서버 로컬 기준 오늘 날짜 (YYYY-MM-DD) — 방문일 미래 날짜 검증용
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tx(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
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
    coverThumbUrl: r.cover_thumb_url, photoCount: r.photo_count,
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
