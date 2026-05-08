import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAI(body: any) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429) throw new Error("Rate limit reached. Try again shortly.");
    if (r.status === 402) throw new Error("AI credits exhausted. Add funds in Workspace settings.");
    throw new Error(`AI error ${r.status}: ${t}`);
  }
  return r.json();
}

export const analyzeMatch = createServerFn({ method: "POST" })
  .inputValidator((d: { cv: string; jd: string }) =>
    z.object({ cv: z.string().min(20).max(50000), jd: z.string().min(20).max(50000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const result = await callAI({
      messages: [
        {
          role: "system",
          content:
            "You are an ATS resume analyzer. Compare the CV to the job description and return structured analysis. Be specific, concise, and actionable.",
        },
        {
          role: "user",
          content: `JOB DESCRIPTION:\n${data.jd}\n\nCV:\n${data.cv}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_match",
            description: "Report ATS match analysis",
            parameters: {
              type: "object",
              properties: {
                score: { type: "integer", minimum: 0, maximum: 100 },
                summary: { type: "string" },
                matched_keywords: { type: "array", items: { type: "string" } },
                missing_keywords: { type: "array", items: { type: "string" } },
                strengths: { type: "array", items: { type: "string" } },
                suggestions: { type: "array", items: { type: "string" } },
              },
              required: ["score", "summary", "matched_keywords", "missing_keywords", "strengths", "suggestions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_match" } },
    });
    const args = result.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no analysis");
    return JSON.parse(args);
  });

export const generateCoverLetter = createServerFn({ method: "POST" })
  .inputValidator((d: { cv: string; jd: string; tone?: string; company?: string; role?: string }) =>
    z
      .object({
        cv: z.string().min(20).max(50000),
        jd: z.string().min(20).max(50000),
        tone: z.string().max(40).optional(),
        company: z.string().max(120).optional(),
        role: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const tone = data.tone || "professional";
    const result = await callAI({
      messages: [
        {
          role: "system",
          content: `You write tailored cover letters. Tone: ${tone}. 3-4 short paragraphs. No placeholders like [Your Name] — leave the signature blank. Reference specific JD requirements with concrete CV evidence.`,
        },
        {
          role: "user",
          content: `Company: ${data.company || "the company"}\nRole: ${data.role || "the role"}\n\nJOB DESCRIPTION:\n${data.jd}\n\nCV:\n${data.cv}\n\nWrite the cover letter.`,
        },
      ],
    });
    const text = result.choices?.[0]?.message?.content;
    if (!text) throw new Error("AI returned empty letter");
    return { content: text as string };
  });

const SENIORITY = ["no_experience", "under_3_years_experience", "more_than_3_years_experience", "no_degree"] as const;
const EMPLOYMENT = ["FULLTIME", "PARTTIME", "CONTRACTOR", "INTERN"] as const;

const COUNTRY_MAP: Record<string, string> = {
  "uk": "gb", "u.k.": "gb", "u.k": "gb",
  "united kingdom": "gb", "great britain": "gb", "britain": "gb", "england": "gb",
  "scotland": "gb", "wales": "gb", "northern ireland": "gb",
  "usa": "us", "u.s.": "us", "u.s.a.": "us", "united states": "us", "america": "us",
  "uae": "ae", "united arab emirates": "ae",
};

function detectCountry(loc?: string): string | null {
  if (!loc) return null;
  const l = loc.toLowerCase().trim();
  for (const k of Object.keys(COUNTRY_MAP)) {
    if (l === k || l.endsWith(", " + k) || l.endsWith(" " + k)) return COUNTRY_MAP[k];
  }
  return null;
}

export const searchJobs = createServerFn({ method: "POST" })
  .inputValidator((d: {
    query: string;
    location?: string;
    page?: number;
    seniority?: string;
    employmentType?: string;
    remoteOnly?: boolean;
  }) =>
    z
      .object({
        query: z.string().min(1).max(200),
        location: z.string().max(120).optional(),
        page: z.number().int().min(1).max(20).optional(),
        seniority: z.enum(SENIORITY).optional(),
        employmentType: z.enum(EMPLOYMENT).optional(),
        remoteOnly: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) {
      return { jobs: [], error: "Job search is not configured. Add a RapidAPI key with JSearch subscribed.", page: data.page || 1 };
    }
    const country = detectCountry(data.location);
    const q = encodeURIComponent(`${data.query}${data.location ? " in " + data.location : ""}`);
    let url = `https://jsearch.p.rapidapi.com/search?query=${q}&page=${data.page || 1}&num_pages=1`;
    if (country) url += `&country=${country}`;
    if (data.seniority) url += `&job_requirements=${data.seniority}`;
    if (data.employmentType) url += `&employment_types=${data.employmentType}`;
    if (data.remoteOnly) url += `&remote_jobs_only=true`;
    try {
      const r = await fetch(url, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
      });
      if (!r.ok) {
        const t = await r.text();
        return { jobs: [], error: `JSearch error ${r.status}: ${t.slice(0, 200)}`, page: data.page || 1 };
      }
      const json: any = await r.json();
      const jobs = (json.data || []).map((j: any) => ({
        external_id: j.job_id,
        title: j.job_title,
        company: j.employer_name,
        location:
          [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") ||
          (j.job_is_remote ? "Remote" : ""),
        source_url: j.job_apply_link || j.job_google_link,
        description: j.job_description || "",
      }));
      return { jobs, error: null as string | null, page: data.page || 1 };
    } catch (e: any) {
      return { jobs: [], error: e?.message || "Search failed", page: data.page || 1 };
    }
  });
