import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("lv_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function setToken(t) {
  if (t) localStorage.setItem("lv_token", t);
  else localStorage.removeItem("lv_token");
}

export function getToken() {
  return localStorage.getItem("lv_token");
}

export async function uploadAudio(blob, language = "en") {
  const token = getToken();
  const fd = new FormData();
  fd.append("file", blob, "recording.webm");
  fd.append("language", language);
  const res = await fetch(`${API}/stt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) throw new Error("stt failed");
  return res.json();
}

// SSE streaming via fetch
export async function streamChat(body, onDelta, onDone) {
  const token = getToken();
  const res = await fetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const data = JSON.parse(line.slice(5).trim());
        if (data.delta) onDelta(data.delta);
        if (data.done) onDone && onDone();
      } catch (e) {}
    }
  }
  onDone && onDone();
}
