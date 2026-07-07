// src/lib/data.js — 서버 API 라우트를 호출하는 클라이언트 데이터 레이어.
// (기존 Firebase 버전과 동일한 함수 시그니처를 유지한다)

export const MAX_PHOTOS_PER_TRIP = 3;
export const MAX_CAPTION = 120;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

async function api(path, options) {
  const res = await fetch(path, options);
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const msg = body?.error || `요청에 실패했어요. (HTTP ${res.status})`;
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
  return api("/api/users", { method: "POST", ...json({ nickname }) });
}

export async function getUser(userId) {
  return api(`/api/users/${userId}`);
}

export async function updateUser(userId, fields) {
  await api(`/api/users/${userId}`, { method: "PATCH", ...json(fields) });
}

export async function findUserByCode(code) {
  return api(`/api/users?code=${encodeURIComponent(code.toUpperCase().trim())}`);
}

/* ===== couples (연결 1회·해제 불가) ===== */

export async function connectCouple(myUserId, partnerCode) {
  const r = await api("/api/couples", { method: "POST", ...json({ myUserId, partnerCode }) });
  return r.coupleId;
}

export async function getCouple(coupleId) {
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
  return poll(() => api(`/api/couples/${coupleId}/trips`), cb);
}

export async function getTripByRegion(coupleId, regionId, mapNo = 1) {
  return api(`/api/couples/${coupleId}/trips?regionId=${encodeURIComponent(regionId)}&map=${mapNo}`);
}

// 새 지도 추가 (마지막 지도가 17곳 모두 채워졌을 때만 성공)
export async function createMap(coupleId) {
  const r = await api(`/api/couples/${coupleId}/maps`, { method: "POST" });
  return r.mapCount;
}

// 지역 안 사진 폴링 구독
export function listenPhotos(coupleId, tripId, cb) {
  return poll(() => api(`/api/couples/${coupleId}/trips/${tripId}/photos`), cb);
}

// 클라이언트 썸네일 생성 (긴 변 800px, JPEG 0.85)
async function makeThumbnail(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const MAX = 800;
    const r = img.width > img.height ? MAX / img.width : MAX / img.height;
    const w = Math.min(img.width, img.width * r);
    const h = Math.min(img.height, img.height * r);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 사진 1장 + (trip이 없으면) 새 trip을 함께 만든다.
 * - 지역당 trip 1개, 사진 ≤ 3장, 첫 사진(order:0)이 자동 대표
 */
export async function addPhotoToRegion({
  coupleId, userId, regionId, regionName, file, caption, visitedAt, mapNo = 1,
}) {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("사진은 10MB 이하만 업로드할 수 있어요.");
  if (caption && caption.length > MAX_CAPTION) throw new Error(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);

  const thumbBlob = await makeThumbnail(file);

  const fd = new FormData();
  fd.append("userId", userId);
  fd.append("regionId", regionId);
  fd.append("regionName", regionName);
  fd.append("mapNo", String(mapNo));
  if (caption !== undefined) fd.append("caption", caption);
  if (visitedAt !== undefined) fd.append("visitedAt", visitedAt);
  fd.append("photo", file, file.name || "photo.jpg");
  fd.append("thumb", thumbBlob, "thumb.jpg");

  await api(`/api/couples/${coupleId}/photos`, { method: "POST", body: fd });
}

export async function updateTripMeta(coupleId, tripId, userId, { caption, visitedAt }) {
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
  await api(`/api/couples/${coupleId}/trips/${tripId}/photos/${photoId}`, { method: "DELETE" });
}

// 대표 사진 지정 (지역당 하나 — 서버에서 이전 대표는 자동 해제)
export async function setCoverPhoto(coupleId, tripId, photoId) {
  await api(`/api/couples/${coupleId}/trips/${tripId}/photos/${photoId}`, { method: "PATCH" });
}
