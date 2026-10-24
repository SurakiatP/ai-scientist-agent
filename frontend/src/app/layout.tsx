import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { Box } from "@mui/material";
import { Providers } from "@/components/Providers";
import { SkipLink } from "@/components/SkipLink";

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
          <SkipLink />
          <Box id="content" tabIndex={-1} component="main" sx={{ minHeight: "100dvh", bgcolor: "background.default", outline: "none" }}>{children}</Box>
        </Providers>
      </body>
    </html>
  );
}
