import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "./config";
import { streamPreview, type PreviewStage } from "./sse";

export type PreviewError = "429" | "422" | "503" | "net" | "other";
export type PreviewState = { busy: boolean; stage: PreviewStage | null; url: string | null; pages: number; error: PreviewError | null };
const idle: PreviewState = { busy: false, stage: null, url: null, pages: 0, error: null };
export const DEBOUNCE_MS = 700;

// Render the payload as a PDF via the SSE preview route. Each change aborts the previous stream; its results are ignored.
// payload null = nothing to preview (the form has errors): the last PDF stays, no request is made.
export function usePreview(payload: unknown | null) {
  const [s, setS] = useState<PreviewState>(idle);
  const [nonce, setNonce] = useState(0);
  const urlRef = useRef<string | null>(null); // the PDF on show: revoked when replaced and on unmount
  const skipDebounce = useRef(true); // first render and Retry start at once; edits wait
  const key = payload === null ? null : JSON.stringify(payload);
  const retry = useCallback(() => { skipDebounce.current = true; setNonce((n) => n + 1); }, []);
  useEffect(() => {
    if (key === null) return;
    const ac = new AbortController();
    const live = () => !ac.signal.aborted;
    const timer = setTimeout(async () => {
      setS((x) => ({ ...x, busy: true, stage: "queued", error: null }));
      const fail = (error: PreviewError) => live() && setS((x) => ({ ...x, busy: false, stage: null, error }));
      try {
        for await (const e of streamPreview(JSON.parse(key), ac.signal)) {
          if (!live()) return;
          if (e.type === "preview_status") setS((x) => ({ ...x, stage: e.stage }));
          else if (e.type === "error") return fail(e.code === "network" ? "net" : e.status === 429 ? "429" : e.status === 422 ? "422" : e.status === 503 ? "503" : "other");
          else {
            const res = await fetch(`${API_BASE}/v1/reports/preview/${e.id}`, { signal: ac.signal });
            if (!res.ok) return fail("other");
            const url = URL.createObjectURL(await res.blob());
            if (!live()) { URL.revokeObjectURL(url); return; }
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
            urlRef.current = url;
            setS({ busy: false, stage: null, url, pages: e.pages, error: null });
            return;
          }
        }
        fail("other"); // stream ended without a result
      } catch { fail("net"); }
    }, skipDebounce.current ? 0 : DEBOUNCE_MS);
    skipDebounce.current = false;
    return () => { ac.abort(); clearTimeout(timer); };
  }, [key, nonce]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  return { ...s, retry };
}
