import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { Box, CssBaseline, ThemeProvider } from "@mui/material";
import { Nav } from "@/components/Nav";
import { theme } from "@/theme";
import { landing } from "@/lib/strings";

const notoSansThai = Noto_Sans_Thai({ subsets: ["thai", "latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Research Search",
  description: "Ask research questions and get cited answers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={notoSansThai.className}>
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box component="a" href="#content" sx={{
              position: "absolute", left: 16, top: -100, zIndex: 1300, px: 2, py: 1.5, borderRadius: 1,
              bgcolor: "background.paper", color: "primary.main", fontWeight: 600, border: 1, borderColor: "primary.main",
              "&:focus": { top: 8 },
            }}>{landing.th.skip}</Box>
            <Nav />
            <Box id="content" tabIndex={-1} sx={{ outline: "none" }}>{children}</Box>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
