// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { landing } from "@/lib/strings";
import { usePrefs } from "@/lib/prefs";
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

  it("steps and section titles are h2s; the example label is not a heading; nav anchors exist", () => {
    const { container } = render(<Home />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([...landing.th.steps.map((x) => x.t), landing.th.whyTitle, landing.th.faqTitle]);
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

  it("draws the trace once and is static under reduced motion (CSS only)", () => {
    const src = readFileSync("src/app/page.tsx", "utf8");
    expect(src).toMatch(/prefers-reduced-motion: no-preference/);
    expect(src).not.toMatch(/gsap/);
    expect(src).not.toMatch(/opacity: 0[^.]/); // copy is never hidden on first paint
    expect(src).not.toMatch(/landing-settle[^}]*opacity/);
  });
});

it("layout skip link has its #content target on every page", () => {
  const src = readFileSync("src/app/layout.tsx", "utf8");
  expect(readFileSync("src/components/SkipLink.tsx", "utf8")).toContain('href="#content"');
  expect(src).toContain("<SkipLink />");
  expect(src).toMatch(/id="content"[^>]*>\{children\}/);
});
