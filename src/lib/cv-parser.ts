// Client-side CV parser. PDF via pdfjs, DOCX via mammoth.
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth/mammoth.browser";

(pdfjs as any).GlobalWorkerOptions.workerSrc = pdfWorker;

export async function parseCvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map((it: any) => it.str).join(" ") + "\n\n";
    }
    return out.trim();
  }
  if (name.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return new TextDecoder().decode(buf);
  }
  throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.");
}
