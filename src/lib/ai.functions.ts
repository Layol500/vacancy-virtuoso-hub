import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAI(body: object) {
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
          content: `You are a senior ATS (Applicant Tracking System) expert and recruiter. Analyze the CV against the job description with precision.

Your analysis must:
1. Extract ALL specific skills, tools, technologies, certifications, and qualifications from the JD
2. Check each one against the CV — mark as matched only if explicitly present
3. Identify critical missing requirements (especially "required" skills vs "nice to have")
4. Score fairly: 0-49 = poor fit, 50-69 = partial fit, 70-84 = good fit, 85-100 = excellent fit
5. Give 3-5 concrete, actionable suggestions (e.g. "Add 'Agile/Scrum' to your skills section — it appears 3 times in the JD")
6. Strengths should reference specific CV sections or achievements that directly address JD requirements`,
        },
        {
          role: "user",
          content: `JOB DESCRIPTION:\n${data.jd}\n\n---\n\nCANDIDATE CV:\n${data.cv}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_match",
            description: "Report detailed ATS match analysis with keyword-level precision",
            parameters: {
              type: "object",
              properties: {
                score: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                  description: "ATS match percentage based on keyword coverage, experience alignment, and qualification match",
                },
                summary: {
                  type: "string",
                  description: "2-3 sentence verdict: overall fit, biggest gap, and key strength",
                },
                matched_keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "Skills, tools, technologies, and qualifications present in BOTH the JD and CV",
                },
                missing_keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "Required or frequently mentioned skills/tools in JD that are absent from CV",
                },
                required_missing: {
                  type: "array",
                  items: { type: "string" },
                  description: "Items explicitly marked as 'required' or 'must have' in JD that are missing from CV",
                },
                strengths: {
                  type: "array",
                  items: { type: "string" },
                  description: "Specific CV achievements or skills that directly address key JD requirements",
                },
                suggestions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Concrete, actionable improvements referencing specific JD terms and CV sections",
                },
                keyword_density: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                  description: "Percentage of JD keywords found in CV (raw keyword coverage score)",
                },
              },
              required: [
                "score",
                "summary",
                "matched_keywords",
                "missing_keywords",
                "required_missing",
                "strengths",
                "suggestions",
                "keyword_density",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_match" } },
    });
    const args = result.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no analysis");
    const parsed = JSON.parse(args);
    return {
      score: parsed.score ?? 0,
      summary: parsed.summary ?? "",
      matched_keywords: parsed.matched_keywords ?? [],
      missing_keywords: parsed.missing_keywords ?? [],
      required_missing: parsed.required_missing ?? [],
      strengths: parsed.strengths ?? [],
      suggestions: parsed.suggestions ?? [],
      keyword_density: parsed.keyword_density ?? 0,
    };
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
          content: `You are an expert cover letter writer. Write a highly tailored cover letter that:

CRITICAL RULES:
- Do NOT simply list or summarise the CV — instead, select 2-3 achievements from the CV that directly match the JD's specific requirements
- Quote or reference specific phrases from the JD (e.g. "your focus on ${data.role ? data.role : "the role"} aligned with...")
- Show WHY this candidate fits THIS specific job at THIS company — not a generic template
- Each paragraph must address a specific requirement from the JD with evidence from the CV
- Never use hollow phrases like "I am a passionate team player" without specific evidence
- No placeholders like [Your Name], [Date], [Address] — leave the closing signature line blank
- Tone: ${tone}
- Length: 3-4 focused paragraphs

STRUCTURE:
1. Opening: Hook that mentions the specific role/company and one standout qualification from the JD
2. Body para 1: Match the JD's primary technical/core requirement with a specific CV achievement (include numbers/results if available)
3. Body para 2: Address a secondary JD requirement with another concrete CV example
4. Closing: Express specific interest in the company's work (based on what the JD reveals), and a clear call to action`,
        },
        {
          role: "user",
          content: `Write a cover letter for this application.

TARGET COMPANY: ${data.company || "the company"}
TARGET ROLE: ${data.role || "the role"}

JOB DESCRIPTION (read carefully — your letter must address its specific requirements):
${data.jd}

CANDIDATE CV (use this as a source of evidence — select the most relevant parts):
${data.cv}

Write the cover letter now. Make it feel written specifically for this job, not a template.`,
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
      const json = await r.json() as { data?: Record<string, unknown>[] };
      const jobs = (json.data || []).map((j) => ({
        external_id: j["job_id"] as string,
        title: j["job_title"] as string,
        company: j["employer_name"] as string,
        location:
          ([j["job_city"], j["job_state"], j["job_country"]].filter(Boolean) as string[]).join(", ") ||
          (j["job_is_remote"] ? "Remote" : ""),
        source_url: (j["job_apply_link"] || j["job_google_link"]) as string,
        description: (j["job_description"] || "") as string,
      }));
      return { jobs, error: null as string | null, page: data.page || 1 };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Search failed";
      return { jobs: [], error: msg, page: data.page || 1 };
    }
  });
