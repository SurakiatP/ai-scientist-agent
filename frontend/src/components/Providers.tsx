"use client";
import type { ReactNode } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { theme } from "@/theme";
import { SyncLayer } from "@/components/sync/SyncUI";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline />
        {children}
        <SyncLayer />
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
