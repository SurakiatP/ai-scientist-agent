import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai_Looped } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { Box } from "@mui/material";
import { Providers } from "@/components/Providers";
import { SkipLink } from "@/components/SkipLink";
import { BG, SITE_URL } from "@/lib/config";

const notoSansThai = Noto_Sans_Thai_Looped({ subsets: ["thai", "latin"], display: "swap" }); // looped Thai: the formal, document-like voice of the reference

const DESC = "ตั้งคำถามวิจัยเป็นภาษาไทยหรืออังกฤษ ได้คำตอบจากงานวิชาการพร้อมอ้างอิง อ้างอิงที่มี DOI, PMID หรือ arXiv ID จะถูกตรวจว่าเลขนั้นมีอยู่จริง";

export const metadata: Metadata = {
  title: "AI Scientist · ผู้ช่วยค้นคว้างานวิชาการ",
  description: DESC,
  metadataBase: SITE_URL,
  openGraph: {
    title: "AI Scientist", description: DESC, siteName: "AI Scientist", locale: "th_TH", alternateLocale: "en_US", type: "website",
    ...(SITE_URL && { url: "./", images: [{ url: "/og", width: 1200, height: 630, alt: "AI Scientist" }] }), // only with a known origin: no localhost URL in production HTML
  },
};

export const viewport: Viewport = {
  viewportFit: "cover", // lets env(safe-area-inset-*) work on notched phones
  themeColor: [{ media: "(prefers-color-scheme: light)", color: BG.light }, { media: "(prefers-color-scheme: dark)", color: BG.dark }],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={notoSansThai.className} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="data" defaultMode="system" />
        <Providers>
          <SkipLink />
          <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>{children}</Box>
        </Providers>
      </body>
    </html>
  );
}
