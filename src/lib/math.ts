export type Segment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

const DELIMITERS: { open: string; close: string; display: boolean }[] = [
  { open: "$$", close: "$$", display: true },
  { open: "\\[", close: "\\]", display: true },
  { open: "\\(", close: "\\)", display: false },
  { open: "$", close: "$", display: false },
];

/**
 * Splits text into plain-text and math segments.
 * Supported delimiters: $...$ and \(...\) (inline), $$...$$ and \[...\] (display).
 * Write \$ for a literal dollar sign. An unclosed delimiter is left as plain text.
 */
export function parseMath(input: string): Segment[] {
  const segments: Segment[] = [];
  let text = "";
  let i = 0;

  const flushText = () => {
    if (text) segments.push({ type: "text", value: text });
    text = "";
  };

  outer: while (i < input.length) {
    if (input.startsWith("\\$", i)) {
      text += "$";
      i += 2;
      continue;
    }

    for (const { open, close, display } of DELIMITERS) {
      if (!input.startsWith(open, i)) continue;

      // Find the closing delimiter, skipping escaped dollar signs inside math.
      let j = i + open.length;
      while (j < input.length) {
        if (close === "$" && input.startsWith("\\$", j)) {
          j += 2;
          continue;
        }
        if (input.startsWith(close, j)) break;
        j++;
      }

      const body = input.slice(i + open.length, j);
      if (j < input.length && body.trim()) {
        flushText();
        segments.push({ type: "math", value: body, display });
        i = j + close.length;
        continue outer;
      }
    }

    text += input[i];
    i++;
  }

  flushText();
  return segments;
}
