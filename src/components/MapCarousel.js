// src/components/MapCarousel.js
// 여러 장의 지도를 좌우 스와이프로 넘겨보는 캐러셀.
// - 두 손가락 핀치: 현재 지도 확대(1~4배), 손가락 중점 고정
// - 확대 상태 한 손가락 드래그: 지도 이동
// - 기본 배율 한 손가락 가로 드래그: 지도 넘기기 (끝 지도에서는 고무줄 저항)
// - 지도를 넘기면 확대 상태는 초기화된다
"use client";
import { useRef, useState } from "react";
import KoreaMap from "./KoreaMap";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_SLOP = 6;        // 이 거리(px) 이상 움직이면 탭이 아니라 드래그
const SWIPE_RATIO = 0.22;  // 화면 폭의 22% 이상 밀면 다음/이전 지도로
const RESET_VIEW = { scale: 1, tx: 0, ty: 0 };

/**
 * @param {Object[][]} maps - 지도별 trips 배열 (maps[0] = 1번 지도의 trips)
 * @param {number} index - 현재 보고 있는 지도 (0-based)
 * @param {(i: number) => void} onIndexChange
 * @param {(regionId: string) => void} onRegionClick
 */
export default function MapCarousel({ maps, index, onIndexChange, onRegionClick }) {
  const boxRef = useRef(null);
  const pointers = useRef(new Map()); // pointerId → {x, y}
  const gesture = useRef(null);       // 제스처 시작 시점 스냅샷
  const moved = useRef(false);
  // 지도별 확대 상태 저장 — 처음 보는 지도는 항상 기본 배율에서 시작
  const [views, setViews] = useState({});
  const viewsRef = useRef({});
  const view = views[index] || RESET_VIEW;
  const [dragX, setDragX] = useState(0);       // 스와이프 중 임시 이동량(px)
  const [dragging, setDragging] = useState(false);

  function currentView() {
    return viewsRef.current[index] || RESET_VIEW;
  }

  function applyView(next) {
    const merged = { ...viewsRef.current, [index]: next };
    viewsRef.current = merged;
    setViews(merged);
  }

  // 지도 밖으로 빈 공간이 드러나지 않도록 이동·배율 범위를 제한
  function clampView(next) {
    const el = boxRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (!el) return RESET_VIEW;
    const minTx = el.clientWidth * (1 - scale);
    const minTy = el.clientHeight * (1 - scale);
    return {
      scale,
      tx: Math.min(0, Math.max(minTx, next.tx)),
      ty: Math.min(0, Math.max(minTy, next.ty)),
    };
  }

  function snapshot() {
    gesture.current = {
      view: { ...currentView() },
      pts: new Map(pointers.current),
      rect: boxRef.current?.getBoundingClientRect(),
    };
  }

  function handlePointerDown(e) {
    if (pointers.current.size === 0) moved.current = false;
    boxRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    snapshot();
    setDragging(true);
  }

  function handlePointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    const ids = [...pointers.current.keys()];
    if (ids.length >= 2) {
      // 핀치: 두 손가락 거리 비율만큼 확대, 손가락 중점이 고정되도록 이동 보정
      const s0 = g.pts.get(ids[0]);
      const s1 = g.pts.get(ids[1]);
      if (!s0 || !s1) { snapshot(); return; }
      const c0 = pointers.current.get(ids[0]);
      const c1 = pointers.current.get(ids[1]);
      const d0 = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1;
      const d1 = Math.hypot(c1.x - c0.x, c1.y - c0.y);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.view.scale * (d1 / d0)));
      const k = scale / g.view.scale;
      const rect = g.rect || boxRef.current.getBoundingClientRect();
      const sm = { x: (s0.x + s1.x) / 2 - rect.left, y: (s0.y + s1.y) / 2 - rect.top };
      const cm = { x: (c0.x + c1.x) / 2 - rect.left, y: (c0.y + c1.y) / 2 - rect.top };
      moved.current = true;
      setDragX(0);
      applyView(clampView({
        scale,
        tx: cm.x - (sm.x - g.view.tx) * k,
        ty: cm.y - (sm.y - g.view.ty) * k,
      }));
    } else if (ids.length === 1) {
      const s = g.pts.get(ids[0]);
      const c = pointers.current.get(ids[0]);
      if (!s) return;
      const dx = c.x - s.x;
      const dy = c.y - s.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) moved.current = true;

      if (g.view.scale > 1) {
        // 확대 상태: 한 손가락 드래그로 지도 안 이동
        applyView(clampView({ scale: g.view.scale, tx: g.view.tx + dx, ty: g.view.ty + dy }));
      } else if (Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy)) {
        // 기본 배율: 가로 드래그로 지도 넘기기 (양 끝에서는 고무줄 저항)
        const atEdge = (index === 0 && dx > 0) || (index === maps.length - 1 && dx < 0);
        setDragX(atEdge ? dx * 0.3 : dx);
      }
    }
  }

  function handlePointerEnd(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) { snapshot(); return; }

    setDragging(false); // 손을 떼면 transition으로 부드럽게 정착
    if (dragX !== 0) {
      const width = boxRef.current?.clientWidth || 1;
      let next = index;
      if (dragX < -width * SWIPE_RATIO && index < maps.length - 1) next = index + 1;
      if (dragX > width * SWIPE_RATIO && index > 0) next = index - 1;
      setDragX(0);
      if (next !== index) onIndexChange(next);
    }
    gesture.current = null;
  }

  function handleTap(regionId) {
    if (moved.current) return; // 드래그·핀치 직후의 클릭은 무시
    onRegionClick?.(regionId);
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        overflow: "hidden",
        borderRadius: 12,
        touchAction: "none", // 브라우저 기본 스크롤·줌 대신 제스처를 직접 처리
      }}
    >
      <div
        style={{
          display: "flex",
          transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
          transition: dragging ? "none" : "transform .35s cubic-bezier(.22,.61,.36,1)",
          willChange: "transform",
        }}
      >
        {maps.map((trips, i) => (
          <div key={i} style={{ flex: "0 0 100%", minWidth: 0 }}>
            <div
              style={i === index ? {
                transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                transformOrigin: "0 0",
                willChange: "transform",
              } : undefined}
            >
              <KoreaMap trips={trips} onRegionClick={handleTap} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
