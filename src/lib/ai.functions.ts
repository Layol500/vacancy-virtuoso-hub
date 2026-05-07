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

export const searchJobs = createServerFn({ method: "POST" })
  .inputValidator((d: { query: string; location?: string; page?: number }) =>
    z
      .object({
        query: z.string().min(1).max(200),
        location: z.string().max(120).optional(),
        page: z.number().int().min(1).max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) {
      return { jobs: [], error: "Job search is not configured. Add a RapidAPI key with JSearch subscribed." };
    }
    const q = encodeURIComponent(`${data.query}${data.location ? " in " + data.location : ""}`);
    const url = `https://jsearch.p.rapidapi.com/search?query=${q}&page=${data.page || 1}&num_pages=1`;
    try {
      const r = await fetch(url, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
      });
      if (!r.ok) {
        const t = await r.text();
        return { jobs: [], error: `JSearch error ${r.status}: ${t.slice(0, 200)}` };
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
      return { jobs, error: null as string | null };
    } catch (e: any) {
      return { jobs: [], error: e?.message || "Search failed" };
    }
  });
