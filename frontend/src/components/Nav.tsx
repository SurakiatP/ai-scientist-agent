"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppBar, Button, Toolbar } from "@mui/material";
import { strings } from "@/lib/strings";

const t = strings.th;

export function Nav() {
  const path = usePathname();
  const cur = (h: string) => (path === h ? ("page" as const) : undefined);
  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar variant="dense" sx={{ gap: 1, "& a": { minHeight: 44 } }}>
        <Button component={Link} href="/ask" aria-current={cur("/ask")} color="inherit">{t.navAsk}</Button>
        <Button component={Link} href="/saved" aria-current={cur("/saved")} color="inherit">{t.navSaved}</Button>
      </Toolbar>
    </AppBar>
  );
}
