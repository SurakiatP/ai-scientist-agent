import { ImageResponse } from "next/og";
import { landing } from "@/lib/strings";

const t = landing.en; // English only: the bundled font has no Thai glyphs, and nothing new is claimed

export function GET() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", padding: 96, background: "#E8EDF4", color: "#0E1A2C" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 40, height: 40, background: "#1C4E8F", borderRadius: 8 }} />
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>{t.brand}</div>
        </div>
        <div style={{ display: "flex", marginTop: 48, fontSize: 84, fontWeight: 700, lineHeight: 1.1 }}>{`${t.titleA} ${t.titleB.replace("|", " ")}`}</div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 36, color: "#1C4E8F" }}>{t.badge}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
