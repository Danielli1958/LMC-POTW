import { Fragment, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { parseMath } from "@/lib/math";

function renderMath(tex: string, display: boolean): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false, // show invalid LaTeX in red instead of crashing
    strict: "ignore",
    trust: false,
    // Commands the admin's MathLive editor can produce that KaTeX doesn't know.
    macros: {
      "\\placeholder": "",
      "\\exponentialE": "e",
      "\\differentialD": "\\mathrm{d}",
      "\\capitalDifferentialD": "\\mathrm{D}",
      "\\imaginaryI": "i",
      "\\imaginaryJ": "j",
    },
  });
}

interface MathTextProps {
  text: string | null | undefined;
  className?: string;
  as?: "div" | "span";
}

/** Renders text that may contain LaTeX math, preserving line breaks. */
export function MathText({ text, className, as = "span" }: MathTextProps) {
  const segments = useMemo(() => parseMath(text ?? ""), [text]);
  const Tag = as;

  return (
    <Tag className={cn("whitespace-pre-wrap", className)}>
      {segments.map((seg, idx) =>
        seg.type === "text" ? (
          <Fragment key={idx}>{seg.value}</Fragment>
        ) : (
          <span
            key={idx}
            className={seg.display ? "block overflow-x-auto overflow-y-hidden" : undefined}
            // KaTeX escapes its input and trust is disabled, so this output is safe.
            dangerouslySetInnerHTML={{ __html: renderMath(seg.value, seg.display) }}
          />
        )
      )}
    </Tag>
  );
}
