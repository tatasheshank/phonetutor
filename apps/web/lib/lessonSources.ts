import "server-only";

/**
 * Reads an admin's source file into plain text for the lesson generator.
 * Supported now: PDF (text layer), DOCX, TXT, MD. Images and videos need an image-reading
 * model, which isn't set up (Sarvam's chat API is text-only).
 */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** About 15-20 pages of text. Longer sources should be split into several lessons. */
export const MAX_SOURCE_CHARS = 40_000;

export type SourceKind = "pdf" | "docx" | "text";

export interface SourceText {
  kind: SourceKind;
  fileName: string;
  text: string;
  /** Problems the admin should know about (shown in the preview). */
  warnings: string[];
}

export class SourceError extends Error {}

export function sourceKind(fileName: string, mime: string): SourceKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (name.endsWith(".docx") || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (/\.(txt|md|markdown)$/.test(name) || mime.startsWith("text/")) return "text";
  return null;
}

export async function readSource(fileName: string, mime: string, data: Uint8Array): Promise<SourceText> {
  if (data.byteLength > MAX_SOURCE_BYTES) throw new SourceError("File is larger than 10 MB.");
  const kind = sourceKind(fileName, mime);
  if (!kind) {
    if (/^(image|video)\//.test(mime) || /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i.test(fileName)) {
      throw new SourceError("Screenshots and videos aren't supported yet: they need an image-reading AI model. Use a PDF, Word or text file.");
    }
    throw new SourceError("Unsupported file type. Use a PDF, Word (.docx), .txt or .md file.");
  }

  const warnings: string[] = [];
  let text = "";
  if (kind === "text") {
    text = new TextDecoder("utf-8").decode(data);
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    text = result.value;
    if (result.messages.some((m) => m.type === "error")) warnings.push("Some parts of the Word file could not be read.");
  } else {
    // PDF.js needs the global `Iterator` (Node 22+). Polyfill it on older Node (20 is end-of-life).
    if (!("Iterator" in globalThis)) await import("core-js/actual/iterator");
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const result = await extractText(pdf, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    if (text.replace(/\s/g, "").length < 40 && result.totalPages > 0) {
      throw new SourceError(
        "This PDF has no readable text (it may be scanned pictures). Scanned PDFs need an image-reading model; use a text PDF or a Word file.",
      );
    }
  }

  text = normalizeText(text);
  if (!text) throw new SourceError("The file is empty.");
  if (text.length > MAX_SOURCE_CHARS) {
    warnings.push(
      `The file is long (${text.length.toLocaleString("en-IN")} characters); only the first ${MAX_SOURCE_CHARS.toLocaleString("en-IN")} were used. Split long guides into several lessons.`,
    );
    text = text.slice(0, MAX_SOURCE_CHARS);
  }
  return { kind, fileName, text, warnings };
}

/** Collapse runs of blank lines and spaces; keep line breaks (they often mark steps). */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
