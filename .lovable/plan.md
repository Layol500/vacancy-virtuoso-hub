
# Job Application Assistant — Plan

A single-user web app that helps you tailor applications: upload your CV once, match it to job descriptions, get an ATS score, generate cover letters, search live job vacancies, and track every application through its stages.

## Pages

1. **Dashboard** (`/`) — quick stats (saved jobs, applications by stage), recent matches, CTA buttons.
2. **My CV** (`/cv`) — upload PDF/DOCX, view parsed text, edit, store.
3. **Match & Analyze** (`/match`) — paste a JD or pick a saved job → ATS score, keyword gaps, strengths, suggestions.
4. **Cover Letter** (`/cover-letter`) — generate tailored cover letter from CV + JD, edit, copy/download.
5. **Job Search** (`/jobs`) — search live vacancies by keyword/location, save interesting ones.
6. **Applications** (`/applications`) — Kanban board: Saved → Applied → Interview → Offer → Rejected. Drag cards between columns; each card links back to its match analysis and cover letter.

## Core Features

- **CV intake**: upload PDF/DOCX, extract text via parsing on the server, store in Cloud DB. Edit-after-parse fallback.
- **ATS Match**: AI compares CV vs JD and returns a score (0–100), matched keywords, missing keywords, formatting/keyword tips.
- **Cover Letter**: AI generates a tailored letter using CV + JD + optional tone (formal/friendly/concise) and company name.
- **Job Sourcing**:
  - Paste a JD URL or raw text → analyze immediately.
  - Search live jobs via the **JSearch API (RapidAPI)** — global coverage of LinkedIn/Indeed/Glassdoor postings; one API key.
- **Application Tracker**: Kanban with stage, company, role, source URL, notes, attached CV version, attached cover letter, applied date, follow-up date.

## UX

- Modern, calm design. Light/dark via existing tokens. Sidebar nav on desktop, bottom tabs on mobile.
- Each job/application page consolidates: JD text, ATS analysis, cover letter, status — one workspace per opportunity.

## Tech

- **Frontend**: TanStack Start routes (`/`, `/cv`, `/match`, `/cover-letter`, `/jobs`, `/applications`). shadcn/ui + Tailwind tokens.
- **Backend**: Lovable Cloud (DB + storage + server functions).
  - Tables: `cv` (single row), `jobs`, `applications`, `analyses`, `cover_letters`.
  - Storage bucket: `cvs` for original files.
  - Server functions:
    - `uploadCv` → parse PDF/DOCX → store text.
    - `analyzeMatch(cvText, jdText)` → Lovable AI structured output (score, matched, missing, tips).
    - `generateCoverLetter(cvText, jdText, tone, company)` → Lovable AI text.
    - `searchJobs(query, location)` → JSearch API proxy.
- **AI**: Lovable AI Gateway, default `google/gemini-3-flash-preview`. Structured output via tool calling for ATS analysis.
- **PDF/DOCX parsing**: `pdf-parse` + `mammoth` inside server functions (Worker-compatible pure JS).
- **Job API**: JSearch on RapidAPI (requires `RAPIDAPI_KEY` secret — I'll request after enabling Cloud).

## Build Order

1. Enable Lovable Cloud, create schema + storage bucket.
2. Build CV upload + parsing.
3. Build Match analyzer page (works as soon as CV exists).
4. Build Cover letter generator.
5. Build Job search (after RapidAPI key).
6. Build Applications Kanban + Dashboard.
7. Polish nav, empty states, mobile layout.

## What I'll Need From You

- Approval to enable Lovable Cloud.
- A **RapidAPI key with JSearch subscribed** (free tier exists) — I'll prompt for it when we reach Step 5. You can also start without it and add later; paste-JD flow works immediately.
