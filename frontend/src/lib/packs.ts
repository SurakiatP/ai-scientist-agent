// Field packs. The ids must equal the keys of PACKS in backend/src/scientist/packs.py (packs.test.ts checks it); absent = General.
export const PACK_IDS = ["bio", "chem", "med", "materials", "ml", "comm"] as const;
export type PackId = (typeof PACK_IDS)[number];
export const PACK_NAMES: Record<PackId, { th: string; en: string }> = {
  bio: { th: "ชีวสารสนเทศ", en: "Bioinformatics" },
  chem: { th: "เคมีสารสนเทศ", en: "Cheminformatics" },
  med: { th: "การแพทย์", en: "Medicine" },
  materials: { th: "วัสดุศาสตร์", en: "Materials science" },
  ml: { th: "การเรียนรู้ของเครื่อง", en: "Machine learning" },
  comm: { th: "การสื่อสารงานวิจัย", en: "Research communication" },
};
/** A stored or synced value is unvalidated: the id when known, else undefined (the turn stays). */
export const usablePack = (v: unknown): PackId | undefined => typeof v === "string" && (PACK_IDS as readonly string[]).includes(v) ? (v as PackId) : undefined;
export const packName = (id: PackId, lang: "th" | "en") => PACK_NAMES[id][lang];
