import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import { Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseMath } from "@/lib/math";
import "katex/dist/katex.min.css"; // provides the KaTeX fonts MathLive reuses

/**
 * A text editor where plain text and live math can be mixed, Desmos-style.
 *
 * Typing `$` (or clicking the Σ button) inserts a math box. Inside it, `1/2` becomes a
 * stacked fraction, `^` an exponent, `sqrt` a root, `pi` π, `<=` ≤, and so on.
 * Press → at the end, Enter, Esc, or `$` to go back to typing text.
 *
 * The value is stored as plain text with `$...$` around math, the same format MathText renders.
 */

// Load MathLive only when an editor is shown, so the student pages stay light.
let mathliveReady: Promise<void> | null = null;
function loadMathLive() {
  if (!mathliveReady) {
    mathliveReady = import("mathlive").then(({ MathfieldElement }) => {
      MathfieldElement.fontsDirectory = null; // KaTeX fonts come from katex.min.css
      MathfieldElement.soundsDirectory = null;
    });
  }
  return mathliveReady;
}

// Zero-width space: gives the caret somewhere to sit next to a math box. Stripped on save.
const ZWSP = String.fromCharCode(0x200b);

const isIsland = (n: Node | null): boolean =>
  n instanceof HTMLElement && n.dataset.mathIsland === "true";

function getField(island: HTMLElement) {
  return island.querySelector("math-field") as MathfieldElement;
}

/** Converts the editor DOM back into `text with $math$`. */
function serialize(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node, isFirstChild: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? "").split(ZWSP).join("").replace(/\$/g, "\\$");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (isIsland(node)) {
      const latex = getField(node).getValue("latex-without-placeholders").trim();
      if (latex) {
        const d = node.dataset.display === "true" ? "$$" : "$";
        out += `${d}${latex}${d}`;
      }
      return;
    }
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }
    // Browsers sometimes wrap new lines in <div>s.
    if ((node.tagName === "DIV" || node.tagName === "P") && !isFirstChild) out += "\n";
    node.childNodes.forEach((c, i) => walk(c, i === 0));
  };
  root.childNodes.forEach((c, i) => walk(c, i === 0));
  // A trailing <br> is only there so the browser shows an empty last line.
  return out.replace(/\n$/, "");
}

function placeCaret(node: Node, after: boolean) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (after) range.setStartAfter(node);
  else range.setStartBefore(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

interface MathEditorProps {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function MathEditor({ value, onChange, multiline = false, placeholder, className, id }: MathEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [ready, setReady] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!value);
  // Math boxes keep listeners from the render that created them, so read onChange via a ref.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    loadMathLive().then(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const emit = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = serialize(editor);
    lastEmitted.current = next;
    setIsEmpty(next === "" && !editor.querySelector("[data-math-island]"));
    onChangeRef.current(next);
  };

  const exitIsland = (island: HTMLElement, direction: "forward" | "backward") => {
    const field = getField(island);
    field.blur();
    if (!field.getValue().trim()) {
      // Leaving an empty math box removes it.
      const prev = island.previousSibling;
      island.remove();
      editorRef.current?.focus();
      if (prev) placeCaret(prev, true);
      emit();
      return;
    }
    editorRef.current?.focus();
    if (direction === "forward") {
      let next = island.nextSibling;
      if (!(next && next.nodeType === Node.TEXT_NODE)) {
        next = document.createTextNode(ZWSP);
        island.after(next);
      }
      const sel = window.getSelection();
      const range = document.createRange();
      const text = next.textContent ?? "";
      range.setStart(next, text.startsWith(ZWSP) ? 1 : 0);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      placeCaret(island, false);
    }
  };

  const createIsland = (latex: string, display = false): HTMLElement => {
    const island = document.createElement("span");
    island.dataset.mathIsland = "true";
    if (display) island.dataset.display = "true";
    island.contentEditable = "false";
    island.className = "math-island";

    const field = document.createElement("math-field") as MathfieldElement;
    // Properties like menuItems throw until the field is attached, so use the initial
    // content + attributes here and finish configuring on "mount".
    field.textContent = latex;
    field.setAttribute("math-virtual-keyboard-policy", "manual");
    field.addEventListener("mount", () => {
      field.menuItems = [];
    });
    field.addEventListener("input", emit);
    field.addEventListener("move-out", (e) => {
      const dir = (e as CustomEvent<{ direction: string }>).detail.direction;
      exitIsland(island, dir === "backward" || dir === "upward" ? "backward" : "forward");
    });
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === "$") {
        e.preventDefault();
        e.stopPropagation();
        exitIsland(island, "forward");
      }
    });
    field.addEventListener("focusout", () => {
      // Clicking elsewhere also removes an empty box.
      setTimeout(() => {
        if (island.isConnected && !field.getValue().trim() && document.activeElement !== field) {
          island.remove();
          emit();
        }
      });
    });
    island.appendChild(field);
    return island;
  };

  /** Builds the editor DOM from a stored value. */
  const render = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.replaceChildren();
    for (const seg of parseMath(text)) {
      if (seg.type === "math") {
        editor.append(createIsland(seg.value, seg.display), document.createTextNode(ZWSP));
      } else {
        seg.value.split("\n").forEach((line, i) => {
          if (i > 0) editor.append(document.createElement("br"));
          if (line) editor.append(document.createTextNode(line));
        });
      }
    }
    if (text.endsWith("\n")) editor.append(document.createElement("br"));
    lastEmitted.current = text;
    setIsEmpty(!text);
  };

  // Rebuild only when the value changes from outside (loading a problem, resetting the form).
  useEffect(() => {
    if (ready && value !== lastEmitted.current) render(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ready]);

  const rememberSelection = () => {
    const sel = window.getSelection();
    const editor = editorRef.current;
    if (sel && sel.rangeCount && editor?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const insertMath = (latex = "") => {
    const editor = editorRef.current;
    if (!editor || !ready) return;
    let range = savedRange.current;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) range = sel.getRangeAt(0);
    if (!range || !editor.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    const island = createIsland(latex);
    const after = document.createTextNode(ZWSP);
    range.insertNode(after);
    range.insertNode(island);
    setIsEmpty(false);
    const field = getField(island);
    field.focus();
    if (document.activeElement !== field) requestAnimationFrame(() => field.focus());
  };

  /**
   * Desmos-style auto-conversion while typing plain text:
   *   "12" then "/"  -> fraction 12/▢ with the caret in the denominator
   *   "x" or "3" then "^" -> exponent with the caret in the superscript
   * Only bare numbers (and single letters for ^) convert, so "and/or" stays text.
   */
  const tryAutoConvert = (typed: string): boolean => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    const before = (node.textContent ?? "").slice(0, sel.anchorOffset).split(ZWSP).join("");
    const pattern = typed === "/" ? /(?:^|[^\w.])(\d+(?:\.\d+)?)$/ : /(?:^|[^\w.])(\d+(?:\.\d+)?|[a-zA-Z])$/;
    const match = before.match(pattern);
    if (!match) return false;

    const token = match[1];
    const text = node.textContent ?? "";
    const end = sel.anchorOffset;
    // Find where the token starts in the raw text (it may contain ZWSPs before it).
    const start = text.lastIndexOf(token, end - token.length);
    if (start < 0) return false;

    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    range.deleteContents();
    const island = createIsland("");
    const after = document.createTextNode(ZWSP);
    range.insertNode(after);
    range.insertNode(island);
    setIsEmpty(false);
    const latex = typed === "/" ? `\\frac{${token}}{#?}` : `${token}^{#?}`;
    // Move focus right away so the very next keystroke lands in the math box.
    const field = getField(island);
    const fill = () => {
      field.focus();
      field.insert(latex, { selectionMode: "placeholder", format: "latex" });
      emit();
    };
    try {
      fill();
    } catch {
      requestAnimationFrame(fill); // not mounted yet
    }
    return true;
  };

  // beforeinput fires for every kind of typing (keyboard, IME, mobile), unlike keydown.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const onBeforeInput = (e: InputEvent) => {
      if ((e.target as HTMLElement).tagName === "MATH-FIELD") return;
      if (e.inputType !== "insertText" || !e.data) return;
      if (e.data === "$") {
        e.preventDefault();
        insertMath();
      } else if ((e.data === "/" || e.data === "^") && tryAutoConvert(e.data)) {
        e.preventDefault();
      }
    };
    editor.addEventListener("beforeinput", onBeforeInput);
    return () => editor.removeEventListener("beforeinput", onBeforeInput);
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "MATH-FIELD") return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (multiline) document.execCommand("insertLineBreak");
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "MATH-FIELD") return;
    e.preventDefault();
    let text = e.clipboardData.getData("text/plain");
    if (!multiline) text = text.replace(/\s*\n\s*/g, " ");
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    // Pasted LaTeX like "$\frac{1}{2}$" becomes live math.
    const frag = document.createDocumentFragment();
    for (const seg of parseMath(text)) {
      if (seg.type === "math") {
        frag.append(createIsland(seg.value, seg.display), document.createTextNode(ZWSP));
      } else {
        seg.value.split("\n").forEach((line, i) => {
          if (i > 0) frag.append(document.createElement("br"));
          if (line) frag.append(document.createTextNode(line));
        });
      }
    }
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) placeCaret(last, true);
    emit();
  };

  return (
    <div className="relative">
      <div
        id={id}
        ref={editorRef}
        contentEditable={ready}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={multiline}
        onInput={emit}
        onKeyDown={handleKeyDown}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onBlur={rememberSelection}
        onPaste={handlePaste}
        className={cn(
          "math-editor w-full rounded-md border border-input bg-background px-3 py-2 pr-11 text-sm ring-offset-background",
          "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          "whitespace-pre-wrap break-words",
          multiline ? "min-h-[100px]" : "min-h-10",
          !ready && "opacity-60",
          className
        )}
      />
      {isEmpty && placeholder && (
        <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">{placeholder}</div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Insert math (or type $)"
        className="absolute right-1 top-1 h-8 w-8"
        onMouseDown={(e) => e.preventDefault()} // keep the caret where it is
        onClick={() => insertMath()}
        disabled={!ready}
      >
        <Sigma className="h-4 w-4" />
      </Button>
    </div>
  );
}
