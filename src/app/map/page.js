// src/app/map/page.js
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getUserId, saveUserId, isCreatePending, clearCreatePending, getCreateError,
} from "@/lib/session";
import { getUser, getCouple, listenTrips, createUser, createMap } from "@/lib/data";
import { REGIONS } from "@/lib/regions";
import { withTimeout } from "@/lib/utils";
import MapCarousel from "@/components/MapCarousel";
import TripModal from "@/components/TripModal";

const TOTAL_REGIONS = 17;

// 지도 화면 카드 공통 규격: 내부 패딩과 세로 간격 통일.
// 가로 폭·좌우 여백은 전 화면 공통 컨테이너(.screen)가 결정한다 (카드는 항상 100% 폭)
const CARD_GEO = { margin: "0 0 12px", padding: "12px 14px" };

export default function MapPage() {
  const router = useRouter();
  const [phase, setPhase] = useState("loading"); // loading | creating | failed | ready
  const [failMsg, setFailMsg] = useState("");
  const [me, setMe] = useState(null);
  const [couple, setCouple] = useState(null);
  const [partner, setPartner] = useState(null);
  const [trips, setTrips] = useState([]);
  const [openRegion, setOpenRegion] = useState(null);
  const [toast, setToast] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [tip, setTip] = useState(false);
  const [tipHide, setTipHide] = useState(false);
  const [mapIndex, setMapIndex] = useState(0);
  const [creatingMap, setCreatingMap] = useState(false);

  useEffect(() => {
    let stopped = false;
    let unsubTrips;
    let timer;

    async function load(id) {
      try {
        const u = await getUser(id);
        if (stopped) return;
        if (!u) { router.replace("/"); return; }
        const c = u.coupleId ? await getCouple(u.coupleId) : null;
        if (stopped) return;
        setMe(u);
        setCouple(c);
        setPhase("ready");
        if (c) unsubTrips = listenTrips(c.id, setTrips);
      } catch (e) {
        console.error("[Map] 지도 불러오기 실패:", e);
        if (!stopped) {
          setPhase("failed");
          setFailMsg("지도를 불러오지 못했어요. 네트워크 상태를 확인해 주세요.");
        }
      }
    }

    // 백그라운드 코드 발급이 끝나기를 기다린다 (최대 20초)
    function waitForCreation(tries = 0) {
      if (stopped) return;
      const id = getUserId();
      if (id) { clearCreatePending(); load(id); return; }
      const bgErr = getCreateError();
      if (bgErr) { setPhase("failed"); setFailMsg(bgErr); return; }
      if (tries >= 40) {
        setPhase("failed");
        setFailMsg("준비에 시간이 걸리고 있어요. 다시 시도해주세요.");
        return;
      }
      timer = setTimeout(() => waitForCreation(tries + 1), 500);
    }

    const id = getUserId();
    if (id) {
      load(id);
    } else if (isCreatePending() || getCreateError()) {
      timer = setTimeout(() => { setPhase("creating"); waitForCreation(); }, 0);
    } else {
      router.replace("/");
    }

    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubTrips && unsubTrips();
    };
  }, [router, reloadKey]);

  // 연결된 상대의 닉네임 로드 (타이틀 표시용)
  const partnerId =
    couple?.memberB && me ? (couple.memberA === me.id ? couple.memberB : couple.memberA) : null;
  useEffect(() => {
    if (!partnerId) return;
    let stop = false;
    getUser(partnerId)
      .then((u) => { if (!stop && u) setPartner(u); })
      .catch((e) => console.error("[Map] 상대 정보 조회 실패:", e));
    return () => { stop = true; };
  }, [partnerId]);

  // 혼자인 동안 커플 상태를 폴링 — 상대가 연결하면 새로고침 없이 즉시 반영
  useEffect(() => {
    if (phase !== "ready" || !couple || couple.memberB) return;
    const iv = setInterval(async () => {
      try {
        const c = await getCouple(couple.id);
        if (c && c.memberB) setCouple(c);
      } catch (e) {
        console.error("[Map] 커플 상태 확인 실패:", e);
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [phase, couple]);

  // 첫 진입 시에만 사용법 안내를 3초간 정중앙 토스트로 노출
  useEffect(() => {
    if (phase !== "ready") return;
    if (localStorage.getItem("travel_map_tip_seen")) return;
    localStorage.setItem("travel_map_tip_seen", "1");
    const t1 = setTimeout(() => setTip(true), 400);
    const t2 = setTimeout(() => setTipHide(true), 3400);   // 3초 노출 후 페이드 아웃
    const t3 = setTimeout(() => setTip(false), 3900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [phase]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function handleRetryCreate() {
    setPhase("creating"); setFailMsg("");
    try {
      const { id } = await withTimeout(createUser());
      saveUserId(id);
      clearCreatePending();
      setReloadKey((k) => k + 1); // 다시 불러오기
    } catch (e) {
      console.error("[Map] 코드 발급 재시도 실패:", e);
      setPhase("failed");
      setFailMsg("코드 발급에 실패했어요. 다시 시도해주세요.");
    }
  }

  function handleRegionClick(regionId) {
    if (phase !== "ready" || !couple) {
      showToast(phase === "creating" ? "지도를 준비하고 있어요. 잠시만요!" : "준비가 끝난 뒤 이용할 수 있어요.");
      return;
    }
    const region = REGIONS.find((r) => r.id === regionId);
    if (region) setOpenRegion(region);
  }

  async function handleCreateMap() {
    setCreatingMap(true);
    try {
      const count = await withTimeout(createMap(couple.id));
      setCouple({ ...couple, mapCount: count });
      setMapIndex(count - 1);
      showToast("새 지도가 펼쳐졌어요! 🗺️");
    } catch (e) {
      console.error("[Map] 새 지도 생성 실패:", e);
      showToast(e?.message || "새 지도를 만들지 못했어요. 다시 시도해주세요.");
    } finally {
      setCreatingMap(false);
    }
  }

  if (phase === "loading") return <main className="screen" />;

  const solo = couple && !couple.memberB;
  const mapCount = couple?.mapCount || 1;
  const activeMap = Math.min(mapIndex, mapCount - 1);
  const tripsByMap = Array.from({ length: mapCount }, (_, i) =>
    trips.filter((t) => (t.mapNo || 1) === i + 1)
  );
  const filled = (tripsByMap[activeMap] || []).filter((t) => t.coverThumbUrl).length;
  const percent = Math.round((filled / TOTAL_REGIONS) * 100);
  const lastMapFull =
    (tripsByMap[mapCount - 1] || []).filter((t) => t.coverThumbUrl).length >= TOTAL_REGIONS;
  const showNewMapCta = phase === "ready" && lastMapFull && activeMap === mapCount - 1;

  return (
    <main className="screen" style={{ paddingBottom: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="muted" style={{ fontSize: 11, letterSpacing: 2 }}>OUR TRAVEL</p>
          {couple?.memberB ? (
            <h1 style={{ fontSize: 20, marginTop: 2, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {me?.nickname || "나"}
              </span>
              <svg
                width="15" height="15" viewBox="0 0 24 24"
                fill="var(--accent-deep)" aria-label="하트"
                style={{ flexShrink: 0, marginTop: 1 }}
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {partner?.nickname || "상대방"}
              </span>
            </h1>
          ) : (
            <h1 style={{ fontSize: 20, marginTop: 2 }}>우리 여행 지도</h1>
          )}
        </div>
        {phase === "ready" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => router.push("/mypage")}
              aria-label="설정"
              style={{
                background: "transparent", border: 0, padding: 6,
                color: "var(--ink-soft)", display: "flex", alignItems: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
              </svg>
            </button>
          </div>
        )}
      </header>

      {phase === "creating" && (
        <div className="card" style={{ ...CARD_GEO, textAlign: "center" }}>
          <p style={{ fontSize: 13 }}>여행 지도를 준비하고 있어요…</p>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>연결 코드를 만드는 중이에요.</p>
        </div>
      )}

      {phase === "failed" && (
        <div className="card" style={{ ...CARD_GEO, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#a13e3a" }}>{failMsg}</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={handleRetryCreate}>
            다시 시도
          </button>
        </div>
      )}

      {phase === "ready" && solo && (
        <div className="card" style={{ ...CARD_GEO, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <p className="muted" style={{ fontSize: 11.5 }}>내 연결 코드</p>
            <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: 3, color: "var(--accent-deep)" }}>
              {me.code}
            </p>
          </div>
          <button
            className="btn"
            style={{ width: "auto", padding: "8px 14px", fontSize: 12.5 }}
            onClick={() => router.push("/connect")}
          >커플 연결</button>
        </div>
      )}

      <div className="card" style={CARD_GEO}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            함께한 여행{mapCount > 1 && ` · ${activeMap + 1}번째 지도`}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{filled} <span className="muted" style={{ fontSize: 12 }}>/ {TOTAL_REGIONS}곳</span></span>
        </div>
        <div style={{ height: 6, background: "var(--map-empty)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            width: `${percent}%`,
            height: "100%",
            background: "var(--accent-deep)",
            transition: "width .5s ease",
          }} />
        </div>
      </div>

      {/* 지도 카드: 위 카드들과 동일한 폭·여백·패딩 */}
      <div className="card" style={{ ...CARD_GEO, marginBottom: 0 }}>
        <MapCarousel
          maps={tripsByMap}
          index={activeMap}
          onIndexChange={setMapIndex}
          onRegionClick={handleRegionClick}
        />
        <p style={{
          fontSize: 9.5, textAlign: "right", margin: "6px 0 0",
          color: "var(--ink-soft)", opacity: 0.65, letterSpacing: 0.2,
        }}>
          지도 출처 · KOSTAT(통계청)
        </p>
      </div>

      {/* 지도 위치 인디케이터 */}
      {mapCount > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 12 }}>
          {tripsByMap.map((_, i) => (
            <button
              key={i}
              onClick={() => setMapIndex(i)}
              aria-label={`${i + 1}번째 지도`}
              style={{
                width: i === activeMap ? 20 : 7,
                height: 7,
                borderRadius: 99,
                border: 0,
                padding: 0,
                background: i === activeMap ? "var(--accent-deep)" : "var(--map-stroke)",
                transition: "width .25s ease, background .25s ease",
              }}
            />
          ))}
        </div>
      )}

      {/* 지도를 다 채우면 새 지도 만들기 */}
      {showNewMapCta && (
        <div className="card" style={{ margin: "12px 0 0", padding: "16px 14px", textAlign: "center" }}>
          <p style={{ fontSize: 14.5, fontWeight: 700 }}>🎉 지도를 모두 채웠어요!</p>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            새 지도를 펼치고 두 번째 여행을 시작해 보세요.
          </p>
          <button className="btn" style={{ marginTop: 12 }} onClick={handleCreateMap} disabled={creatingMap}>
            {creatingMap ? "만드는 중…" : "새 지도 만들기"}
          </button>
        </div>
      )}

      {openRegion && couple && me && (
        <TripModal
          coupleId={couple.id}
          userId={me.id}
          region={openRegion}
          mapNo={activeMap + 1}
          onClose={() => setOpenRegion(null)}
          onToast={showToast}
        />
      )}

      {tip && (
        <div className={`tip-toast${tipHide ? " hide" : ""}`}>
          지역을 탭해 사진을 추가하거나 둘러보세요
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
