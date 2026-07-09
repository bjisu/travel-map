// src/lib/data.js — 서버 API 라우트를 호출하는 클라이언트 데이터 레이어.
// (기존 Firebase 버전과 동일한 함수 시그니처를 유지한다)
import { upload } from "@vercel/blob/client";
import {
  MOCK_ENABLED, MOCK_USERS, MOCK_COUPLE, MOCK_TRIPS,
  mockTripByRegion, mockPhotos, mockWriteError,
} from "@/lib/mockTrips";

export const MAX_PHOTOS_PER_TRIP = 3;
export const MAX_CAPTION = 120;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

async function api(path, options) {
  const res = await fetch(path, options);
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const msg = body?.error
      || (res.status === 413
        ? "사진 용량이 너무 커요. 조금 작은 사진으로 다시 시도해 주세요."
        : `요청에 실패했어요. (HTTP ${res.status})`);
    throw new Error(msg);
  }
  return body;
}

const json = (data) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

/* ===== users ===== */

export async function createUser(nickname = "여행자") {
  if (MOCK_ENABLED) throw mockWriteError();
  return api("/api/users", { method: "POST", ...json({ nickname }) });
}

export async function getUser(userId) {
  if (MOCK_ENABLED) return MOCK_USERS[userId] || null;
  return api(`/api/users/${userId}`);
}

export async function updateUser(userId, fields) {
  if (MOCK_ENABLED) throw mockWriteError();
  await api(`/api/users/${userId}`, { method: "PATCH", ...json(fields) });
}

export async function findUserByCode(code) {
  if (MOCK_ENABLED) return null;
  return api(`/api/users?code=${encodeURIComponent(code.toUpperCase().trim())}`);
}

/* ===== couples (연결 1회·해제 불가) ===== */

export async function connectCouple(myUserId, partnerCode) {
  if (MOCK_ENABLED) throw mockWriteError();
  const r = await api("/api/couples", { method: "POST", ...json({ myUserId, partnerCode }) });
  return r.coupleId;
}

export async function getCouple(coupleId) {
  if (MOCK_ENABLED) return MOCK_COUPLE;
  return api(`/api/couples/${coupleId}`);
}

/* ===== trips & photos ===== */

// SQLite에는 실시간 구독이 없으므로 주기적 폴링으로 대체 (해제 함수 반환은 동일)
const POLL_MS = 4000;

function poll(load, cb) {
  let stopped = false;
  const tick = async () => {
    try {
      const data = await load();
      if (!stopped) cb(data);
    } catch (e) {
      console.error("[data] 폴링 실패:", e);
    }
  };
  tick();
  const iv = setInterval(tick, POLL_MS);
  return () => { stopped = true; clearInterval(iv); };
}

// 모든 trip 폴링 구독 (지도 표시용)
export function listenTrips(coupleId, cb) {
  if (MOCK_ENABLED) { cb(MOCK_TRIPS); return () => {}; }
  return poll(() => api(`/api/couples/${coupleId}/trips`), cb);
}

export async function getTripByRegion(coupleId, regionId, mapNo = 1) {
  if (MOCK_ENABLED) return mockTripByRegion(regionId, mapNo);
  return api(`/api/couples/${coupleId}/trips?regionId=${encodeURIComponent(regionId)}&map=${mapNo}`);
}

// 새 지도 추가 (마지막 지도가 17곳 모두 채워졌을 때만 성공)
export async function createMap(coupleId) {
  if (MOCK_ENABLED) throw mockWriteError();
  const r = await api(`/api/couples/${coupleId}/maps`, { method: "POST" });
  return r.mapCount;
}

// 지역 안 사진 폴링 구독
export function listenPhotos(coupleId, tripId, cb) {
  if (MOCK_ENABLED) { cb(mockPhotos(tripId)); return () => {}; }
  return poll(() => api(`/api/couples/${coupleId}/trips/${tripId}/photos`), cb);
}

/* ===== 클라이언트 이미지 축소·압축 =====
 * 원본(수 MB~10MB)을 그대로 올리면 업로드가 오래 걸리므로 브라우저에서 먼저 줄인다.
 * - 업로드본: 긴 변 2000px · JPEG 0.9 — 모달 큰 화면 기준 육안 차이가 없는 수준.
 *   (예전에 화질 뭉개짐 이슈가 있어 그 이하로는 압축하지 않는다)
 * - 썸네일: 긴 변 800px · JPEG 0.85 (지도·목록용, 기존과 동일)
 * - 재인코딩 결과가 원본보다 크면 원본을 그대로 쓴다 (이미 잘 압축된 작은 파일)
 */
const PHOTO_MAX_EDGE = 2000;
const PHOTO_QUALITY = 0.9;
const THUMB_MAX_EDGE = 800;
const THUMB_QUALITY = 0.85;
// 이 크기 이하이고 축소도 필요 없으면 재인코딩 자체를 건너뛴다
const RECOMPRESS_OVER_BYTES = 1.5 * 1024 * 1024;

// EXIF 회전을 반영해 디코딩 (createImageBitmap 미지원 브라우저는 <img>로 폴백)
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
    try { return await createImageBitmap(file); } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("이미지를 해석할 수 없어요."));
      i.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(img, w, h, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // JPEG에는 투명도가 없어 투명 영역(PNG 스크린샷 등)이 검게 변하는 것 방지
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

// 한 번만 디코딩해 업로드본과 썸네일을 함께 만든다
async function compressForUpload(file) {
  const img = await decodeImage(file);
  try {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error("이미지 크기를 읽을 수 없어요.");

    const ps = Math.min(1, PHOTO_MAX_EDGE / Math.max(w0, h0));
    let photo = file;
    if (ps < 1 || file.size > RECOMPRESS_OVER_BYTES) {
      const blob = await drawScaled(
        img, Math.max(1, Math.round(w0 * ps)), Math.max(1, Math.round(h0 * ps)), PHOTO_QUALITY
      );
      if (blob && blob.size < file.size) photo = blob;
    }

    const ts = Math.min(1, THUMB_MAX_EDGE / Math.max(w0, h0));
    const thumb = await drawScaled(
      img, Math.max(1, Math.round(w0 * ts)), Math.max(1, Math.round(h0 * ts)), THUMB_QUALITY
    );
    if (!thumb) throw new Error("썸네일 생성에 실패했어요.");
    return { photo, thumb };
  } finally {
    img.close?.();
  }
}

// 브라우저에서 안전한 고유 id (Blob 경로용)
function genId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function uploadBlob(pathname, body, contentType, onProgress) {
  return upload(pathname, body, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    contentType,
    onUploadProgress: onProgress,
  });
}

/**
 * 사진 여러 장 + (trip이 없으면) 새 trip을 함께 만든다.
 * - 지역당 trip 1개, 사진 ≤ 3장, 첫 등록 사진(order:0)이 자동 대표
 * - 단계: ① 압축(0~20%) → ② 전 장 병렬 Blob 직접 업로드(20~90%, 바이트 기준)
 *   → ③ DB 등록(90~100%). 등록만 직렬로 돌려 서버의 trip 생성 경쟁과
 *   대표 사진·캡션 순서가 어긋나는 것을 막는다.
 * - onProgress(0~100 정수)로 진행률을 알려준다.
 * @returns {{ added: number, failedIndices: number[] }} 실패한 장의 원본 인덱스
 */
export async function addPhotosToRegion({
  coupleId, userId, regionId, regionName, files, caption, visitedAt, mapNo = 1, onProgress,
}) {
  if (MOCK_ENABLED) throw mockWriteError();
  const report = (p) => { try { onProgress?.(Math.min(100, Math.round(p))); } catch {} };

  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) throw new Error("사진은 10MB 이하만 업로드할 수 있어요.");
  }
  if (caption && caption.length > MAX_CAPTION) throw new Error(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);

  // ① 압축 — 실패하면 아무것도 올라가기 전이라 전체를 안전하게 중단할 수 있다
  report(0);
  const prepared = [];
  for (let i = 0; i < files.length; i++) {
    try {
      prepared.push(await compressForUpload(files[i]));
    } catch (e) {
      console.error("[data] 이미지 압축 실패:", e);
      throw new Error("사진을 처리할 수 없어요. 다른 사진으로 시도해 주세요.");
    }
    report(((i + 1) / files.length) * 20);
  }

  // ② 전 장 병렬 업로드 (장당 원본+썸네일도 병렬) — 진행률은 전체 바이트 합산 기준
  const grandTotal = prepared.reduce((a, p) => a + p.photo.size + p.thumb.size, 0) || 1;
  const loaded = prepared.map(() => ({ photo: 0, thumb: 0 }));
  const tick = () => {
    const sum = loaded.reduce((a, l) => a + l.photo + l.thumb, 0);
    report(20 + (sum / grandTotal) * 70);
  };
  const settled = await Promise.allSettled(prepared.map(async (p, i) => {
    const photoId = genId();
    const ext = (p.photo.type?.split("/")[1] || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const [photoRes, thumbRes] = await Promise.all([
      uploadBlob(`photos/${coupleId}/${photoId}.${ext}`, p.photo, p.photo.type || "image/jpeg",
        (e) => { loaded[i].photo = e.loaded; tick(); }),
      uploadBlob(`thumbs/${coupleId}/${photoId}.jpg`, p.thumb, "image/jpeg",
        (e) => { loaded[i].thumb = e.loaded; tick(); }),
    ]);
    return { photoRes, thumbRes };
  }));

  // ③ 업로드에 성공한 장만 순서대로 등록 — 캡션·날짜는 첫 등록 장에만 싣는다
  //    (서버는 trip을 새로 만들 때만 캡션·날짜를 사용한다)
  let added = 0;
  const failedIndices = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status !== "fulfilled") {
      console.error("[data] Blob 직접 업로드 실패:", s.reason);
      failedIndices.push(i);
      continue;
    }
    try {
      await api(`/api/couples/${coupleId}/photos`, {
        method: "POST",
        ...json({
          userId, regionId, regionName, mapNo,
          caption: added === 0 ? caption : undefined,
          visitedAt: added === 0 ? visitedAt : undefined,
          photoUrl: s.value.photoRes.url, photoPath: s.value.photoRes.pathname,
          thumbUrl: s.value.thumbRes.url, thumbPath: s.value.thumbRes.pathname,
        }),
      });
      added++;
    } catch (e) {
      console.error("[data] 사진 등록 실패:", e);
      failedIndices.push(i);
    }
    report(90 + ((i + 1) / settled.length) * 10);
  }
  report(100);
  return { added, failedIndices };
}

export async function updateTripMeta(coupleId, tripId, userId, { caption, visitedAt }) {
  if (MOCK_ENABLED) throw mockWriteError();
  if (caption && caption.length > MAX_CAPTION) throw new Error(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);
  await api(`/api/couples/${coupleId}/trips/${tripId}`, {
    method: "PATCH", ...json({ userId, caption, visitedAt }),
  });
}

/**
 * 사진 1장 삭제:
 * - 남은 사진 order 재배치, 대표 자동 승계, 마지막 사진이면 trip도 삭제
 */
export async function deletePhoto(coupleId, tripId, photoId) {
  if (MOCK_ENABLED) throw mockWriteError();
  await api(`/api/couples/${coupleId}/trips/${tripId}/photos/${photoId}`, { method: "DELETE" });
}

// 대표 사진 지정 (지역당 하나 — 서버에서 이전 대표는 자동 해제)
export async function setCoverPhoto(coupleId, tripId, photoId) {
  if (MOCK_ENABLED) throw mockWriteError();
  await api(`/api/couples/${coupleId}/trips/${tripId}/photos/${photoId}`, { method: "PATCH" });
}
