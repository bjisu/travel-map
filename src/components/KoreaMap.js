// src/components/KoreaMap.js
// 17개 시·도 지도. trips 데이터를 받아 사진으로 채워진 지역을 그린다.
"use client";
import { REGIONS, VIEWBOX } from "@/lib/regions";

/**
 * @param {Object[]} trips - [{ regionId, coverThumbUrl }, ...]
 * @param {(regionId: string) => void} onRegionClick
 */
export default function KoreaMap({ trips = [], onRegionClick }) {
  // regionId 로 trip 빠르게 찾기
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

      {/* 2단계: 사진이 있는 지역만 사진으로 채움 */}
      {REGIONS.map((r) => {
        const trip = tripByRegion[r.id];
        if (!trip?.coverThumbUrl) return null;
        return (
          <image
            key={`img-${r.id}`}
            href={trip.coverThumbUrl}
            x="0"
            y="0"
            width="800"
            height="1000"
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
        return (
          <text
            key={`label-${r.id}`}
            x={r.cx}
            y={r.cy}
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={hasPhoto ? "#ffffff" : "#2d3142"}
            stroke={hasPhoto ? "rgba(0,0,0,0.5)" : "none"}
            strokeWidth={hasPhoto ? "0.5" : "0"}
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
