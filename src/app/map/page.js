// src/app/map/page.js
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/session";
import { getUser, getCouple, getCoupleMembers, listenTrips } from "@/lib/data";
import { REGIONS } from "@/lib/regions";
import KoreaMap from "@/components/KoreaMap";
import TripModal from "@/components/TripModal";

export default function MapPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [couple, setCouple] = useState(null);
  const [members, setMembers] = useState({});
  const [trips, setTrips] = useState([]);
  const [openRegion, setOpenRegion] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const id = getUserId();
    if (!id) { router.replace("/"); return; }
    let unsubTrips;
    (async () => {
      try {
        const u = await getUser(id);
        if (!u) { router.replace("/"); return; }
        if (!u.coupleId) { router.replace("/connect"); return; }
        const c = await getCouple(u.coupleId);
        const m = await getCoupleMembers(c);
        setMe(u);
        setCouple(c);
        setMembers(m);
        unsubTrips = listenTrips(u.coupleId, setTrips);
      } catch {
        router.replace("/");
      }
    })();
    return () => { unsubTrips && unsubTrips(); };
  }, [router]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  function handleRegionClick(regionId) {
    const region = REGIONS.find((r) => r.id === regionId);
    if (region) setOpenRegion(region);
  }

  if (!me || !couple) return <main className="screen" />;

  const filled = trips.filter((t) => t.coverThumbUrl).length;
  const percent = Math.round((filled / 17) * 100);

  return (
    <main className="screen" style={{ paddingBottom: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <p className="muted" style={{ fontSize: 11, letterSpacing: 2 }}>OUR TRAVEL</p>
          <h1 style={{ fontSize: 20, marginTop: 2 }}>우리 여행 지도</h1>
        </div>
        <button
          onClick={() => router.push("/mypage")}
          style={{
            background: "transparent", border: "1px solid var(--line)",
            borderRadius: 99, padding: "6px 12px", fontSize: 12, color: "var(--ink-soft)",
          }}
        >마이</button>
      </header>

      <div className="card" style={{ marginBottom: 14, padding: "14px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>함께한 여행</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{filled} <span className="muted" style={{ fontSize: 12 }}>/ 17곳</span></span>
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

      <div className="card" style={{ padding: 12 }}>
        <KoreaMap trips={trips} onRegionClick={handleRegionClick} />
      </div>

      <p className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 12 }}>
        지역을 탭해 사진을 추가하거나 둘러보세요
      </p>

      <p className="muted" style={{ fontSize: 10, textAlign: "center", marginTop: 16 }}>
        지도 데이터 출처: KOSTAT (통계청)
      </p>

      {openRegion && (
        <TripModal
          coupleId={couple.id}
          userId={me.id}
          members={members}
          region={openRegion}
          onClose={() => setOpenRegion(null)}
          onToast={showToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
