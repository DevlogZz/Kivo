import { useState, useEffect, memo } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

function HighlightedText({ text, query }) {
  if (!query) return <span>{text}</span>;
  const str = String(text);
  const lowerStr = str.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const parts = [];
  let lastIndex = 0;
  let index = lowerStr.indexOf(lowerQuery);

  if (index === -1) return <span>{text}</span>;

  while (index !== -1) {
    if (index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{str.slice(lastIndex, index)}</span>);
    }
    parts.push(
      <mark key={`mark-${index}`} className="bg-yellow-500/40 text-foreground rounded-sm px-0.5">
        {str.slice(index, index + query.length)}
      </mark>
    );
    lastIndex = index + query.length;
    index = lowerStr.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < str.length) {
    parts.push(<span key={`text-${lastIndex}`}>{str.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    const textToCopy = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-muted-foreground hover:text-foreground focus:outline-none"
      title="Copy value"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function JsonValue({ value, searchQuery }) {
  const type = typeof value;

  if (value === null) {
    return <span className="json-null font-mono"><HighlightedText text="null" query={searchQuery} /></span>;
  }

  if (type === "string") {
    return <span className="json-string font-mono font-medium">"<HighlightedText text={value} query={searchQuery} />"</span>;
  }

  if (type === "number") {
    return <span className="json-number font-mono font-medium"><HighlightedText text={value} query={searchQuery} /></span>;
  }

  if (type === "boolean") {
    return <span className="json-boolean font-mono font-medium"><HighlightedText text={value ? "true" : "false"} query={searchQuery} /></span>;
  }

  return <span className="text-foreground font-mono"><HighlightedText text={String(value)} query={searchQuery} /></span>;
}

export const JsonTree = memo(function JsonTree({ data, name, depth = 0, isLast = true, searchQuery = "" }) {
  const isSearchActive = searchQuery.length > 0;
  const [expanded, setExpanded] = useState(isSearchActive || depth < 2);
  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    if (isSearchActive) {
      setExpanded(true);
    } else {
      setExpanded(depth < 2);
    }
  }, [isSearchActive, depth]);

  const isArray = Array.isArray(data);
  const isObject = data !== null && typeof data === "object";

  if (!isObject) {
    return (
      <div className="group flex items-center gap-1.5 font-mono text-[13px] leading-relaxed py-0.5 w-max pr-4">
        {name && <span className="json-key">"<HighlightedText text={name} query={searchQuery} />":</span>}
        <JsonValue value={data} searchQuery={searchQuery} />
        {!isLast && <span className="json-punctuation">,</span>}
        <CopyButton value={data} />
      </div>
    );
  }

  const keys = Object.keys(data);
  const isEmpty = keys.length === 0;

  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  if (isEmpty) {
    return (
      <div className="group flex items-center gap-1.5 font-mono text-[13px] leading-relaxed py-0.5 w-max pr-4">
        {name && <span className="json-key">"<HighlightedText text={name} query={searchQuery} />":</span>}
        <span className="json-punctuation">{bracketOpen}{bracketClose}</span>
        {!isLast && <span className="json-punctuation">,</span>}
        <CopyButton value={data} />
      </div>
    );
  }

  const showCount = Math.min(visibleCount, keys.length);
  const hasMore = keys.length > showCount;
  const remaining = keys.length - showCount;

  return (
    <div className="flex flex-col font-mono text-[13px] leading-relaxed">
      <div
        className={cn(
          "group flex items-center gap-1.5 cursor-pointer hover:bg-accent/30 py-0.5 px-1 rounded transition-colors w-max pr-4",
          depth > 0 ? "-ml-4" : ""
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex h-3 w-3 items-center justify-center text-muted-foreground shrink-0">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </div>
        {name && <span className="json-key">"<HighlightedText text={name} query={searchQuery} />":</span>}
        <span className="json-punctuation">{bracketOpen}</span>
        {!expanded && (
          <span className="text-muted-foreground italic text-[11px] ml-1">
            {isArray ? `${keys.length} items` : `${keys.length} keys`}
          </span>
        )}
        {!expanded && <span className="json-punctuation ml-1">{bracketClose}{!isLast && ","}</span>}
        <CopyButton value={data} />
      </div>

      {expanded && (
        <div className="flex flex-col border-l border-border/20 ml-[5px] pl-4">
          {keys.slice(0, showCount).map((key, index) => (
            <JsonTree
              key={key}
              name={isArray ? null : key}
              data={data[key]}
              depth={depth + 1}
              isLast={!hasMore && index === showCount - 1}
              searchQuery={searchQuery}
            />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + 100)}
              className="flex items-center gap-1.5 py-1.5 px-2 my-1 text-[11px] text-primary/80 hover:text-primary hover:bg-primary/5 rounded transition-colors cursor-pointer w-max"
            >
              ▼ Show {Math.min(remaining, 100)} more ({remaining} remaining)
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="json-punctuation py-0.5">
          {bracketClose}
          {!isLast && <span className="json-punctuation">,</span>}
        </div>
      )}
    </div>
  );
});
