// src/lib/data.js
import { db, storage } from "./firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, runTransaction, onSnapshot, orderBy,
} from "firebase/firestore";
import {
  ref as sref, uploadBytes, getDownloadURL, deleteObject,
} from "firebase/storage";
import { generateCode } from "./utils";

export const MAX_PHOTOS_PER_TRIP = 3;
export const MAX_CAPTION = 120;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

/* ===== users ===== */

export async function createUser(nickname = "여행자") {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const dup = await getDocs(query(collection(db, "users"), where("code", "==", code)));
    if (!dup.empty) continue;
    const ref = doc(collection(db, "users"));
    await setDoc(ref, {
      code, nickname, coupleId: null, createdAt: serverTimestamp(),
    });
    return { id: ref.id, code };
  }
  throw new Error("코드 생성에 실패했어요. 다시 시도해 주세요.");
}

export async function getUser(userId) {
  const snap = await getDoc(doc(db, "users", userId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateUser(userId, fields) {
  await updateDoc(doc(db, "users", userId), fields);
}

export async function findUserByCode(code) {
  const snap = await getDocs(
    query(collection(db, "users"), where("code", "==", code.toUpperCase().trim()))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/* ===== couples (연결 1회·해제 불가) ===== */

export async function connectCouple(myUserId, partnerCode) {
  const partner = await findUserByCode(partnerCode);
  if (!partner) throw new Error("그 코드를 가진 사용자를 찾을 수 없어요.");
  if (partner.id === myUserId) throw new Error("본인 코드로는 연결할 수 없어요.");

  const coupleRef = doc(collection(db, "couples"));
  await runTransaction(db, async (tx) => {
    const meRef = doc(db, "users", myUserId);
    const partRef = doc(db, "users", partner.id);
    const meSnap = await tx.get(meRef);
    const partSnap = await tx.get(partRef);
    if (!meSnap.exists() || !partSnap.exists()) throw new Error("사용자 정보를 찾을 수 없어요.");
    if (meSnap.data().coupleId) throw new Error("이미 연결된 상태예요. 연결은 해제할 수 없어요.");
    if (partSnap.data().coupleId) throw new Error("상대가 이미 다른 사람과 연결되어 있어요.");

    tx.set(coupleRef, {
      memberA: myUserId,
      memberB: partner.id,
      connectedAt: serverTimestamp(),
      locked: true,
    });
    tx.update(meRef, { coupleId: coupleRef.id });
    tx.update(partRef, { coupleId: coupleRef.id });
  });
  return coupleRef.id;
}

export async function getCouple(coupleId) {
  const snap = await getDoc(doc(db, "couples", coupleId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getCoupleMembers(couple) {
  const [a, b] = await Promise.all([getUser(couple.memberA), getUser(couple.memberB)]);
  return { [a.id]: a, [b.id]: b };
}

/* ===== trips & photos ===== */

// 모든 trip 실시간 구독 (지도 표시용)
export function listenTrips(coupleId, cb) {
  return onSnapshot(collection(db, "couples", coupleId, "trips"), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getTripByRegion(coupleId, regionId) {
  const snap = await getDocs(
    query(collection(db, "couples", coupleId, "trips"), where("regionId", "==", regionId))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// 지역 안 사진 실시간 구독
export function listenPhotos(coupleId, tripId, cb) {
  const q = query(
    collection(db, "couples", coupleId, "trips", tripId, "photos"),
    orderBy("order", "asc")
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
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
 * - 지역당 trip 1개
 * - 사진 ≤ 3장
 * - 첫 사진(order:0)이 자동 대표
 */
export async function addPhotoToRegion({
  coupleId, userId, regionId, regionName, file, caption, visitedAt,
}) {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("사진은 10MB 이하만 업로드할 수 있어요.");
  if (caption && caption.length > MAX_CAPTION) throw new Error(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);

  // 기존 trip 확인
  let trip = await getTripByRegion(coupleId, regionId);
  const tripsCol = collection(db, "couples", coupleId, "trips");

  if (!trip) {
    // 새 trip 문서 (사진 0장, 캡션·날짜 포함)
    const ref = doc(tripsCol);
    await setDoc(ref, {
      regionId,
      regionName,
      caption: caption || "",
      visitedAt: visitedAt ? new Date(visitedAt) : serverTimestamp(),
      coverThumbUrl: "",
      photoCount: 0,
      createdBy: userId,
      updatedBy: userId,
      updatedAt: serverTimestamp(),
    });
    trip = { id: ref.id, regionId, regionName, photoCount: 0 };
  }
  if (trip.photoCount >= MAX_PHOTOS_PER_TRIP) {
    throw new Error(`한 지역에 사진은 최대 ${MAX_PHOTOS_PER_TRIP}장까지 올릴 수 있어요.`);
  }

  // 1) 썸네일 생성
  const thumbBlob = await makeThumbnail(file);

  // 2) 업로드 (원본 + 썸네일)
  const photoRef = doc(collection(db, "couples", coupleId, "trips", trip.id, "photos"));
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const photoPath = `photos/${coupleId}/${trip.id}/${photoRef.id}.${extension}`;
  const thumbPath = `thumbs/${coupleId}/${trip.id}/${photoRef.id}.jpg`;
  await uploadBytes(sref(storage, photoPath), file);
  await uploadBytes(sref(storage, thumbPath), thumbBlob);
  const [photoUrl, thumbUrl] = await Promise.all([
    getDownloadURL(sref(storage, photoPath)),
    getDownloadURL(sref(storage, thumbPath)),
  ]);

  // 3) Firestore 트랜잭션: photo 추가 + trip 갱신
  try {
    await runTransaction(db, async (tx) => {
      const tRef = doc(db, "couples", coupleId, "trips", trip.id);
      const tSnap = await tx.get(tRef);
      if (!tSnap.exists()) throw new Error("여행 정보를 찾을 수 없어요.");
      const count = tSnap.data().photoCount || 0;
      if (count >= MAX_PHOTOS_PER_TRIP) throw new Error("이미 사진이 가득 찼어요.");

      tx.set(photoRef, {
        photoUrl, thumbUrl,
        photoPath, thumbPath,
        order: count, // 0, 1, 2 순서대로
        uploadedBy: userId,
        createdAt: serverTimestamp(),
      });
      const update = {
        photoCount: count + 1,
        updatedBy: userId,
        updatedAt: serverTimestamp(),
      };
      if (count === 0) update.coverThumbUrl = thumbUrl; // 첫 사진이 대표
      tx.update(tRef, update);
    });
  } catch (e) {
    // 트랜잭션 실패 시 이미 업로드된 Storage 파일 정리
    try { await deleteObject(sref(storage, photoPath)); } catch {}
    try { await deleteObject(sref(storage, thumbPath)); } catch {}
    throw e;
  }
}

export async function updateTripMeta(coupleId, tripId, userId, { caption, visitedAt }) {
  if (caption && caption.length > MAX_CAPTION) throw new Error(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);
  const fields = { updatedBy: userId, updatedAt: serverTimestamp() };
  if (caption !== undefined) fields.caption = caption;
  if (visitedAt !== undefined) fields.visitedAt = visitedAt ? new Date(visitedAt) : null;
  await updateDoc(doc(db, "couples", coupleId, "trips", tripId), fields);
}

/**
 * 사진 1장 삭제:
 * - 남은 사진들의 order 재배치
 * - 대표 사진이 삭제되면 다음 사진이 자동 승계
 * - 마지막 사진이 삭제되면 trip 문서도 자동 삭제
 */
export async function deletePhoto(coupleId, tripId, photoId) {
  const tRef = doc(db, "couples", coupleId, "trips", tripId);
  const photosCol = collection(db, "couples", coupleId, "trips", tripId, "photos");

  // 현재 사진 목록 (order 순)
  const snap = await getDocs(query(photosCol, orderBy("order", "asc")));
  const photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const target = photos.find((p) => p.id === photoId);
  if (!target) return;

  // Storage 파일 먼저 삭제 (실패해도 다음 단계 진행)
  try { await deleteObject(sref(storage, target.photoPath)); } catch (e) { console.warn("Storage 원본 삭제 실패", e); }
  try { await deleteObject(sref(storage, target.thumbPath)); } catch (e) { console.warn("Storage 썸네일 삭제 실패", e); }

  // Firestore: 트랜잭션으로 photo 제거 + 나머지 order 재정렬 + trip 갱신
  await runTransaction(db, async (tx) => {
    const tSnap = await tx.get(tRef);
    if (!tSnap.exists()) return;

    tx.delete(doc(photosCol, photoId));
    const remaining = photos.filter((p) => p.id !== photoId);
    // order 재배치 (0,1,2)
    remaining.forEach((p, i) => {
      if (p.order !== i) tx.update(doc(photosCol, p.id), { order: i });
    });

    if (remaining.length === 0) {
      // 마지막 사진이면 trip 문서도 삭제
      tx.delete(tRef);
    } else {
      tx.update(tRef, {
        photoCount: remaining.length,
        coverThumbUrl: remaining[0].thumbUrl, // 새 대표
        updatedAt: serverTimestamp(),
      });
    }
  });
}
