// src/components/KoreaMap.js
// 17개 시·도 지도 한 장. trips 데이터를 받아 사진으로 채워진 지역을 그린다.
// 핀치 줌·스와이프 제스처는 MapCarousel이 담당한다.
"use client";
import { REGIONS } from "@/lib/regions";

// 실제 지형 범위(20~780 × 20~980)에 맞춰 빈 여백을 잘라내 지도를 크게 보이게 한다
const VIEWBOX = "14 14 772 972";

// 라벨 위치 보정: 기본 중심점(cx, cy)이 경계선이나 다른 라벨과 겹치는 지역만,
// 지역 다각형 내부에서 경계선으로부터 가장 먼 지점(pole of inaccessibility)으로 이동
const LABEL_POS = {
  "KR-31": { x: 348, y: 258 },     // 경기: 서울 라벨과 겹침 방지
  "KR-33": { x: 392, y: 331 },     // 충북: 경계선 겹침 (여유 5.4px → 37px)
  "KR-29": { x: 341, y: 392 },     // 세종
  "KR-25": { x: 355, y: 420 },     // 대전
  "KR-24": { x: 291, y: 633 },     // 광주
  "KR-23": { x: 240, y: 175 },     // 인천
  "KR-22": { x: 500, y: 510 },     // 대구
  "KR-21": { x: 563, y: 620 },     // 부산
  "KR-11": { x: 306, y: 209 },     // 서울
};
// 광역시·특별시는 면적이 좁으므로 라벨을 한 단계 작게
const METRO = new Set(["KR-11", "KR-21", "KR-22", "KR-23", "KR-24", "KR-25", "KR-26", "KR-29"]);

// 지역별 바운딩 박스: 사진을 지도 전체가 아니라 해당 지역 영역에만 맞춰 배치한다.
// (전체 캔버스에 늘리면 지역 하나에 쓰이는 실질 해상도가 크게 떨어져 확대 시 화질이 뭉개진다)
const REGION_BBOX = (() => {
  const boxes = {};
  for (const r of REGIONS) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pair of r.d.match(/-?[\d.]+,-?[\d.]+/g) || []) {
      const comma = pair.indexOf(",");
      const x = +pair.slice(0, comma);
      const y = +pair.slice(comma + 1);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    boxes[r.id] = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return boxes;
})();

/**
 * @param {Object[]} trips - [{ regionId, coverThumbUrl }, ...]
 * @param {(regionId: string) => void} onRegionClick
 */
export default function KoreaMap({ trips = [], onRegionClick }) {
  const tripByRegion = Object.fromEntries(trips.map((t) => [t.regionId, t]));

  return (
    <svg
      viewBox={VIEWBOX}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="대한민국 17개 시·도 지도"
    >
      <defs>
        {/* 사진을 지역 모양에 맞춰 마스킹 */}
        {REGIONS.map((r) => (
          <clipPath key={r.id} id={`clip-${r.id}`}>
            <path d={r.d} />
          </clipPath>
        ))}
      </defs>

      {/* 1단계: 모든 지역의 베이지 베이스 */}
      {REGIONS.map((r) => (
        <path
          key={r.id}
          d={r.d}
          fill="var(--map-empty, #f0e6d2)"
          stroke="var(--map-stroke, #d4c4a3)"
          strokeWidth="0.8"
        />
      ))}

      {/* 2단계: 사진이 있는 지역만 사진으로 채움 (지역 바운딩 박스에 맞춰 배치) */}
      {REGIONS.map((r) => {
        const trip = tripByRegion[r.id];
        if (!trip?.coverThumbUrl) return null;
        const b = REGION_BBOX[r.id];
        return (
          <image
            key={`img-${r.id}`}
            href={trip.coverThumbUrl}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            clipPath={`url(#clip-${r.id})`}
            preserveAspectRatio="xMidYMid slice"
          />
        );
      })}

      {/* 3단계: 사진 있는 지역에 하늘색 테두리 강조 */}
      {REGIONS.map((r) => {
        const trip = tripByRegion[r.id];
        if (!trip?.coverThumbUrl) return null;
        return (
          <path
            key={`stroke-${r.id}`}
            d={r.d}
            fill="none"
            stroke="var(--accent-deep, #5ba8c9)"
            strokeWidth="2"
            pointerEvents="none"
          />
        );
      })}

      {/* 4단계: 클릭 영역 (투명, 맨 위) */}
      {REGIONS.map((r) => (
        <path
          key={`hit-${r.id}`}
          d={r.d}
          fill="transparent"
          stroke="transparent"
          style={{ cursor: "pointer" }}
          onClick={() => onRegionClick?.(r.id)}
        >
          <title>{r.fullName}</title>
        </path>
      ))}

      {/* 5단계: 지역명 라벨 */}
      {REGIONS.map((r) => {
        const hasPhoto = !!tripByRegion[r.id]?.coverThumbUrl;
        const pos = LABEL_POS[r.id] || { x: r.cx, y: r.cy };
        return (
          <text
            key={`label-${r.id}`}
            x={pos.x}
            y={pos.y}
            fontSize={METRO.has(r.id) ? 13 : 17}
            fontWeight="600"
            letterSpacing="0.3"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={hasPhoto ? "#ffffff" : "#2d3142"}
            stroke={hasPhoto ? "rgba(0,0,0,0.55)" : "none"}
            strokeWidth={hasPhoto ? "0.7" : "0"}
            paintOrder="stroke"
            pointerEvents="none"
            style={{ userSelect: "none" }}
          >
            {r.name}
          </text>
        );
      })}
    </svg>
  );
}
