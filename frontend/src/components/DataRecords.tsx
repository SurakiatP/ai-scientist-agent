"use client";
import { Box, Link, Typography } from "@mui/material";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import type { DataRecord } from "@/lib/sse";
import { httpUrl } from "@/lib/refs";
import { sourceName } from "@/lib/sources";
import type { Strings } from "@/lib/strings";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// The store keeps records as unvalidated dicts: keep only usable ones, and link only http(s) urls.
export const usableRecords = (records: unknown): DataRecord[] =>
  (Array.isArray(records) ? records : []).flatMap((r: unknown) => {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const title = str(x.title);
    return title ? [{ database: str(x.database), id: str(x.id), title, url: str(x.url), summary: str(x.summary) }] : [];
  });

// Facts from scientific databases under the answer: hairline-separated rows, never numbered citations. Nothing when there are none.
export function DataRecords({ records, t }: { records: unknown; t: Strings }) {
  const rows = usableRecords(records);
  if (rows.length === 0) return null;
  return (
    <Box component="section" aria-labelledby="data-records-h" sx={{ mt: 3 }}>
      <Typography id="data-records-h" component="h2" sx={{ fontSize: "1.0625rem", fontWeight: 700, mb: 0.5 }}>{t.recordsTitle}</Typography>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
        {rows.map((r, i) => {
          const href = httpUrl(r.url);
          return (
            <Box component="li" key={`${r.database}:${r.id}:${i}`} sx={{ py: 1.25, borderTop: i === 0 ? 0 : 1, borderColor: "divider", minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", overflowWrap: "anywhere" }}>
                {sourceName(r.database) || r.database}
                {r.id && <> · <Box component="span" sx={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontVariantNumeric: "tabular-nums" }}>{r.id}</Box></>}
              </Typography>
              {href ? (
                <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, minHeight: 44, fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.5, color: "primary.main", overflowWrap: "anywhere" }}>
                  {r.title}
                  <OpenInNewRoundedIcon titleAccess={t.recordOpen} sx={{ fontSize: 16, flexShrink: 0 }} />
                </Link>
              ) : (
                <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.5, py: 0.5, overflowWrap: "anywhere" }}>{r.title}</Typography>
              )}
              {r.summary && (
                <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.6, color: "text.secondary", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.summary}</Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
