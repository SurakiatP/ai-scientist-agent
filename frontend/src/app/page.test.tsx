// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { landing } from "@/lib/strings";
import { usePrefs } from "@/lib/prefs";
import { usableCounts } from "@/lib/sources";
import Home from "./page";

const cs = vi.hoisted(() => ({ mode: "system" as string, setMode: vi.fn() }));
vi.mock("@mui/material", async (orig) => ({ ...(await orig<typeof import("@mui/material")>()), useColorScheme: () => cs }));

beforeEach(() => {
  usePrefs.setState({ lang: "th" });
  cs.mode = "system"; cs.setMode.mockClear();
});

describe("landing page", () => {
  it("has exactly one h1, in Thai by default", () => {
    render(<Home />);
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(landing.th.titleA);
  });

  it("the source number counts only usable sources, and the landmarks nest correctly", () => {
    const { container } = render(<Home />);
    const u = usableCounts();
    expect(u.all).toBeLessThan(80);
    const sec = screen.getByRole("region", { name: landing.th.stats[0].t });
    expect(within(sec).getByText(String(u.all))).toBeInTheDocument();
    expect(within(sec).getByText(landing.th.stats[0].d.replace("{papers}", String(u.papers)).replace("{dbs}", String(u.dbs)))).toBeInTheDocument();
    expect(container.querySelectorAll("main")).toHaveLength(1);
    const main = container.querySelector("main")!;
    expect(main.id).toBe("content");
    expect(main.querySelector("header,footer")).toBeNull(); // header and footer sit outside main
  });

  it("renders English when the language is en", () => {
    usePrefs.setState({ lang: "en" });
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(landing.en.titleA);
  });

  it("every get-started CTA links to /chat; the example question links to /chat too", () => {
    render(<Home />);
    const ctas = screen.getAllByRole("link", { name: new RegExp(landing.th.cta) });
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const a of ctas) expect(a).toHaveAttribute("href", "/chat");
    expect(screen.getByRole("link", { name: new RegExp(landing.th.example) })).toHaveAttribute("href", "/chat");
  });

  it("has a how-it-works anchor that exists", () => {
    const { container } = render(<Home />);
    const a = screen.getByRole("link", { name: landing.th.how });
    expect(container.querySelector(a.getAttribute("href")!)).not.toBeNull();
  });

  it("is image-free and links nowhere external", () => {
    const { container } = render(<Home />);
    expect(container.querySelector("img, svg[role='img'], picture, video")).toBeNull();
    expect(container.innerHTML).not.toMatch(/url\(/i);
    expect(container.innerHTML).not.toMatch(/(src|href)="(https?:)?\/\//);
  });

  it("shows the honest check note and no NECTEC", () => {
    const { container } = render(<Home />);
    expect(screen.getByText(landing.th.checkBody)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/nectec/i);
    expect(readFileSync("src/lib/strings.ts", "utf8").match(/landing = \{[\s\S]*?\} as const/)![0]).not.toMatch(/nectec/i);
  });

  it("language toggle switches prefs and the page", () => {
    render(<Home />);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: landing.th.langLabel })).getByRole("radio", { name: "English" }));
    expect(usePrefs.getState().lang).toBe("en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(landing.en.titleA);
  });

  it("the theme button is one push: each press goes to the next of light, dark, system", () => {
    const { rerender } = render(<Home />);
    for (const [from, to] of [["light", "dark"], ["dark", "system"], ["system", "light"]]) {
      cs.mode = from; rerender(<Home />);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(landing.th.themeLabel) }));
      expect(cs.setMode).toHaveBeenLastCalledWith(to);
    }
    expect(screen.queryByRole("menu")).toBeNull(); // nothing opens
  });

  it("the header links to separate pages, with a guide marked as in development, and has no login", () => {
    render(<Home />);
    const nav = screen.getByRole("navigation", { name: landing.th.navLabel });
    expect(within(nav).getByRole("link", { name: landing.th.navHow })).toHaveAttribute("href", "/how-it-works");
    expect(within(nav).getByRole("link", { name: landing.th.navCheck })).toHaveAttribute("href", "/faq");
    expect(within(nav).getByRole("link", { name: new RegExp(landing.th.navDocs) })).toHaveAttribute("href", "/docs");
    expect(within(nav).queryByText(/เข้าสู่ระบบ|log ?in|sign ?up/i)).toBeNull();
  });

  it("section titles are h2s, steps are h3s; the example label is not a heading; nav anchors exist", () => {
    const { container } = render(<Home />);
    const L = landing.th;
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([L.painA + L.painB + L.painC, L.capTitle.replace("|", ""), L.howTitle, L.dataTitle, L.faqTitle]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(expect.arrayContaining(L.steps.map((x) => x.t)));
    expect(screen.queryByRole("heading", { name: L.exampleLabel })).toBeNull();
    for (const id of ["why", "how", "faq"]) expect(container.querySelector(`#${id}`)).not.toBeNull();
  });

  it("copy states instruction, not guarantee", () => {
    expect(landing.th.lead).toContain("ถูกสั่งให้");
    expect(landing.en.lead).toContain("instructed to");
  });

  it("has th/en parity in landing strings", () => {
    expect(Object.keys(landing.en).sort()).toEqual(Object.keys(landing.th).sort());
    expect(landing.en.steps).toHaveLength(landing.th.steps.length);
  });

  it("draws the answer sheet once and is static under reduced motion (CSS only)", () => {
    const src = readFileSync("src/app/page.tsx", "utf8");
    expect(src).toMatch(/prefers-reduced-motion: no-preference/);
    expect(src).not.toMatch(/gsap/);
    expect(src).not.toMatch(/opacity: 0[^.]/); // copy is never hidden on first paint
    expect(src).not.toMatch(/opacity: 0[,\s}]/);
  });
});

it("layout skip link has its #content target on every page", () => {
  const src = readFileSync("src/app/layout.tsx", "utf8");
  expect(readFileSync("src/components/SkipLink.tsx", "utf8")).toContain('href="#content"');
  expect(src).toContain("<SkipLink />");
  expect(src).not.toContain("id=\"content\""); // the layout wraps no main: each page renders exactly one, with header and footer outside it
  for (const f of ["app/page.tsx", "app/not-found.tsx", "app/error.tsx", "components/shell/AppShell.tsx", "components/landing/SitePage.tsx"]) {
    const s = readFileSync("src/" + f, "utf8");
    expect(s.match(/id="content"/g)).toHaveLength(1);
    expect(s.match(/component="main"/g)).toHaveLength(1);
  }
});

describe("link previews", () => {
  it("og image route uses English landing strings only", () => {
    const src = readFileSync("src/app/og/route.tsx", "utf8");
    expect(src).toMatch(/landing\.en/);
    expect(src).not.toMatch(/landing\.th|[\u0E00-\u0E7F]/);
    const { brand, badge, titleA, titleB } = landing.en;
    expect(`${brand}${badge}${titleA}${titleB}`).not.toMatch(/[\u0E00-\u0E7F]/);
  });

  it("layout sets og url and image only when the site URL is known", () => {
    const src = readFileSync("src/app/layout.tsx", "utf8");
    expect(src).toContain("metadataBase: SITE_URL");
    expect(src).toMatch(/SITE_URL && \{[^}]*url: "\.\/"/);
  });
});
