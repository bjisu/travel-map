// src/lib/session.js
"use client";
const KEY = "travel_user_id";

export function saveUserId(id) {
  if (typeof window !== "undefined") localStorage.setItem(KEY, id);
}
export function getUserId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}
export function clearUserId() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}

/* "새로 시작하기" 백그라운드 코드 발급 상태 (탭 단위) */
const PENDING = "travel_create_pending";
const PENDING_ERR = "travel_create_error";

export function setCreatePending() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING, "1");
  sessionStorage.removeItem(PENDING_ERR);
}
export function clearCreatePending() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING);
  sessionStorage.removeItem(PENDING_ERR);
}
export function isCreatePending() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(PENDING) === "1";
}
export function setCreateError(msg) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING);
  sessionStorage.setItem(PENDING_ERR, msg || "코드 발급에 실패했어요.");
}
export function getCreateError() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PENDING_ERR);
}
