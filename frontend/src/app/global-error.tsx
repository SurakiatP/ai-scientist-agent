"use client";
// Replaces the root layout, so no theme or prefs here: plain bilingual copy, system colours.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", colorScheme: "light dark" }}>
        <title>AI Scientist</title>
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: "1.5rem" }}>เกิดข้อผิดพลาดบางอย่าง / Something went wrong</h1>
          <p>ลองอีกครั้ง ข้อมูลแชตในเบราว์เซอร์ไม่ได้รับผลกระทบ / Try again; your chats in this browser are not affected.</p>
          <button onClick={() => retry()} style={{ minHeight: 44, padding: "0 20px", font: "inherit" }}>ลองอีกครั้ง / Retry</button>
        </main>
      </body>
    </html>
  );
}
