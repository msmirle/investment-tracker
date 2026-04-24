"use client";
import type { ReactNode } from "react";

// Minimal, safe markdown renderer for headings, lists, bold/italic/code,
// paragraphs. No raw HTML — we only emit plain React nodes.
export function renderMarkdown(src: string): ReactNode {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const sizes = [
        "text-2xl font-bold",
        "text-xl font-semibold mt-4",
        "text-lg font-semibold mt-3",
        "text-base font-semibold mt-3",
        "text-sm font-semibold mt-2",
        "text-sm font-semibold mt-2",
      ];
      blocks.push(
        <div key={key++} className={sizes[level - 1]}>
          {renderInline(text)}
        </div>,
      );
      i++;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-6 space-y-1 my-2">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-6 space-y-1 my-2">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2">
        {renderInline(para.join(" "))}
      </p>,
    );
  }

  return <>{blocks}</>;
}

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] != null) parts.push(<strong key={k++}>{match[1]}</strong>);
    else if (match[2] != null) parts.push(<em key={k++}>{match[2]}</em>);
    else if (match[3] != null)
      parts.push(
        <code key={k++} className="px-1 py-0.5 rounded bg-panel2 text-xs">
          {match[3]}
        </code>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
