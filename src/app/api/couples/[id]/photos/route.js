// POST /api/couples/[id]/photos → 업로드된 사진 등록 (+trip이 없으면 새로 생성)
// 사진 파일은 브라우저가 Vercel Blob에 직접 올린다(/api/blob/upload에서 토큰 발급).
// 서버리스 함수의 요청 본문 제한(4.5MB) 때문에 파일은 이 라우트를 거치지 않고,
// 여기서는 blob URL·경로와 메타데이터만 JSON으로 받아 DB에 기록한다.
// body: { userId, regionId, regionName, mapNo?, caption?, visitedAt?,
//         photoUrl, photoPath, thumbUrl, thumbPath }
import { del } from "@/lib/server/blob";
import { row, tx, newId, now, localToday, ok, fail } from "@/lib/server/db";

const MAX_PHOTOS_PER_TRIP = 3;
const MAX_CAPTION = 120;

// 등록이 거절·실패하면 이미 올라간 blob을 지워 고아 파일을 남기지 않는다
async function cleanupBlobs(urls) {
  if (!urls.length) return;
  try { await del(urls); } catch (e) { console.warn("[api/photos] blob 정리 실패:", e); }
}

export async function POST(request, { params }) {
  let blobUrls = [];
  try {
    const { id: coupleId } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      userId, regionId, regionName, caption, visitedAt,
      photoUrl, photoPath, thumbUrl, thumbPath,
    } = body;
    const mapNo = parseInt(body.mapNo || "1", 10) || 1;

    if (!userId || !regionId || !regionName) return fail("필수 값이 빠졌어요.");
    if (
      [photoUrl, photoPath, thumbUrl, thumbPath].some((v) => typeof v !== "string" || !v) ||
      !photoUrl.startsWith("https://") || !thumbUrl.startsWith("https://")
    ) {
      return fail("사진 정보가 올바르지 않아요.");
    }
    // 이 커플 소유 경로의 blob만 등록·정리 대상으로 삼는다
    if (!photoPath.startsWith(`photos/${coupleId}/`) || !thumbPath.startsWith(`thumbs/${coupleId}/`)) {
      return fail("사진 경로가 올바르지 않아요.");
    }
    blobUrls = [photoUrl, thumbUrl];

    if (caption && caption.length > MAX_CAPTION) {
      await cleanupBlobs(blobUrls);
      return fail(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);
    }
    if (visitedAt && String(visitedAt).slice(0, 10) > localToday()) {
      await cleanupBlobs(blobUrls);
      return fail("미래 날짜는 선택할 수 없어요.");
    }

    const couple = await row("SELECT map_count FROM couples WHERE id = $1", [coupleId]);
    if (!couple) {
      await cleanupBlobs(blobUrls);
      return fail("커플 정보를 찾을 수 없어요.", 404);
    }
    if (mapNo < 1 || mapNo > (couple.map_count || 1)) {
      await cleanupBlobs(blobUrls);
      return fail("존재하지 않는 지도예요.");
    }

    const trip = await row(
      "SELECT * FROM trips WHERE couple_id = $1 AND map_no = $2 AND region_id = $3",
      [coupleId, mapNo, regionId]
    );
    if (trip && trip.photo_count >= MAX_PHOTOS_PER_TRIP) {
      await cleanupBlobs(blobUrls);
      return fail(`한 지역에 사진은 최대 ${MAX_PHOTOS_PER_TRIP}장까지 올릴 수 있어요.`);
    }

    const tripId = trip ? trip.id : newId();
    const photoId = newId();

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
        photoId, tripId, photoUrl, thumbUrl,
        photoPath, thumbPath, count, userId, now(),
      ]);

      if (count === 0) {
        await c.query(
          "UPDATE trips SET photo_count = $1, cover_thumb_url = $2, cover_photo_id = $3, updated_by = $4, updated_at = $5 WHERE id = $6",
          [count + 1, thumbUrl, photoId, userId, now(), tripId]
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
    await cleanupBlobs(blobUrls);
    console.error("[api/couples/[id]/photos POST]", e);
    return fail(e.message || "사진 등록 중 오류가 발생했어요.", 500);
  }
}
