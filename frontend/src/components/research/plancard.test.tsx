// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePrefs } from "@/lib/prefs";
import { strings } from "@/lib/strings";
import { PlanCard, type PlanSearch } from "./PlanCard";

const t = strings.en;
const plan: PlanSearch[] = [
  { term: "alpha term", instructions: "focus on retrieval" },
  { term: "beta term", instructions: "" },
];
const noop = vi.fn();

beforeEach(() => { usePrefs.setState({ lang: "en" }); });
afterEach(cleanup);

const begin = (overrides: Partial<{ onApprove: typeof noop; onCancel: typeof noop }> = {}) => {
  const card = render(<PlanCard searches={plan} editable onApprove={overrides.onApprove ?? noop} onCancel={overrides.onCancel ?? noop} />);
  fireEvent.click(screen.getByRole("button", { name: t.editPlan }));
  return card;
};

describe("PlanCard", () => {
  it("adds the same keys to both th and en", () => {
    expect(Object.keys(strings.en).sort()).toEqual(Object.keys(strings.th).sort());
  });

  it("awaiting review shows start and cancel without opening the editor", () => {
    const onApprove = vi.fn(), onCancel = vi.fn();
    render(<PlanCard searches={plan} editable onApprove={onApprove} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: t.planStart }));
    expect(onApprove).toHaveBeenCalledWith(plan);
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("rowState puts a real status chip on every row", () => {
    render(<PlanCard searches={plan} editable={false} rowState={(term) => (term === "alpha term" ? "done" : "wait")} onApprove={noop} onCancel={noop} />);
    expect(screen.getByText(t.rowDone)).toBeTruthy();
    expect(screen.getByText(t.stepPending)).toBeTruthy();
  });

  it("read-only mode lists numbered rows and has no edit button", () => {
    const { container } = render(<PlanCard searches={plan} editable={false} onApprove={noop} onCancel={noop} />);
    expect(screen.getByText(t.planEditableTitle)).toBeInTheDocument();
    const rows = [...container.querySelectorAll("li")];
    expect(rows).toHaveLength(2);
    expect(screen.getByText("alpha term")).toBeInTheDocument();
    expect(within(rows[0]).getByText("focus on retrieval")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.editPlan })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(within(rows[0]).getByText("1")).toBeInTheDocument();
    expect(within(rows[1]).getByText("2")).toBeInTheDocument();
  });

  it("edit turns rows into labelled fields and focus moves to the first term", () => {
    render(<PlanCard searches={plan} editable onApprove={noop} onCancel={noop} />);
    fireEvent.click(screen.getByRole("button", { name: t.editPlan }));
    const terms = screen.getAllByLabelText(new RegExp(`^${t.planTerm}`));
    expect(terms).toHaveLength(2);
    expect(terms[0]).toHaveValue("alpha term");
    expect(screen.getAllByLabelText(t.planInstructions)).toHaveLength(2);
    expect(document.activeElement).toBe(terms[0]);
    fireEvent.keyDown(terms[0], { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("validation blocks Thai terms until they are replaced", () => {
    const onApprove = vi.fn();
    begin({ onApprove });
    const first = screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))[0];
    fireEvent.change(first, { target: { value: "แผนการวิจัย" } });
    fireEvent.click(screen.getByRole("button", { name: t.planStart }));
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByText(t.planTermEnglish)).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))[0], { target: { value: "research plan" } });
    expect(screen.queryByText(t.planTermEnglish)).toBeNull();
  });

  it("term is required and blocks start when a row is empty", () => {
    const onApprove = vi.fn();
    begin({ onApprove });
    fireEvent.change(screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))[1], { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: t.planStart }));
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByText(t.planTermRequired)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.planStart }));
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("add stops at five rows and removal keeps at least one", () => {
    begin();
    const add = screen.getByRole("button", { name: t.planAdd });
    for (let i = 0; i < 3; i++) fireEvent.click(add);
    expect(screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))).toHaveLength(5);
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))).toHaveLength(5);
    const removes = () => screen.getAllByRole("button", { name: new RegExp(t.planRemoveTerm) });
    while (removes().length > 1) fireEvent.click(removes()[0]);
    expect(screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))).toHaveLength(1);
    expect(removes()[0]).toBeDisabled();
  });

  it("onApprove gets trimmed, non-empty terms", () => {
    const onApprove = vi.fn();
    begin({ onApprove });
    fireEvent.change(screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))[0], { target: { value: "  alpha term  " } });
    fireEvent.change(screen.getAllByLabelText(t.planInstructions)[0], { target: { value: "  focus on retrieval  " } });
    fireEvent.change(screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))[1], { target: { value: " beta term " } });
    fireEvent.click(screen.getByRole("button", { name: t.planStart }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith([
      { term: "alpha term", instructions: "focus on retrieval" },
      { term: "beta term", instructions: "" },
    ]);
  });

  it("cancel reports that the plan was not approved", () => {
    const onCancel = vi.fn();
    begin({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("interactive targets are at least 44px", () => {
    const { container } = render(<PlanCard searches={plan} editable onApprove={noop} onCancel={noop} />);
    expect(getComputedStyle(screen.getByRole("button", { name: t.editPlan })).minHeight).toBe("44px");
    fireEvent.click(screen.getByRole("button", { name: t.editPlan }));
    for (const name of [t.planAdd]) // start/cancel get 44px from the theme, which this test does not mount
      expect(getComputedStyle(screen.getByRole("button", { name })).minHeight).toBe("44px");
    const remove = screen.getByRole("button", { name: `${t.planRemoveTerm} 1` });
    expect(getComputedStyle(remove).height).toBe("44px");
    expect(getComputedStyle(remove).width).toBe("44px");
    expect(within(container).getAllByRole("textbox").length).toBeGreaterThan(0);
  });
});
