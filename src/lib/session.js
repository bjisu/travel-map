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

export { generateCode } from "./utils";
