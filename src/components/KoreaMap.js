// src/components/KoreaMap.js
// 17개 시·도 지도 한 장. trips 데이터를 받아 사진으로 채워진 지역을 그린다.
// 핀치 줌·스와이프 제스처는 MapCarousel이 담당한다.
"use client";
import { useState } from "react";
import { REGIONS } from "@/lib/regions";
import {
  REGION_ILLUS, MAP_DECOR, ILLUS_VIEW, OUTLINE, OUTLINE_W,
} from "@/lib/regionIllustrations";

// 실제 지형 범위(20~780 × 20~980)에 맞춰 빈 여백을 잘라내 지도를 크게 보이게 한다
const VIEWBOX = "14 14 772 972";

// 라벨 위치 보정: 기본 중심점(cx, cy)이 경계선이나 다른 라벨과 겹치는 지역만,
// 지역 다각형 내부에서 경계선으로부터 가장 먼 지점(pole of inaccessibility)으로 이동
// (좁은 지역은 "랜드마크 일러스트 위 + 라벨 아래" 규칙에 맞춰 라벨을 지역 하단으로 내렸다)
const LABEL_POS = {
  "KR-31": { x: 348, y: 272 },     // 경기: 화성 일러스트 바로 아래 (서울·인천 라벨과 간격 확보)
  "KR-33": { x: 392, y: 331 },     // 충북: 경계선 겹침 (여유 5.4px → 37px)
  "KR-29": { x: 341, y: 392 },     // 세종
  "KR-25": { x: 357, y: 406 },     // 대전: 지역 상단이 좁아 라벨 위 → 일러스트 아래 (예외)
  "KR-24": { x: 291, y: 642 },     // 광주
  "KR-23": { x: 240, y: 175 },     // 인천
  "KR-22": { x: 500, y: 532 },     // 대구
  "KR-21": { x: 554, y: 641 },     // 부산
  "KR-11": { x: 306, y: 217 },     // 서울
  "KR-26": { x: 579, y: 580 },     // 울산: 고래 아래·광안대교 위 사이
  "KR-39": { x: 256, y: 946 },     // 제주: 일러스트는 섬 왼쪽 바다 위, 라벨은 섬 중앙
};
// 광역시·특별시는 면적이 좁으므로 라벨을 한 단계 작게
const METRO = new Set(["KR-11", "KR-21", "KR-22", "KR-23", "KR-24", "KR-25", "KR-26", "KR-29"]);

// 48×48 뷰박스 그림(랜드마크·배경 장식)을 지도 좌표에 배치해 그린다
function Artwork({ art, className }) {
  const k = art.s / ILLUS_VIEW;
  const renderShape = (sh, i) => (
    <path
      key={i}
      d={sh.d}
      transform={sh.t}
      fill={sh.f || "none"}
      stroke={sh.s === "none" ? "none" : sh.s || OUTLINE}
      strokeWidth={sh.w ?? OUTLINE_W}
      strokeDasharray={sh.dash}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  return (
    <g
      className={className}
      opacity={art.opacity}
      pointerEvents="none"
      aria-hidden="true"
    >
      <g transform={`translate(${art.x - art.s / 2} ${art.y - art.s / 2}) scale(${k})`}>
        {art.shapes.map(renderShape)}
        {art.repeat && Array.from({ length: art.repeat.count }, (_, i) => (
          <g key={`rp-${i}`} transform={`rotate(${(360 / art.repeat.count) * i} ${art.repeat.cx} ${art.repeat.cy})`}>
            {renderShape(art.repeat.shape, i)}
          </g>
        ))}
      </g>
    </g>
  );
}

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

  // 지역별 대표 사진 로드 성공 여부 (값 = 로드에 성공한 URL).
  // 로딩 중이거나 실패하면 랜드마크 일러스트를 그대로 유지하고,
  // 로드가 끝난 순간 일러스트가 사진으로 교체된다 (실패 시 영구 폴백)
  const [photoReady, setPhotoReady] = useState({});
  const markReady = (regionId, url) =>
    setPhotoReady((prev) => (prev[regionId] === url ? prev : { ...prev, [regionId]: url }));
  const isReady = (r) => {
    const url = tripByRegion[r.id]?.coverThumbUrl;
    return !!url && photoReady[r.id] === url;
  };

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

      {/* 0단계: 지도 바깥 여백의 여행 포스터 장식 (구름·종이비행기·물결) */}
      {MAP_DECOR.map((art, i) => (
        <Artwork key={`decor-${i}`} art={art} />
      ))}

      {/* 1단계: 모든 지역의 베이지 베이스 */}
      {REGIONS.map((r) => (
        <path
          key={r.id}
          d={r.d}
          fill="var(--map-empty, #e6cfa0)"
          stroke="var(--map-stroke, #c2aa78)"
          strokeWidth="0.8"
        />
      ))}

      {/* 2단계: 사진이 없는(또는 아직 사진이 로드되지 않은) 지역의 랜드마크 일러스트.
          좁은 지역은 경계를 살짝 벗어날 수 있으므로 클리핑하지 않는 대신,
          사진이 화면에 뜨면 아예 그리지 않아 경계 밖 잔상이 남지 않는다 */}
      {REGIONS.map((r) => {
        if (isReady(r)) return null;
        const art = REGION_ILLUS[r.id];
        return art ? <Artwork key={`illus-${r.id}`} art={art} /> : null;
      })}

      {/* 3단계: 사진이 있는 지역만 사진으로 채움.
          지역 바운딩 박스에 cover(slice) 방식으로 꽉 채워 중앙 기준으로 잘리고,
          로드가 끝나기 전(opacity 0)에는 일러스트가 그대로 보인다 */}
      {REGIONS.map((r) => {
        const trip = tripByRegion[r.id];
        if (!trip?.coverThumbUrl) return null;
        const b = REGION_BBOX[r.id];
        const ready = isReady(r);
        return (
          <image
            key={`img-${r.id}`}
            className={ready ? "region-photo" : undefined}
            opacity={ready ? undefined : 0}
            href={trip.coverThumbUrl}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            clipPath={`url(#clip-${r.id})`}
            preserveAspectRatio="xMidYMid slice"
            onLoad={() => markReady(r.id, trip.coverThumbUrl)}
            onError={() => console.warn(`[KoreaMap] 대표 사진 로드 실패 (${r.id}) — 일러스트로 대체:`, trip.coverThumbUrl)}
          />
        );
      })}

      {/* 4단계: 사진이 표시된 지역에 하늘색 테두리 강조 */}
      {REGIONS.map((r) => {
        if (!isReady(r)) return null;
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

      {/* 5단계: 클릭 영역 (투명, 맨 위) */}
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

      {/* 6단계: 지역명 라벨 — 사진 위에서는 반투명 다크 칩 + 흰 글씨로 가독성 확보
          (어두운 사진·밝은 사진 어디서든 읽힌다) */}
      {REGIONS.map((r) => {
        const onPhoto = isReady(r);
        const pos = LABEL_POS[r.id] || { x: r.cx, y: r.cy };
        const fs = METRO.has(r.id) ? 13 : 17;
        const label = (
          <text
            x={pos.x}
            y={pos.y}
            fontSize={fs}
            fontWeight="600"
            // 칩 위에서는 자간의 오른쪽 꼬리 여백 때문에 글자가 왼쪽으로 쏠려 보여 자간을 뺀다
            letterSpacing={onPhoto ? "0" : "0.3"}
            textAnchor="middle"
            // central = 글자 몸통(em box) 기준 세로 중앙 — middle보다 CJK가 칩 정중앙에 온다.
            // 원주리체 메트릭이 살짝 아래로 앉아 있어 소량(-0.04em)만 올려 광학 중앙을 맞춘다
            dominantBaseline={onPhoto ? "central" : "middle"}
            dy={onPhoto ? "-0.04em" : undefined}
            fill={onPhoto ? "#ffffff" : "#2d3142"}
            pointerEvents="none"
            style={{ userSelect: "none" }}
          >
            {r.name}
          </text>
        );
        if (!onPhoto) return <g key={`label-${r.id}`}>{label}</g>;
        // 지역명은 모두 두 글자라 칩 크기를 글자 수 기반으로 계산해도 안전하다.
        // 칩은 텍스트에 딱 맞는 최소 크기 — 좁은 지역에서 사진을 과하게 가리지 않는다
        const w = fs * 2 + 9;
        const h = fs + 5.5;
        return (
          <g key={`label-${r.id}`} pointerEvents="none">
            <rect
              x={pos.x - w / 2}
              y={pos.y - h / 2}
              width={w}
              height={h}
              rx={h / 2}
              fill="rgba(35, 30, 22, 0.58)"
            />
            {label}
          </g>
        );
      })}
    </svg>
  );
}
