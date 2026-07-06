// POST /api/couples/[id]/photos → 사진 1장 업로드 (+trip이 없으면 새로 생성)
// multipart/form-data: userId, regionId, regionName, caption?, visitedAt?, photo, thumb
import fs from "node:fs";
import path from "node:path";
import { db, tx, newId, now, localToday, UPLOADS_DIR, ok, fail } from "@/lib/server/db";

const MAX_PHOTOS_PER_TRIP = 3;
const MAX_CAPTION = 120;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function POST(request, { params }) {
  const savedFiles = [];
  try {
    const { id: coupleId } = await params;
    const form = await request.formData();
    const userId = form.get("userId");
    const regionId = form.get("regionId");
    const regionName = form.get("regionName");
    const caption = form.get("caption"); // null이면 새 trip 아님(기존 trip에 추가)
    const visitedAt = form.get("visitedAt");
    const mapNo = parseInt(form.get("mapNo") || "1", 10) || 1;
    const photo = form.get("photo");
    const thumb = form.get("thumb");

    if (!userId || !regionId || !regionName) return fail("필수 값이 빠졌어요.");
    const couple = db.prepare("SELECT map_count FROM couples WHERE id = ?").get(coupleId);
    if (!couple) return fail("커플 정보를 찾을 수 없어요.", 404);
    if (mapNo < 1 || mapNo > (couple.map_count || 1)) return fail("존재하지 않는 지도예요.");
    if (!photo || typeof photo === "string") return fail("사진 파일이 없어요.");
    if (!thumb || typeof thumb === "string") return fail("썸네일 파일이 없어요.");
    if (photo.size > MAX_PHOTO_BYTES) return fail("사진은 10MB 이하만 업로드할 수 있어요.");
    if (caption && caption.length > MAX_CAPTION) return fail(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);
    if (visitedAt && String(visitedAt).slice(0, 10) > localToday()) {
      return fail("미래 날짜는 선택할 수 없어요.");
    }

    // 기존 trip 확인 + 미리 개수 검사 (파일 저장 전 빠른 실패)
    let trip = db.prepare(
      "SELECT * FROM trips WHERE couple_id = ? AND map_no = ? AND region_id = ?"
    ).get(coupleId, mapNo, regionId);
    if (trip && trip.photo_count >= MAX_PHOTOS_PER_TRIP) {
      return fail(`한 지역에 사진은 최대 ${MAX_PHOTOS_PER_TRIP}장까지 올릴 수 있어요.`);
    }

    const tripId = trip ? trip.id : newId();
    const photoId = newId();
    const ext = (photo.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const photoRel = path.join("photos", coupleId, tripId, `${photoId}.${ext}`);
    const thumbRel = path.join("thumbs", coupleId, tripId, `${photoId}.jpg`);
    const toUrl = (rel) => "/api/files/" + rel.split(path.sep).join("/");

    // 파일 저장
    for (const [rel, file] of [[photoRel, photo], [thumbRel, thumb]]) {
      const abs = path.join(UPLOADS_DIR, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
      savedFiles.push(abs);
    }

    // DB 반영 (실패 시 저장한 파일 정리)
    tx(() => {
      if (!trip) {
        db.prepare(`
          INSERT INTO trips (id, couple_id, map_no, region_id, region_name, caption, visited_at,
                             cover_thumb_url, photo_count, created_by, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)
        `).run(
          tripId, coupleId, mapNo, regionId, regionName, caption || "",
          visitedAt ? new Date(visitedAt).toISOString() : now(),
          userId, userId, now()
        );
        trip = { id: tripId, photo_count: 0 };
      }

      const count = db.prepare("SELECT photo_count FROM trips WHERE id = ?").get(tripId).photo_count;
      if (count >= MAX_PHOTOS_PER_TRIP) throw new Error("이미 사진이 가득 찼어요.");

      db.prepare(`
        INSERT INTO photos (id, trip_id, photo_url, thumb_url, photo_path, thumb_path, ord, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(photoId, tripId, toUrl(photoRel), toUrl(thumbRel), photoRel, thumbRel, count, userId, now());

      if (count === 0) {
        db.prepare(
          "UPDATE trips SET photo_count = ?, cover_thumb_url = ?, updated_by = ?, updated_at = ? WHERE id = ?"
        ).run(count + 1, toUrl(thumbRel), userId, now(), tripId);
      } else {
        db.prepare(
          "UPDATE trips SET photo_count = ?, updated_by = ?, updated_at = ? WHERE id = ?"
        ).run(count + 1, userId, now(), tripId);
      }
    });

    return ok({ tripId, photoId });
  } catch (e) {
    for (const f of savedFiles) { try { fs.unlinkSync(f); } catch {} }
    console.error("[api/couples/[id]/photos POST]", e);
    return fail(e.message || "사진 업로드 중 오류가 발생했어요.", 500);
  }
}
