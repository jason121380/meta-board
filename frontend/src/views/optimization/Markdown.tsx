import { Fragment } from "react";

/**
 * Tiny markdown renderer for agent advice output. Handles ONLY the
 * subset Gemini reliably produces:
 *
 *   ## h2 / ### h3
 *   - bullet list (or `*` bullet)
 *   1. numbered list
 *   **bold**
 *   `inline code`
 *   blank line → paragraph break
 *
 * No GFM tables, no images, no HTML — agent advice is short prose
 * + bullets and we trust the LLM to stay in this lane via the
 * system prompt. Pulling react-markdown + its remark/rehype tree
 * would add ~60KB of JS for output we render once per page load.
 */
export function Markdown({ children }: { children: string }) {
  const blocks = parseBlocks(children);
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-[1.7] text-ink">
      {blocks.map((b, i) => (
        <BlockNode key={i} block={b} />
      ))}
    </div>
  );
}

type Block =
  | { type: "h2" | "h3" | "p"; text: string }
  | { type: "ul" | "ol"; items: string[] };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw === undefined) {
      i++;
      continue;
    }
    const line = raw.trimEnd();
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4) });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3) });
      i++;
      continue;
    }
    // bullet list — collect contiguous `-` / `*` lines
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (cur === undefined) break;
        const m = cur.match(/^[-*]\s+(.*)$/);
        if (!m) break;
        items.push(m[1] ?? "");
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    // numbered list — collect contiguous `N.` lines
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (cur === undefined) break;
        const m = cur.match(/^\d+\.\s+(.*)$/);
        if (!m) break;
        items.push(m[1] ?? "");
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    // paragraph — keep accumulating until blank line
    const paragraphLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const cur = lines[i];
      if (cur === undefined) break;
      const trimmed = cur.trim();
      if (!trimmed) break;
      if (
        trimmed.startsWith("## ") ||
        trimmed.startsWith("### ") ||
        /^[-*]\s+/.test(trimmed) ||
        /^\d+\.\s+/.test(trimmed)
      ) {
        break;
      }
      paragraphLines.push(trimmed);
      i++;
    }
    blocks.push({ type: "p", text: paragraphLines.join(" ") });
  }
  return blocks;
}

function BlockNode({ block }: { block: Block }) {
  if (block.type === "h2") {
    return <h2 className="text-[14px] font-bold text-ink">{renderInline(block.text)}</h2>;
  }
  if (block.type === "h3") {
    return <h3 className="text-[13px] font-semibold text-ink">{renderInline(block.text)}</h3>;
  }
  if (block.type === "ul") {
    return (
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
        {block.items.map((it, j) => (
          <li key={j}>{renderInline(it)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
        {block.items.map((it, j) => (
          <li key={j}>{renderInline(it)}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "p" || block.type === "h2" || block.type === "h3") {
    return <p className="m-0">{renderInline(block.text)}</p>;
  }
  return null;
}

/** Inline parsing: **bold** and `code`. Keep it simple — agents
 *  rarely use anything more exotic and we'd rather fall back to
 *  literal text than render half-broken markup. */
function renderInline(text: string): React.ReactNode {
  // Split on **bold** and `code` while preserving the markers in
  // capture groups so we can dispatch on them.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p.length > 0);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-bg px-1 font-mono text-[12px]">
          {p.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}
