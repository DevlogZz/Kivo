import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

function renderHighlighted(text, envVars) {
  if (!text) return null;

  const parts = [];
  let lastIndex = 0;
  const regex = /\{\{([^}]*)\}\}/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>
      );
    }

    const varName = match[1].trim();
    const merged = envVars?.merged ?? {};
    const isResolved = varName in merged;

    parts.push(
      <span
        key={`v-${match.index}`}
        className={cn(
          "rounded-sm font-semibold",
          isResolved
            ? "text-emerald-400"
            : "text-amber-400"
        )}
        style={{
          boxShadow: isResolved
            ? "0 0 0 2px rgba(52,211,153,0.10), inset 0 0 0 12px rgba(52,211,153,0.10)"
            : "0 0 0 2px rgba(251,191,36,0.10), inset 0 0 0 12px rgba(251,191,36,0.10)"
        }}
      >
        {match[0]}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : text;
}

export function EnvHighlightInput({
  value = "",
  onChange,
  onValueChange,
  placeholder,
  type = "text",
  className,
  envVars,
  inputClassName,
  ...props
}) {
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const isPassword = type === "password";

  const hasVars = useMemo(() => value?.includes("{{") && value?.includes("}}"), [value]);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [suggestionFilter, setSuggestionFilter] = useState("");

  const allEnvKeys = useMemo(() => {
    const merged = envVars?.merged ?? {};
    return Object.keys(merged);
  }, [envVars]);

  const filteredKeys = useMemo(() => {
    if (!suggestionFilter) return allEnvKeys;
    const lower = suggestionFilter.toLowerCase();
    return allEnvKeys.filter((k) => k.toLowerCase().includes(lower));
  }, [allEnvKeys, suggestionFilter]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filteredKeys.length, suggestionFilter]);

  const fireChange = useCallback(
    (newValue) => {
      if (onValueChange) {
        onValueChange(newValue);
      }
      const finalOnChange = onChange || props.onChange;
      if (finalOnChange) {
        const syntheticEvent = {
          target: { value: newValue, name: props.name },
          currentTarget: { value: newValue, name: props.name },
          preventDefault: () => { },
          stopPropagation: () => { }
        };
        finalOnChange(syntheticEvent);
      }
    },
    [onChange, onValueChange, props.onChange, props.name]
  );

  const insertSuggestion = useCallback(
    (key) => {
      const input = inputRef.current;
      if (!input) return;

      const cursorPos = input.selectionStart ?? value.length;
      const before = value.slice(0, cursorPos);
      const openIdx = before.lastIndexOf("{{");

      if (openIdx === -1) return;

      const prefix = value.slice(0, openIdx);
      const suffix = value.slice(cursorPos);
      const newValue = `${prefix}{{${key}}}${suffix}`;

      fireChange(newValue);
      setShowSuggestions(false);

      requestAnimationFrame(() => {
        const newPos = openIdx + key.length + 4;
        input.setSelectionRange(newPos, newPos);
        input.focus();
      });
    },
    [value, fireChange]
  );

  const handleChange = (e) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart ?? newValue.length;
    const before = newValue.slice(0, cursorPos);

    const openIdx = before.lastIndexOf("{{");
    if (openIdx !== -1) {
      const afterOpen = before.slice(openIdx + 2);
      const hasClose = afterOpen.includes("}}");
      if (!hasClose) {
        setSuggestionFilter(afterOpen);
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }

    fireChange(newValue);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || filteredKeys.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => (prev + 1) % filteredKeys.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) =>
        prev <= 0 ? filteredKeys.length - 1 : prev - 1
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertSuggestion(filteredKeys[selectedIdx]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const finalInputClass = cn(
    "flex h-10 w-full border border-border/40 bg-transparent px-2.5 py-2 text-[13px] font-mono outline-none transition-colors",
    "focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20",
    "placeholder:text-muted-foreground/50",
    "[&::-ms-reveal]:hidden [&::-webkit-contacts-auto-fill-button]:hidden [&::-webkit-credentials-auto-fill-button]:hidden",
    hasVars && !isPassword && "text-transparent caret-foreground",
    inputClassName
  );

  return (
    <div className={cn("relative w-full group", className)}>
      <input
        {...props}
        ref={inputRef}
        type={isPassword ? "password" : "text"}
        value={value ?? ""}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={finalInputClass}
        autoComplete="off"
        spellCheck="false"
      />

      {hasVars && !isPassword && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center px-2.5 font-mono overflow-hidden whitespace-nowrap",
            inputClassName
          )}
          aria-hidden="true"
          style={{
            borderWidth: 1,
            borderColor: "transparent",
            paddingTop: 0,
            paddingBottom: 0,
            background: "transparent"
          }}
        >
          {renderHighlighted(value, envVars)}
        </div>
      )}

      {showSuggestions && filteredKeys.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-[calc(100%+2px)] z-[360] min-w-[240px] max-w-full overflow-hidden rounded-md border border-border/40 bg-background/20 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
          style={{ maxHeight: 220, overflowY: "auto" }}
        >
          <div className="flex items-center justify-between border-b border-border/10 bg-transparent px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>Environment Variables</span>
            <span className="opacity-50 font-normal">↑↓ to navigate</span>
          </div>
          {filteredKeys.map((key, idx) => (
            <button
              key={key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertSuggestion(key);
              }}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left text-[12px] font-mono transition-colors border-b border-border/5 last:border-0",
                idx === selectedIdx
                  ? "text-foreground ring-1 ring-inset ring-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0 shadow-sm",
                (envVars?.merged && key in envVars.merged) ? "bg-emerald-500 shadow-emerald-500/20" : "bg-amber-500 shadow-amber-500/20"
              )} />
              <span className="font-bold flex-1 truncate">{key}</span>
              <span className="text-[10px] text-muted-foreground/40 truncate max-w-[100px] italic">
                {envVars?.merged?.[key] ?? "undefined"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
