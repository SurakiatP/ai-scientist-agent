import { Sarabun, Niramit, Chakra_Petch, Bai_Jamjuree, K2D, Krub, KoHo, Noto_Sans_Thai, IBM_Plex_Sans_Thai, Prompt, Kanit } from "next/font/google";

// Faces of the report fonts, used by the A4 sheet and the font picker so the page looks like the exported file.
// next/font needs literal options at module scope; preload:false keeps faces out of every <head> (a face downloads only when something renders in it).
const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });
const niramit = Niramit({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });
const chakra = Chakra_Petch({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });
const baijam = Bai_Jamjuree({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });
const k2d = K2D({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });
const krub = Krub({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });
const koho = KoHo({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });
const noto = Noto_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "700"], preload: false, display: "swap" });
const plex = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "700"], preload: false, display: "swap" });
const prompt = Prompt({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });
const kanit = Kanit({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false, display: "swap" });

// Keyed by backend font id (FONTS_BY_ID in report_render.py). The TH Sarabun ids show Sarabun, the OFL face the PDF embeds.
export const FACE = {
  "sarabun": sarabun.style.fontFamily,
  "th-sarabun-new": sarabun.style.fontFamily,
  "th-sarabun-psk": sarabun.style.fontFamily,
  "th-sarabun-it9": sarabun.style.fontFamily,
  "th-niramit": niramit.style.fontFamily,
  "th-chakra-petch": chakra.style.fontFamily,
  "th-baijam": baijam.style.fontFamily,
  "th-k2d": k2d.style.fontFamily,
  "th-krub": krub.style.fontFamily,
  "th-koho": koho.style.fontFamily,
  "noto-sans-thai": noto.style.fontFamily,
  "ibm-plex-sans-thai": plex.style.fontFamily,
  "prompt": prompt.style.fontFamily,
  "kanit": kanit.style.fontFamily,
} as const;
