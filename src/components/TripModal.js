// src/components/TripModal.js
"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  listenPhotos, getTripByRegion, addPhotoToRegion, deletePhoto, updateTripMeta, setCoverPhoto,
  MAX_PHOTOS_PER_TRIP, MAX_CAPTION,
} from "@/lib/data";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function dateInputValue(ts) {
  if (!ts) return todayStr();
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TripModal({
  coupleId, userId, region, mapNo = 1, onClose, onToast,
}) {
  const [trip, setTrip] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("view"); // view | add | editMeta
  const fileRef = useRef(null);

  const [caption, setCaption] = useState("");
  const [visitedAt, setVisitedAt] = useState(todayStr());
  // 선택된 사진들: [{ file, url(미리보기용 objectURL) }]
  const [files, setFiles] = useState([]);
  const filesRef = useRef([]);
  const [uploadedIdx, setUploadedIdx] = useState(0); // 업로드 진행 표시 (n/전체)

  function updateFiles(next) {
    filesRef.current = next;
    setFiles(next);
  }

  // 닫힐 때 미리보기 objectURL 정리
  useEffect(() => {
    return () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url));
  }, []);

  // trip 초기 로드 (region 바뀔 때만 실행)
  useEffect(() => {
    let cancelled = false;
    getTripByRegion(coupleId, region.id, mapNo)
      .then((t) => {
        if (cancelled) return;
        setTrip(t);
        if (!t) {
          setMode("add");
        } else {
          setCaption(t.caption || "");
          setVisitedAt(dateInputValue(t.visitedAt));
        }
      })
      .catch(() => { if (!cancelled) setMode("add"); });
    return () => { cancelled = true; };
  }, [coupleId, region.id, mapNo]);

  // photos 실시간 구독 — trip.id 가 생기거나 바뀔 때 자동 재구독
  // (새 지역에 첫 사진 추가 후 setTrip 되면 여기서 구독이 시작됨)
  const tripId = trip?.id;
  useEffect(() => {
    if (!tripId) return;
    return listenPhotos(coupleId, tripId, setPhotos);
  }, [coupleId, tripId]);

  // slide 보정: useEffect 대신 렌더 시점 파생값으로 계산 (lint error 해소)
  const displaySlide = photos.length > 0 ? Math.min(slide, photos.length - 1) : 0;

  // 파일 탐색기에서 여러 장 선택 — 남은 슬롯만큼만 받는다
  function handlePickFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // 같은 파일을 다시 선택해도 onChange가 발생하도록 초기화
    if (!picked.length) return;

    const oversized = picked.filter((f) => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) onToast("10MB가 넘는 사진은 제외했어요.");
    const valid = picked.filter((f) => f.size <= 10 * 1024 * 1024);

    const remaining = MAX_PHOTOS_PER_TRIP - photos.length - files.length;
    if (remaining <= 0) {
      onToast(`사진은 최대 ${MAX_PHOTOS_PER_TRIP}장까지 올릴 수 있어요.`);
      return;
    }
    if (valid.length > remaining) {
      onToast(
        photos.length + files.length > 0
          ? `${remaining}장까지만 더 선택할 수 있어요.`
          : `사진은 최대 ${MAX_PHOTOS_PER_TRIP}장까지 선택할 수 있어요.`
      );
    }
    const accepted = valid.slice(0, remaining)
      .map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    updateFiles([...files, ...accepted]);
  }

  function handleRemoveFile(i) {
    URL.revokeObjectURL(files[i].url);
    updateFiles(files.filter((_, idx) => idx !== i));
  }

  async function handleAddPhoto() {
    if (files.length === 0) { onToast("사진을 선택해 주세요."); return; }
    if (photos.length + files.length > MAX_PHOTOS_PER_TRIP) {
      onToast(`사진은 최대 ${MAX_PHOTOS_PER_TRIP}장까지 올릴 수 있어요.`);
      return;
    }
    if (caption.length > MAX_CAPTION) {
      onToast(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);
      return;
    }
    if (!trip && visitedAt > todayStr()) {
      onToast("미래 날짜는 선택할 수 없어요.");
      return;
    }
    setBusy(true);
    let done = 0;
    try {
      for (const { file } of files) {
        setUploadedIdx(done + 1);
        await addPhotoToRegion({
          coupleId, userId,
          regionId: region.id,
          regionName: region.fullName,
          file,
          // 캡션·날짜는 새 trip을 만드는 첫 장에만 적용된다
          caption: trip || done > 0 ? undefined : caption,
          visitedAt: trip || done > 0 ? undefined : visitedAt,
          mapNo,
        });
        done++;
      }
      files.forEach((f) => URL.revokeObjectURL(f.url));
      updateFiles([]);
      onToast(done > 1 ? `사진 ${done}장을 추가했어요.` : "사진을 추가했어요.");
      setMode("view");
    } catch (e) {
      // 중간에 실패하면 성공한 장은 선택 목록에서 제거하고, 남은 장은 다시 시도할 수 있게 유지
      console.error("[TripModal] 사진 업로드 실패:", e);
      files.slice(0, done).forEach((f) => URL.revokeObjectURL(f.url));
      updateFiles(files.slice(done));
      onToast(e.message || "사진 업로드에 실패했어요. 다시 시도해주세요.");
    } finally {
      // trip이 새로 생겼을 수 있으니 다시 불러와 사진 구독을 시작한다
      try {
        const reloaded = await getTripByRegion(coupleId, region.id, mapNo);
        setTrip(reloaded);
        if (reloaded) {
          setCaption(reloaded.caption || "");
          setVisitedAt(dateInputValue(reloaded.visitedAt));
        }
      } catch (e) {
        console.error("[TripModal] 여행 정보 갱신 실패:", e);
      }
      setUploadedIdx(0);
      setBusy(false);
    }
  }

  async function handleSaveMeta() {
    if (visitedAt > todayStr()) {
      onToast("미래 날짜는 선택할 수 없어요.");
      return;
    }
    setBusy(true);
    try {
      await updateTripMeta(coupleId, trip.id, userId, { caption, visitedAt });
      setMode("view");
      onToast("저장했어요.");
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSetCover(photoId) {
    setBusy(true);
    try {
      await setCoverPhoto(coupleId, trip.id, photoId);
      const p = photos.find((x) => x.id === photoId);
      // 지도·목록은 폴링으로 곧바로 따라오고, 모달 안은 즉시 반영
      setTrip({ ...trip, coverPhotoId: photoId, coverThumbUrl: p?.thumbUrl || trip.coverThumbUrl });
      onToast("대표 사진을 변경했어요.");
    } catch (e) {
      console.error("[TripModal] 대표 사진 변경 실패:", e);
      onToast(e.message || "대표 사진 변경에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePhoto(photoId) {
    if (!confirm("이 사진을 삭제할까요?")) return;
    setBusy(true);
    try {
      await deletePhoto(coupleId, trip.id, photoId);
      const left = photos.length - 1;
      if (left === 0) {
        onToast("사진을 모두 삭제해 지역이 비워졌어요.");
        onClose();
      } else {
        onToast("사진을 삭제했어요.");
      }
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const current = photos[displaySlide];
  const full = photos.length >= MAX_PHOTOS_PER_TRIP;
  const allSlotsUsed = photos.length + files.length >= MAX_PHOTOS_PER_TRIP;
  // 현재 대표 사진 id (예전 데이터는 썸네일 URL 매칭 → 그래도 없으면 첫 사진)
  const coverId = trip?.coverPhotoId
    || photos.find((p) => p.thumbUrl === trip?.coverThumbUrl)?.id
    || photos[0]?.id;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 20 }}>{region.fullName}</h2>
            {trip && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                사진 {photos.length} / {MAX_PHOTOS_PER_TRIP}장 · {formatDate(trip.visitedAt)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: 0, fontSize: 24,
              color: "var(--ink-soft)", cursor: "pointer", padding: 4,
            }}
            aria-label="닫기"
          >×</button>
        </div>

        {/* === 뷰 모드 === */}
        {mode === "view" && trip && photos.length > 0 && (
          <>
            <div style={{
              position: "relative",
              aspectRatio: "1",
              borderRadius: 16,
              overflow: "hidden",
              background: "#000",
              marginBottom: 12,
            }}>
              <Image
                src={current.photoUrl}
                alt=""
                fill
                style={{ objectFit: "cover" }}
                sizes="(max-width: 480px) 100vw, 480px"
              />
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setSlide((s) => (s - 1 + photos.length) % photos.length)}
                    style={navBtnStyle("left")}
                    aria-label="이전"
                  >‹</button>
                  <button
                    onClick={() => setSlide((s) => (s + 1) % photos.length)}
                    style={navBtnStyle("right")}
                    aria-label="다음"
                  >›</button>
                  <div style={{
                    position: "absolute", bottom: 10, left: "50%",
                    transform: "translateX(-50%)", display: "flex", gap: 6,
                  }}>
                    {photos.map((_, i) => (
                      <span key={i} style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: i === displaySlide ? "#fff" : "rgba(255,255,255,0.5)",
                      }} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ display: "flex", alignItems: "center" }}>
                {current.id === coverId ? (
                  <span style={{
                    padding: "2px 8px", borderRadius: 99,
                    background: "var(--accent-soft)", color: "var(--accent-deep)",
                    fontSize: 11, fontWeight: 700,
                  }}>대표</span>
                ) : photos.length > 1 && (
                  <button
                    onClick={() => handleSetCover(current.id)}
                    disabled={busy}
                    style={{
                      padding: "4px 10px", borderRadius: 99,
                      border: "1px solid var(--line)", background: "transparent",
                      color: "var(--ink-soft)", fontSize: 11.5,
                    }}
                  >대표로 설정</button>
                )}
              </span>
              <button
                className="btn-danger"
                onClick={() => handleDeletePhoto(current.id)}
                disabled={busy}
                style={{ border: "1px solid #d9aaa8", borderRadius: 99, padding: "5px 12px", fontSize: 12, background: "transparent", color: "#a13e3a" }}
              >
                삭제
              </button>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <p className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>캡션</p>
              <p style={{ fontSize: 14.5, whiteSpace: "pre-wrap" }}>
                {trip.caption || <span className="muted">캡션이 없어요.</span>}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setMode("editMeta")}
              >캡션 · 날짜 수정</button>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setMode("add")}
                disabled={full}
              >
                {full ? `사진 ${photos.length}/${MAX_PHOTOS_PER_TRIP}` : `사진 추가 (${photos.length}/${MAX_PHOTOS_PER_TRIP})`}
              </button>
            </div>
            {full && (
              <p className="muted" style={{ fontSize: 11.5, textAlign: "center", marginBottom: 4 }}>
                사진은 최대 {MAX_PHOTOS_PER_TRIP}장까지 올릴 수 있어요.
              </p>
            )}
          </>
        )}

        {/* === 캡션·날짜 수정 모드 === */}
        {mode === "editMeta" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="muted" style={{ fontSize: 12 }}>여행 날짜</label>
              <input
                type="date"
                className="field"
                value={visitedAt}
                max={todayStr()}
                onChange={(e) => setVisitedAt(e.target.value)}
                style={{ marginTop: 6 }}
              />
            </div>
            <div>
              <label className="muted" style={{ fontSize: 12 }}>
                캡션 ({caption.length}/{MAX_CAPTION})
              </label>
              <textarea
                className="field"
                rows={3}
                placeholder="이 여행을 짧게 기록해 보세요"
                value={caption}
                maxLength={MAX_CAPTION}
                onChange={(e) => setCaption(e.target.value)}
                style={{ marginTop: 6, resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMode("view")}>취소</button>
              <button className="btn" style={{ flex: 1 }} onClick={handleSaveMeta} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}

        {/* === 사진 추가 모드 === */}
        {mode === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="muted" style={{ fontSize: 12, textAlign: "center", margin: 0 }}>
              사진 {photos.length + files.length} / {MAX_PHOTOS_PER_TRIP}장
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handlePickFiles}
            />
            <button
              className="btn btn-ghost"
              onClick={() => fileRef.current?.click()}
              style={{ padding: files.length > 0 ? 14 : 30, fontSize: 14 }}
              disabled={allSlotsUsed || busy}
            >
              {files.length > 0 ? "사진 더 선택하기" : `사진 선택하기 (최대 ${MAX_PHOTOS_PER_TRIP}장)`}
            </button>

            {/* 선택한 사진 미리보기 — 개별 선택 취소 가능 */}
            {files.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {files.map((f, i) => (
                  <div key={f.url} style={{
                    position: "relative", aspectRatio: "1",
                    borderRadius: 12, overflow: "hidden", background: "var(--map-empty)",
                  }}>
                    <Image
                      src={f.url}
                      alt={`선택한 사진 ${i + 1}`}
                      fill
                      sizes="140px"
                      unoptimized
                      style={{ objectFit: "cover" }}
                    />
                    <button
                      onClick={() => handleRemoveFile(i)}
                      aria-label="선택 취소"
                      disabled={busy}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        width: 22, height: 22, borderRadius: "50%", border: 0,
                        background: "rgba(0,0,0,0.55)", color: "#fff",
                        fontSize: 13, lineHeight: 1, padding: 0,
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {allSlotsUsed && (
              <p className="muted" style={{ fontSize: 12, textAlign: "center", margin: 0 }}>
                사진은 최대 {MAX_PHOTOS_PER_TRIP}장까지 올릴 수 있어요.
              </p>
            )}

            {!trip && (
              <>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>여행 날짜</label>
                  <input
                    type="date"
                    className="field"
                    value={visitedAt}
                    max={todayStr()}
                    onChange={(e) => setVisitedAt(e.target.value)}
                    style={{ marginTop: 6 }}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    캡션 ({caption.length}/{MAX_CAPTION})
                  </label>
                  <textarea
                    className="field"
                    rows={3}
                    placeholder="이 여행을 짧게 기록해 보세요"
                    value={caption}
                    maxLength={MAX_CAPTION}
                    onChange={(e) => setCaption(e.target.value)}
                    style={{ marginTop: 6, resize: "vertical" }}
                  />
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {trip && (
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMode("view")}>
                  취소
                </button>
              )}
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={handleAddPhoto}
                disabled={busy || files.length === 0 || full}
              >
                {busy
                  ? `업로드 중… (${uploadedIdx}/${files.length})`
                  : files.length > 1 ? `${files.length}장 추가` : "추가"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function navBtnStyle(side) {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 8,
    width: 36, height: 36,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    border: 0,
    fontSize: 22,
    cursor: "pointer",
  };
}
