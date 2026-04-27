import { useMemo, useRef } from "react";

import { cn } from "@/lib/utils.js";
import { isJsonText } from "@/lib/formatters.js";

const tokenPattern = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|[{}\[\],:])/g;
const graphqlKeywords = new Set([
  "query",
  "mutation",
  "subscription",
  "fragment",
  "on",
  "true",
  "false",
  "null",
  "schema",
  "scalar",
  "type",
  "interface",
  "union",
  "enum",
  "input",
  "directive",
  "extend",
  "implements"
]);
const graphqlTokenPattern = /"""[\s\S]*?"""|"(?:\\.|[^"])*"|#[^\n]*|\.\.\.|@[A-Za-z_][A-Za-z0-9_]*|\$[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[!():=@\[\]{|},]/g;
const javascriptKeywords = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "await",
  "async",
  "try",
  "catch",
  "throw",
  "new",
  "true",
  "false",
  "null",
  "undefined"
]);
const javascriptTokenPattern = /\/\/[^\n]*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*\b|[{}()[\].,;:+\-*/%!=<>|&?]/g;

function tokenClassName(token) {
  if (/^".*":$/.test(token)) {
    return "json-key";
  }

  if (/^"/.test(token)) {
    return "json-string";
  }

  if (/^(true|false)$/.test(token)) {
    return "json-boolean";
  }

  if (token === "null") {
    return "json-null";
  }

  if (/^-?\d/.test(token)) {
    return "json-number";
  }

  return "json-punctuation";
}

function renderHighlightedJson(text) {
  const content = text || "";
  const nodes = [];
  let lastIndex = 0;
  let match;

  tokenPattern.lastIndex = 0;

  while ((match = tokenPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];
    nodes.push(
      <span key={`${match.index}-${token}`} className={tokenClassName(token)}>
        {token}
      </span>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

function javascriptTokenClassName(token) {
  if (token.startsWith("//")) {
    return "script-comment";
  }

  if (/^"|^'|^`/.test(token)) {
    return "script-string";
  }

  if (/^\d/.test(token)) {
    return "script-number";
  }

  if (javascriptKeywords.has(token)) {
    return "script-keyword";
  }

  if (/^(kivo|JSON|Math|Date|Object|Array|String|Number|Boolean|Promise)$/.test(token)) {
    return "script-builtin";
  }

  if (/^[{}()[\].,;:+\-*/%!=<>|&?]$/.test(token)) {
    return "script-punctuation";
  }

  return "script-identifier";
}

function renderHighlightedJavascript(text) {
  const content = text || "";
  const nodes = [];
  let lastIndex = 0;
  let match;

  javascriptTokenPattern.lastIndex = 0;

  while ((match = javascriptTokenPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];
    nodes.push(
      <span key={`${match.index}-${token}`} className={javascriptTokenClassName(token)}>
        {token}
      </span>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

function getLineCount(text) {
  const source = String(text ?? "");
  return Math.max(1, source.split("\n").length);
}

function graphqlTokenClassName(token) {
  if (token.startsWith("#")) {
    return "graphql-comment";
  }

  if (token.startsWith('"')) {
    return "graphql-string";
  }

  if (token.startsWith("$")) {
    return "graphql-variable";
  }

  if (token.startsWith("@")) {
    return "graphql-directive";
  }

  if (/^-?\d/.test(token)) {
    return "graphql-number";
  }

  if (graphqlKeywords.has(token)) {
    return "graphql-keyword";
  }

  if (/^\.{3}$|^[!():=@\[\]{|},]$/.test(token)) {
    return "graphql-punctuation";
  }

  return "graphql-field";
}

function renderHighlightedGraphql(text) {
  const content = text || "";
  const nodes = [];
  let lastIndex = 0;
  let match;

  graphqlTokenPattern.lastIndex = 0;

  while ((match = graphqlTokenPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];
    nodes.push(
      <span key={`${match.index}-${token}`} className={graphqlTokenClassName(token)}>
        {token}
      </span>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

export function CodeEditor({
  value,
  onChange,
  placeholder,
  readOnly = false,
  language = "text",
  disabled = false,
  wrapLines = false,
  className,
  lineNumbers = false
}) {
  const highlightRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const isJson = language === "json" && isJsonText(value);
  const isGraphql = language === "graphql";
  const isJavascript = language === "javascript" || language === "js";
  const useOverlay = !readOnly && (language === "json" || language === "graphql" || isJavascript);
  const displayValue = useMemo(() => value || "", [value]);
  const totalLines = useMemo(() => getLineCount(displayValue), [displayValue]);

  function syncScroll(event) {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = event.target.scrollTop;
      highlightRef.current.scrollLeft = event.target.scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = event.target.scrollTop;
    }
  }

  const lineNumbersColumn = lineNumbers ? (
    <pre
      ref={lineNumbersRef}
      aria-hidden="true"
      className="editor-overlay-scroll-hidden pointer-events-none h-full overflow-hidden border-r border-border/30 bg-muted/20 px-2 py-3 text-right font-mono text-[11px] leading-6 text-muted-foreground/70"
    >
      <code>
        {Array.from({ length: totalLines }, (_, index) => (
          <span key={`line-${index + 1}`} className="block">
            {index + 1}
          </span>
        ))}
      </code>
    </pre>
  ) : null;

  if (readOnly) {
    return (
      <div className={cn("relative grid h-full min-h-0 overflow-hidden bg-transparent", lineNumbers ? "grid-cols-[48px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]", className)}>
        {lineNumbersColumn}
        <pre
          className={cn(
            "thin-scrollbar h-full px-4 py-3 font-mono text-[12px] leading-6 text-foreground",
            lineNumbers ? "col-start-2" : "",
            wrapLines ? "overflow-y-auto overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere]" : "overflow-auto"
          )}
        >
          <code>
            {language === "json" && isJson
              ? renderHighlightedJson(displayValue)
              : isGraphql
                ? renderHighlightedGraphql(displayValue)
                : isJavascript
                  ? renderHighlightedJavascript(displayValue)
                : displayValue}
          </code>
        </pre>
      </div>
    );
  }

  if (!useOverlay) {
    return (
      <div className={cn("relative grid h-full min-h-0 overflow-hidden bg-transparent", lineNumbers ? "grid-cols-[48px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]", className)}>
        {lineNumbersColumn}
        <textarea
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onScroll={syncScroll}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          className="thin-scrollbar h-full w-full resize-none overflow-auto border-0 bg-transparent px-4 py-3 font-mono text-[12px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    );
  }

  return (
    <div className={cn("relative grid h-full min-h-0 overflow-hidden bg-transparent", lineNumbers ? "grid-cols-[48px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]", className)}>
      {lineNumbersColumn}
      <pre
        ref={highlightRef}
        aria-hidden="true"
        className="editor-overlay-scroll-hidden pointer-events-none col-start-2 row-start-1 h-full overflow-auto px-4 py-3 font-mono text-[12px] leading-6 text-foreground"
      >
        <code>
          {displayValue
            ? isJson
              ? renderHighlightedJson(displayValue)
              : isGraphql
                ? renderHighlightedGraphql(displayValue)
                : isJavascript
                  ? renderHighlightedJavascript(displayValue)
                : displayValue
            : " "}
        </code>
      </pre>
      <textarea
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        className="thin-scrollbar col-start-2 row-start-1 h-full w-full resize-none overflow-auto border-0 bg-transparent px-4 py-3 font-mono text-[12px] leading-6 text-transparent caret-foreground outline-none placeholder:text-muted-foreground/0 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {!value ? <div className={cn("pointer-events-none col-start-2 row-start-1 pt-3 font-mono text-[12px] text-muted-foreground/60", lineNumbers ? "pl-4" : "pl-4")}>{placeholder}</div> : null}
    </div>
  );
}
