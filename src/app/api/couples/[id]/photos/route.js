// POST /api/couples/[id]/photos → 사진 1장 업로드 (+trip이 없으면 새로 생성)
// multipart/form-data: userId, regionId, regionName, mapNo?, caption?, visitedAt?, photo, thumb
// 파일은 Vercel Blob에 저장된다.
import { put, del } from "@/lib/server/blob";
import { row, tx, newId, now, localToday, ok, fail } from "@/lib/server/db";

const MAX_PHOTOS_PER_TRIP = 3;
const MAX_CAPTION = 120;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function POST(request, { params }) {
  const uploaded = []; // 업로드된 blob URL (실패 시 정리용)
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
    if (!photo || typeof photo === "string") return fail("사진 파일이 없어요.");
    if (!thumb || typeof thumb === "string") return fail("썸네일 파일이 없어요.");
    if (photo.size > MAX_PHOTO_BYTES) return fail("사진은 10MB 이하만 업로드할 수 있어요.");
    if (caption && caption.length > MAX_CAPTION) return fail(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);
    if (visitedAt && String(visitedAt).slice(0, 10) > localToday()) {
      return fail("미래 날짜는 선택할 수 없어요.");
    }

    const couple = await row("SELECT map_count FROM couples WHERE id = $1", [coupleId]);
    if (!couple) return fail("커플 정보를 찾을 수 없어요.", 404);
    if (mapNo < 1 || mapNo > (couple.map_count || 1)) return fail("존재하지 않는 지도예요.");

    // 기존 trip 확인 + 미리 개수 검사 (파일 저장 전 빠른 실패)
    const trip = await row(
      "SELECT * FROM trips WHERE couple_id = $1 AND map_no = $2 AND region_id = $3",
      [coupleId, mapNo, regionId]
    );
    if (trip && trip.photo_count >= MAX_PHOTOS_PER_TRIP) {
      return fail(`한 지역에 사진은 최대 ${MAX_PHOTOS_PER_TRIP}장까지 올릴 수 있어요.`);
    }

    const tripId = trip ? trip.id : newId();
    const photoId = newId();
    const ext = (photo.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";

    // Blob 업로드 (원본 + 썸네일)
    const photoBlob = await put(`photos/${coupleId}/${tripId}/${photoId}.${ext}`, photo, {
      access: "public", contentType: photo.type || "image/jpeg",
    });
    uploaded.push(photoBlob.url);
    const thumbBlob = await put(`thumbs/${coupleId}/${tripId}/${photoId}.jpg`, thumb, {
      access: "public", contentType: "image/jpeg",
    });
    uploaded.push(thumbBlob.url);

    // DB 반영 (실패 시 업로드한 blob 정리)
    await tx(async (c) => {
      if (!trip) {
        await c.query(`
          INSERT INTO trips (id, couple_id, map_no, region_id, region_name, caption, visited_at,
                             cover_thumb_url, photo_count, created_by, updated_by, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, '', 0, $8, $8, $9)
        `, [
          tripId, coupleId, mapNo, regionId, regionName, caption || "",
          visitedAt ? new Date(visitedAt).toISOString() : now(),
          userId, now(),
        ]);
      }

      const count = (await c.query(
        "SELECT photo_count FROM trips WHERE id = $1", [tripId]
      )).rows[0].photo_count;
      if (count >= MAX_PHOTOS_PER_TRIP) throw new Error("이미 사진이 가득 찼어요.");

      await c.query(`
        INSERT INTO photos (id, trip_id, photo_url, thumb_url, photo_path, thumb_path, ord, uploaded_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        photoId, tripId, photoBlob.url, thumbBlob.url,
        photoBlob.pathname, thumbBlob.pathname, count, userId, now(),
      ]);

      if (count === 0) {
        await c.query(
          "UPDATE trips SET photo_count = $1, cover_thumb_url = $2, updated_by = $3, updated_at = $4 WHERE id = $5",
          [count + 1, thumbBlob.url, userId, now(), tripId]
        );
      } else {
        await c.query(
          "UPDATE trips SET photo_count = $1, updated_by = $2, updated_at = $3 WHERE id = $4",
          [count + 1, userId, now(), tripId]
        );
      }
    });

    return ok({ tripId, photoId });
  } catch (e) {
    if (uploaded.length > 0) {
      try { await del(uploaded); } catch (cleanupErr) { console.warn("[api/photos] blob 정리 실패:", cleanupErr); }
    }
    console.error("[api/couples/[id]/photos POST]", e);
    return fail(e.message || "사진 업로드 중 오류가 발생했어요.", 500);
  }
}
