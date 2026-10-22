# Product

<!-- impeccable:product-schema 1 -->

> Written by the Task 10 implementer from the task brief and `docs/superpowers/specs/2026-10-22-ai-scientist-research-search-design.md`.
> No live interview took place (run as a subagent with no question tool). Every fact below comes from the brief or spec; items marked **[inferred]** are the implementer's reading.

## Platform

web

## Users

Researchers on teams like those at NECTEC (Thailand's national electronics and computer technology centre): AI/language, image and medical imaging, devices/sensors, IoT, microelectronics. Their job: answer "what are the latest methods for X and how do they compare?" with a cited summary they can trust, a job that is manual literature review today. They read Thai and English.

## Product Purpose

A researcher asks a scientific-research question in Thai or English and watches an agent plan up to 5 searches, query scholarly sources (arXiv, OpenAlex, Crossref, PubMed, Semantic Scholar and others), and stream back a comparative answer. Success: an answer whose every cited DOI/PMID was checked to exist, built only from retrieved papers.

## Positioning

The work is visible: the plan, the searches and the papers found appear live, and each reference is checked to exist before it is shown. The check is existence only; it does not prove a paper supports the claim, and the product must say so honestly.

## Operating Context

Runs on localhost for now (later inside the organisation's network). No login. History and saved answers stay in the researcher's own browser, per device.

## Capabilities and Constraints

- Answers only scientific-research questions; others get a polite refusal.
- Answers only from retrieved papers, never from model memory.
- Up to 5 planned searches per question.
- Must work offline on localhost: no external fonts, images or CDNs at runtime.
- Thai is the default UI language; English strings exist.

## Brand Commitments

- Tone: calm, rigorous, modern, trustworthy. Not hype.
- No NECTEC logo or brand assets (none supplied). Never imply endorsement by NECTEC.
- Colour palette is a placeholder in `frontend/src/theme.ts` until the Figma palette arrives; all colours come from those tokens.
- Typeface: Noto Sans Thai (self-hosted via next/font).

## Evidence on Hand

None. No users, testimonials, logos, accuracy figures or usage statistics exist. Do not invent any.

## Product Principles

1. Show the work, not a promise: the plan and sources are the proof.
2. Claim only what is checked, and name the limits of the check.
3. The researcher's data stays with the researcher.
4. Thai and English are equal citizens.

## Accessibility & Inclusion

WCAG AA basics: text contrast >= 4.5:1, visible focus, 44px touch targets, works at 360px width, respects `prefers-reduced-motion`. **[inferred from brief]**
