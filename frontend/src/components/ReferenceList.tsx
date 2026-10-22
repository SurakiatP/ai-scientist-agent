"use client";
import { Chip, Link, List, ListItem, Stack, Typography } from "@mui/material";
import type { Reference } from "@/lib/sse";
import type { Strings } from "@/lib/strings";

const ARXIV = /^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\/[0-9a-z./-]+$/i;
const DOI = /^10\.[0-9]{4,9}\/\S+$/;
const PMID = /^[0-9]{1,9}$/;

// Only DOI, PMID and arXiv links are ever rendered as anchors (the backend validates too; defend again).
export function paperLink(p: Reference["paper"]): string | null {
  const doi = p.doi?.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "");
  if (doi && DOI.test(doi)) return `https://doi.org/${encodeURI(doi)}`;
  const pmid = p.pmid?.trim();
  if (pmid && PMID.test(pmid)) return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  const url = p.url?.trim();
  return url && ARXIV.test(url) ? url : null;
}

export function ReferenceList({ references, t }: { references: Reference[]; t: Strings }) {
  return (
    <List disablePadding sx={{ display: "grid", gap: 1.5 }}>
      {references.map((r) => {
        const href = paperLink(r.paper);
        const meta = [r.paper.authors.slice(0, 3).join(", ") + (r.paper.authors.length > 3 ? " et al." : ""), r.paper.year]
          .filter(Boolean)
          .join(" · ");
        return (
          <ListItem
            key={r.id}
            id={`ref-${r.id}`}
            disableGutters
            sx={{
              alignItems: "flex-start",
              gap: 1.5,
              p: 1.5,
              borderRadius: 2,
              scrollMarginTop: 16,
              "&:target": { bgcolor: "primary.light" },
            }}
          >
            <Typography sx={{ color: "text.secondary", minWidth: 28 }}>[{r.id}]</Typography>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              {href ? (
                <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontWeight: 600 }}>
                  {r.paper.title}
                </Link>
              ) : (
                <Typography sx={{ fontWeight: 600 }}>{r.paper.title}</Typography>
              )}
              {meta && <Typography variant="body2" sx={{ color: "text.secondary" }}>{meta}</Typography>}
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                {r.status === "verified" && <Chip size="small" color="success" variant="outlined" label={t.verified} />}
                {r.status === "unverified" && <Chip size="small" color="error" label={`⚠ ${t.unverified}`} title={t.unverifiedHint} />}
                {r.status === "unknown" && <Chip size="small" variant="outlined" label={`⚠ ${t.unknown}`} title={t.unknownHint} />}
                {r.paper.doi && <Chip size="small" variant="outlined" label={`DOI ${r.paper.doi}`} />}
                {r.paper.pmid && <Chip size="small" variant="outlined" label={`PMID ${r.paper.pmid}`} />}
              </Stack>
            </Stack>
          </ListItem>
        );
      })}
    </List>
  );
}
