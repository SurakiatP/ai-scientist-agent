import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { Box } from "@mui/material";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import { landing } from "@/lib/strings";

const notoSansThai = Noto_Sans_Thai({ subsets: ["thai", "latin"], display: "swap" });

export const metadata: Metadata = {
  title: "AI Scientist — Research Search",
  description: "Ask research questions and get cited answers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={notoSansThai.className} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="data" defaultMode="system" />
        <Providers>
            <Box component="a" href="#content" sx={{
              position: "absolute", left: 16, top: -100, zIndex: 1300, px: 2, py: 1.5, borderRadius: 1,
              bgcolor: "background.paper", color: "primary.main", fontWeight: 600, border: 1, borderColor: "primary.main",
              "&:focus": { top: 8 },
            }}>{landing.th.skip}</Box>
            <Box sx={{ display: { xs: "block", md: "flex" }, minHeight: "100dvh", bgcolor: "background.default" }}>
              <Nav />
              <Box id="content" tabIndex={-1} component="main" sx={{ flex: 1, minWidth: 0, pt: { xs: "56px", md: 0 }, outline: "none" }}>{children}</Box>
            </Box>
        </Providers>
      </body>
    </html>
  );
}
