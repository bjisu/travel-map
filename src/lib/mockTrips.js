// src/lib/mockTrips.js — 디자인 확인용 개발 전용 목업 데이터.
//
// 활성 조건: `npm run dev`(NODE_ENV=development) + .env.local에 NEXT_PUBLIC_MOCK_TRIPS=1
// 프로덕션 빌드는 NODE_ENV=production이라 환경 변수가 있어도 절대 켜지지 않고,
// Vercel 배포는 .env.local 자체를 읽지 않으므로 이중으로 안전하다.
// 켜기: .env.local에 `NEXT_PUBLIC_MOCK_TRIPS=1` 추가 후 dev 서버 재시작
// 끄기: 그 줄을 지우거나 0으로 바꾼 뒤 dev 서버 재시작
import { REGIONS } from "@/lib/regions";

export const MOCK_ENABLED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_MOCK_TRIPS === "1";

export const MOCK_USER_ID = "mock-user";

export const MOCK_USERS = {
  "mock-user": { id: "mock-user", nickname: "디자인", code: "MOCK01", coupleId: "mock-couple" },
  "mock-partner": { id: "mock-partner", nickname: "확인용", code: "MOCK02", coupleId: "mock-couple" },
};

export const MOCK_COUPLE = {
  id: "mock-couple",
  memberA: "mock-user",
  memberB: "mock-partner",
  mapCount: 1,
};

// 저작권 걱정 없는 picsum.photos 플레이스홀더.
// id를 고정해 항상 같은 사진이 나오게 했고, 지역 면적을 색으로 확실히 채우는
// 풍경 사진만 골랐다 (단색 벽·흰 하늘 위주 사진은 지도가 비어 보인다)
const pic = (id, w, h) => `https://picsum.photos/id/${id}/${w}/${h}`;

// 지역마다 장수를 다르게 — 서울 3장, 강원 2장, 부산 1장(어두운 사진: 라벨 가독성
// 확인용), 제주 1장(밝은 사진)
const SPEC = [
  { regionId: "KR-11", photoIds: [164, 76, 152], caption: "남산 데이트, 케이블카 타고 🌸", visitedAt: "2026-04-12" },
  { regionId: "KR-32", photoIds: [28, 33], caption: "속초 바다 앞에서", visitedAt: "2026-05-03" },
  { regionId: "KR-21", photoIds: [47], caption: "광안리 야경", visitedAt: "2026-06-20" },
  { regionId: "KR-39", photoIds: [110], caption: "", visitedAt: "2026-07-01" },
];

const photosByTrip = {};
export const MOCK_TRIPS = SPEC.map(({ regionId, photoIds, caption, visitedAt }) => {
  const region = REGIONS.find((r) => r.id === regionId);
  const tripId = `mock-trip-${regionId}`;
  const photos = photoIds.map((picId, i) => ({
    id: `mock-photo-${regionId}-${i}`,
    photoUrl: pic(picId, 1200, 900),
    thumbUrl: pic(picId, 400, 300),
    ord: i,
  }));
  photosByTrip[tripId] = photos;
  return {
    id: tripId,
    regionId,
    regionName: region?.fullName || regionId,
    mapNo: 1,
    caption,
    visitedAt: `${visitedAt}T00:00:00+09:00`,
    photoCount: photos.length,
    coverPhotoId: photos[0].id,
    coverThumbUrl: photos[0].thumbUrl,
  };
});

export function mockTripByRegion(regionId, mapNo = 1) {
  return MOCK_TRIPS.find((t) => t.regionId === regionId && t.mapNo === mapNo) || null;
}

export function mockPhotos(tripId) {
  return photosByTrip[tripId] || [];
}

export function mockWriteError() {
  return new Error("목업 모드예요. .env.local의 NEXT_PUBLIC_MOCK_TRIPS를 끄면 실제로 저장할 수 있어요.");
}
