// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProgress } from "@/lib/progress";
import { usePrefs } from "@/lib/prefs";
import { API_BASE } from "@/lib/config";
import { strings } from "@/lib/strings";
import type { Turn, TurnAnalysis } from "@/lib/chat";
import { AnalysisArtifact, cellText, formatSeconds, missingPercent, stepSeconds } from "./AnalysisArtifact";

const t = strings.en;
const base = (analysis: TurnAnalysis, status: Turn["status"] = "done"): Turn => ({
  id: "t1", question: "What changed?", createdAt: 1, status, progress: emptyProgress, kind: "analysis", analysis,
});
const data: TurnAnalysis = {
  fileId: "f".repeat(32), fileName: "weather.csv", steps: ["profiling", "writing_script", "running", "storing"],
  script: "import pandas as pd\nprint('ok')\n# <script>alert(1)</script>",
  quality: {
    rows: 12, columns: 2, truncated: true,
    columns_info: [{ name: "region", dtype: "object", null_pct: 25 }, { name: "value", dtype: "float64", null_pct: 0 }],
  },
  tables: [{ name: "by_region", columns: ["region", "value"], rows: [["north", 1], ["south", null]], truncated: true }],
  findings: ["North leads.", "One region is missing a value."],
  timings: { load_s: 0.5, total_s: 65.4 },
  artifacts: [
    { id: "fig1", name: "trend.png", kind: "figure", url: "/v1/artifacts/f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1" },
    { id: "csv1", name: "by_region.csv", kind: "csv", url: "/v1/artifacts/c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1" },
  ],
};

beforeEach(() => {
  localStorage.clear();
  usePrefs.setState({ lang: "en" });
});
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("timing helpers", () => {
  it("only reports timings the backend actually sent", () => {
    expect(stepSeconds({ script_s: 3 }, "running")).toBe(3);
    expect(stepSeconds({ load_s: 0.4 }, "profiling")).toBe(0.4);
    expect(stepSeconds({ total_s: 3 }, "running")).toBeNull();
    expect(stepSeconds(undefined, "storing")).toBeNull();
    expect(formatSeconds(65.4)).toBe("1 min 5.4 s");
    expect(formatSeconds(0.5)).toBe("0.5 s");
  });

  it("averages missing values across the described columns", () => {
    expect(missingPercent(data)).toBe(12.5);
    expect(missingPercent({ fileId: "f".repeat(32), steps: [] })).toBeNull();
  });
});

describe("AnalysisArtifact", () => {
  it("shows the file, status, duration, steps, quality and downloads", () => {
    render(<AnalysisArtifact turn={base(data)} />);
    expect(screen.getByRole("heading", { name: "weather.csv" })).toBeInTheDocument();
    expect(screen.getByText(t.analysisResultTitle)).toBeInTheDocument();
    expect(screen.getByText(t.done)).toBeInTheDocument();
    expect(screen.getByText(`${t.elapsed} 1 min 5.4 s`)).toBeInTheDocument();
    expect(screen.getByText(t.analysisStepProfiling)).toBeInTheDocument();
    expect(screen.getByText(t.analysisStepWriting)).toBeInTheDocument();
    expect(screen.getByText(t.analysisStepRunning)).toBeInTheDocument();
    expect(screen.getByText(t.analysisStepStoring)).toBeInTheDocument();
    expect(screen.getByText("0.5 s")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("12.5%")).toBeInTheDocument();
    expect(screen.getByText(t.analysisTruncated)).toBeInTheDocument();
    expect(screen.getAllByText("region").length).toBeGreaterThan(0);
    const link = screen.getByRole("link", { name: `${t.download} by_region.csv` });
    expect(link).toHaveAttribute("href", `${API_BASE}/v1/artifacts/c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1`);
    expect(link).toHaveAttribute("download", "by_region.csv");
  });

  it("renders tables, figures, findings and escaped code in their tabs", () => {
    const { container } = render(<AnalysisArtifact turn={base(data)} />);
    tab(t.analysisTabTables);
    expect(screen.getByText("by_region")).toBeInTheDocument();
    expect(screen.getByText("north")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(t.analysisTableTruncated)).toBeInTheDocument();

    tab(t.analysisTabCharts);
    const img = screen.getByRole("img", { name: `${t.analysisChartAlt}: trend.png` });
    expect(img).toHaveAttribute("src", `${API_BASE}/v1/artifacts/f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1`);
    expect(screen.getByText("trend.png")).toBeInTheDocument();

    tab(t.analysisTabFindings);
    expect(screen.getByText("North leads.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();

    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    tab(t.analysisTabCode);
    expect(screen.getByText(/import pandas as pd/)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.analysisCopyCode }));
    return screen.findByText(t.copied);
  });

  it("shows an active step and no duration while running", () => {
    const { container } = render(<AnalysisArtifact turn={base({ ...data, steps: ["profiling", "running"], timings: undefined }, "running")} />);
    expect(screen.getByText(t.analysisRunning)).toBeInTheDocument();
    expect(screen.queryByText(t.elapsed)).toBeNull();
    expect(container.querySelector('[data-step="running"]')).toHaveAttribute("data-state", "active");
    expect(container.querySelector('[data-step="profiling"]')).toHaveAttribute("data-state", "done");
  });

  it("rejects unsafe or absolute artifact URLs and shows honest empty states", () => {
    const empty: TurnAnalysis = {
      fileId: "f".repeat(32), steps: [],
      artifacts: [
        { id: "a", name: "bad.png", kind: "figure", url: "https://evil.test/a.png" },
        { id: "b", name: "bad.png", kind: "figure", url: "//evil.test/b.png" },
        { id: "c", name: "bad.csv", kind: "csv", url: "javascript:alert(1)" },
        { id: "d", name: "bad.png", kind: "figure", url: "/\\evil.example/x" },
        { id: "e", name: "bad.png", kind: "figure", url: `/v1/artifacts/${"a".repeat(32)}/../x` },
        { id: "f", name: "bad.png", kind: "figure", url: "/v1/artifacts/short" },
      ],
    };
    render(<AnalysisArtifact turn={base(empty, "error")} />);
    expect(screen.getByText(t.error)).toBeInTheDocument();
    expect(screen.getByText(t.analysisNoSteps)).toBeInTheDocument();
    expect(screen.getByText(t.analysisNoQuality)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();

    tab(t.analysisTabTables);
    expect(screen.getByText(t.analysisNoTables)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    tab(t.analysisTabCharts);
    expect(screen.getByText(t.analysisNoCharts)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    tab(t.analysisTabFindings);
    expect(screen.getByText(t.analysisNoFindings)).toBeInTheDocument();
    tab(t.analysisTabCode);
    expect(screen.getByText(t.analysisNoCode)).toBeInTheDocument();
  });

  it("reports a failed clipboard write", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("no")) }, configurable: true });
    render(<AnalysisArtifact turn={base(data)} />);
    tab(t.analysisTabCode);
    fireEvent.click(screen.getByRole("button", { name: t.analysisCopyCode }));
    expect(await screen.findByText(t.copyFailed)).toBeInTheDocument();
  });
});

describe("cellText", () => {
  it("formats numbers for display only", () => {
    expect(cellText(0.6666666667)).toBe("0.67");
    expect(cellText(66.6666666667)).toBe("66.67");
    expect(cellText(12345)).toBe("12,345");
    expect(cellText("0.6666666667")).toBe("0.6666666667");
    expect(formatSeconds(0.01)).toBe("<0.1 s");
  });
});
