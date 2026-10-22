"use client";
import Link from "next/link";
import { AppBar, Button, Toolbar } from "@mui/material";
import { strings } from "@/lib/strings";

const t = strings.th;

export function Nav() {
  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Button component={Link} href="/ask" color="inherit">{t.navAsk}</Button>
        <Button component={Link} href="/saved" color="inherit">{t.navSaved}</Button>
      </Toolbar>
    </AppBar>
  );
}
