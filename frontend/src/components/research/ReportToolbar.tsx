"use client";
import { srOnly } from "@/lib/config";
import { Box, Divider, IconButton, MenuItem, Select, Tooltip } from "@mui/material";
import { useEditorState, type Editor } from "@tiptap/react";
import { useId, type ReactNode } from "react";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import FormatBoldRoundedIcon from "@mui/icons-material/FormatBoldRounded";
import FormatItalicRoundedIcon from "@mui/icons-material/FormatItalicRounded";
import FormatListBulletedRoundedIcon from "@mui/icons-material/FormatListBulletedRounded";
import FormatListNumberedRoundedIcon from "@mui/icons-material/FormatListNumberedRounded";
import PlaylistAddRoundedIcon from "@mui/icons-material/PlaylistAddRounded";
import PlaylistRemoveRoundedIcon from "@mui/icons-material/PlaylistRemoveRounded";
import RedoRoundedIcon from "@mui/icons-material/RedoRounded";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import ViewColumnOutlinedIcon from "@mui/icons-material/ViewColumnOutlined";
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded";
import { useT } from "@/lib/prefs";

const SIZE = { width: 36, height: 36, borderRadius: 1, "@media (pointer: coarse)": { width: 44, height: 44 } };

function Btn({ label, onClick, icon, pressed, disabled }: { label: string; onClick: () => void; icon: ReactNode; pressed?: boolean; disabled?: boolean }) {
  return (
    <Tooltip title={label} describeChild>
      <span>
        <IconButton
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          // Keep the selection in the page: the button must not steal focus from the editor.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          sx={{ ...SIZE, flex: "none", transition: "background-color 160ms cubic-bezier(0.16,1,0.3,1)", ...(pressed && { bgcolor: "action.selected", color: "primary.main" }) }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}

// Word-style formatting bar. Scrolls sideways on narrow screens instead of wrapping.
export function ReportToolbar({ editor }: { editor: Editor | null }) {
  const t = useT();
  const labelId = useId();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: !!e?.isActive("heading"), bold: !!e?.isActive("bold"), italic: !!e?.isActive("italic"),
      bullets: !!e?.isActive("bulletList"), numbered: !!e?.isActive("orderedList"), table: !!e?.isActive("table"),
      undo: !!e?.can().undo(), redo: !!e?.can().redo(),
    }),
  });
  const run = (f: (c: ReturnType<Editor["chain"]>) => { run: () => boolean }) => () => { if (editor) f(editor.chain().focus()).run(); };
  return (
    <Box
      role="toolbar"
      aria-label={t.tbBar}
      aria-orientation="horizontal"
      sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.75, overflowX: "auto", borderBottom: 1, borderColor: "divider", bgcolor: "background.paper", scrollbarWidth: "thin" }}
    >
      <Btn label={t.tbUndo} icon={<UndoRoundedIcon />} disabled={!s?.undo} onClick={run((c) => c.undo())} />
      <Btn label={t.tbRedo} icon={<RedoRoundedIcon />} disabled={!s?.redo} onClick={run((c) => c.redo())} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.75, my: 0.5 }} />
      <Box component="span" id={labelId} sx={srOnly}>{t.tbBlock}</Box>
      <Select
        size="small"
        labelId={labelId}
        value={s?.heading ? "h" : "p"}
        disabled={!editor}
        onChange={(e) => (e.target.value === "h" ? run((c) => c.setHeading({ level: 2 }))() : run((c) => c.setParagraph())())}
        sx={{ minWidth: 150, flex: "none", "& .MuiSelect-select": { minHeight: "unset !important", py: 0.75, "@media (pointer: coarse)": { py: 1.25 } } }}
      >
        <MenuItem value="p">{t.tbText}</MenuItem>
        <MenuItem value="h">{t.tbHeading}</MenuItem>
      </Select>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.75, my: 0.5 }} />
      <Btn label={t.tbBold} icon={<FormatBoldRoundedIcon />} pressed={!!s?.bold} onClick={run((c) => c.toggleBold())} />
      <Btn label={t.tbItalic} icon={<FormatItalicRoundedIcon />} pressed={!!s?.italic} onClick={run((c) => c.toggleItalic())} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.75, my: 0.5 }} />
      <Btn label={t.tbBullets} icon={<FormatListBulletedRoundedIcon />} pressed={!!s?.bullets} onClick={run((c) => c.toggleBulletList())} />
      <Btn label={t.tbNumbered} icon={<FormatListNumberedRoundedIcon />} pressed={!!s?.numbered} onClick={run((c) => c.toggleOrderedList())} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.75, my: 0.5 }} />
      <Btn label={t.tbTable} icon={<TableChartOutlinedIcon />} disabled={!!s?.table} onClick={run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))} />
      {s?.table && (
        <>
          <Btn label={t.tbRowAdd} icon={<PlaylistAddRoundedIcon />} onClick={run((c) => c.addRowAfter())} />
          <Btn label={t.tbColAdd} icon={<ViewColumnRoundedIcon />} onClick={run((c) => c.addColumnAfter())} />
          <Btn label={t.tbRowDel} icon={<PlaylistRemoveRoundedIcon />} onClick={run((c) => c.deleteRow())} />
          <Btn label={t.tbColDel} icon={<ViewColumnOutlinedIcon />} onClick={run((c) => c.deleteColumn())} />
          <Btn label={t.tbTableDel} icon={<DeleteOutlineRoundedIcon />} onClick={run((c) => c.deleteTable())} />
        </>
      )}
    </Box>
  );
}
