// Publishes the manual (manual/pages + shots.yaml + media) to the app:
//   frontend/src/content/manual/{th,en}.json   topics, sections as Markdown (images/videos already resolved)
//   frontend/public/manual/<lang>/             only the media the pages use (png -> webp, mp4/poster/vtt for clips)
// Run from anywhere: node manual/publish-docs.mjs. Re-run after the media or pages change (clips are picked up when their mp4 exists).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manual = join(root, "manual");
const front = join(root, "frontend");
const yaml = createRequire(join(front, "package.json"))("js-yaml"); // transitive dep of eslint; no new dependency
const config = yaml.load(readFileSync(join(manual, "manual.config.yaml"), "utf8"));
const shots = yaml.load(readFileSync(join(manual, "shots.yaml"), "utf8"));
const book = config.books["user-guide"];
const langs = config.languages;
const pick = (v, lang) => (v && typeof v === "object" ? v[lang] ?? v.en : v);

const stale = (src, out) => !existsSync(out) || statSync(out).mtimeMs < statSync(src).mtimeMs;
const keep = (src, out) => { if (stale(src, out)) copyFileSync(src, out); };
const pngSize = (f) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

function webp(src, out) {
  if (stale(src, out)) execFileSync("cwebp", ["-quiet", "-q", "82", "-m", "6", src, "-o", out]);
}

const plain = (s) => s.replace(/\{\{ui:"([^"]+)"\}\}/g, "$1").replace(/\*\*/g, "");
const bold = (s) => s.replace(/\{\{ui:"([^"]+)"\}\}/g, "**$1**");

for (const lang of langs) {
  const dir = join(manual, "pages", lang, "user-guide");
  const outMedia = join(front, "public", "manual", lang);
  mkdirSync(outMedia, { recursive: true });
  const used = new Set(), files = new Set(); // files: everything this run wants in outMedia; the rest is pruned at the end

  const raw = readdirSync(dir).filter((f) => /^\d+-.+\.md$/.test(f)).sort().map((file) => {
    const text = readFileSync(join(dir, file), "utf8");
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
    const fm = Object.fromEntries(m[1].split("\n").map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map((x) => [x[1], x[2]]));
    return { file: file.replace(/\.md$/, ""), id: fm.id, title: fm.title, group: fm.group, body: text.slice(m[0].length) };
  });
  const titleOf = Object.fromEntries(raw.map((t) => [t.id, t.title]));

  const image = (name, alt, caption) => {
    const src = join(manual, "media", lang, `${name}.png`);
    if (!existsSync(src)) return null;
    webp(src, join(outMedia, `${name}.webp`));
    used.add(name); files.add(`${name}.webp`);
    const [w, h] = pngSize(src);
    const title = caption ? ` "${caption.replace(/"/g, "'")}"` : "";
    return `![${alt.replace(/[[\]]/g, "")}](/manual/${lang}/${name}.webp#${w}x${h}${title})`;
  };

  const steps = (id) => {
    const def = shots.steps?.[id];
    if (!def) { console.warn(`[${lang}] steps:${id} not in shots.yaml`); return ""; }
    return def.steps.map((s, i) => {
      const text = pick(s.text, lang);
      const img = image(`${id}-${i + 1}`, plain(text), "");
      return `${i + 1}. ${bold(text)}${img ? `\n\n   ${img}` : ""}`;
    }).join("\n\n");
  };

  const shot = (id) => {
    const cap = pick(shots.shots?.[id]?.caption, lang) ?? id;
    return image(id, cap, cap) ?? "";
  };

  // A clip is published only when its mp4 exists; re-run later to pick it up.
  const clip = (id) => {
    const base = [join(manual, "media", lang), join(manual, "media", lang, "clips")].find((d) => existsSync(join(d, `${id}.mp4`)));
    if (!base) return "";
    const mp4 = join(base, `${id}.mp4`);
    const cap = pick(shots.clips?.[id]?.caption, lang) ?? id;
    keep(mp4, join(outMedia, `${id}.mp4`)); files.add(`${id}.mp4`);
    const poster = join(base, `${id}.poster.png`);
    if (existsSync(poster)) { webp(poster, join(outMedia, `${id}.poster.webp`)); files.add(`${id}.poster.webp`); }
    const vtt = join(base, `${id}.vtt`);
    const cc = existsSync(vtt);
    if (cc) { keep(vtt, join(outMedia, `${id}.vtt`)); files.add(`${id}.vtt`); }
    return `![${cap.replace(/[[\]]/g, "")}](/manual/${lang}/${id}.mp4#${cc ? "cc" : "nocc"} "${cap.replace(/"/g, "'")}")`;
  };

  const prepare = (body) => {
    let out = body
      .replace(/\{\{steps:([\w-]+)\}\}/g, (_, id) => steps(id))
      .replace(/\{\{shot:([\w-]+)\}\}/g, (_, id) => shot(id))
      .replace(/\{\{clip:([\w-]+)\}\}/g, (_, id) => clip(id))
      .replace(/\[\[([\w-]+)\]\]/g, (_, id) => {
        if (!titleOf[id]) { console.warn(`[${lang}] link to unknown page ${id}`); return id; }
        return `[${titleOf[id]}](/docs/${id})`;
      });
    out = bold(out);
    // "Problem: ... / Fix: ..." items: bold labels on their own lines.
    out = out.split("\n").map((l) => l
      .replace(/^(\s*)- (Problem|ปัญหา):/, "$1- **$2:**")
      .replace(/^(\s+)(Fix|วิธีแก้ไข):/, "$1**$2:**")).join("\n")
      .replace(/(\*\*(?:Problem|ปัญหา):\*\*[^\n]*)\n(\s+)\*\*/g, "$1  \n$2**");
    return out;
  };

  const topics = raw.map((t) => {
    const sections = t.body.split(/^## /m).filter((s) => s.trim()).map((part) => {
      const [heading, ...rest] = part.split("\n");
      return { heading: heading.trim(), body: prepare(rest.join("\n").trim()) };
    });
    const first = sections[0]?.body.split(/\n\n/)[0] ?? "";
    const summary = first.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
    return { id: t.id, file: t.file, group: t.group, title: t.title, summary, sections };
  });

  const data = {
    book: { title: pick(book.title, lang), description: pick(book.description, lang)?.replace(/\s+/g, " ") },
    groups: book.groups.map((g) => ({ id: g.id, title: pick(g.title, lang) })),
    topics,
  };
  const out = join(front, "src", "content", "manual");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${lang}.json`), JSON.stringify(data, null, 1) + "\n");
  for (const f of readdirSync(outMedia)) if (!files.has(f)) rmSync(join(outMedia, f), { force: true, recursive: true });
  console.log(`${lang}: ${topics.length} topics, ${used.size} images, ${readdirSync(outMedia).length} files`);
}
