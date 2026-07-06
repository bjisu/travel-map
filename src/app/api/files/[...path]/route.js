// GET /api/files/... → data/uploads/ 아래 저장된 사진 파일 서빙
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR, fail } from "@/lib/server/db";

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", heic: "image/heic", avif: "image/avif",
};

export async function GET(request, { params }) {
  const { path: parts } = await params;
  const abs = path.resolve(UPLOADS_DIR, ...parts);
  // 업로드 폴더 밖 접근 차단
  if (!abs.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) return fail("잘못된 경로예요.", 400);

  try {
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    return new Response(buf, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        // 파일 경로에 고유 ID가 포함되므로 영구 캐시 가능
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return fail("파일을 찾을 수 없어요.", 404);
  }
}
