import { useEffect, useRef, useState } from "react";
import { Braces, ChevronDown, Plus, SendHorizontal, Trash2, Wand2 } from "lucide-react";

import { CodeEditor } from "@/components/workspace/CodeEditor.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Card } from "@/components/ui/card.jsx";
import { Input } from "@/components/ui/input.jsx";
import { formatGraphqlText, formatJsonText } from "@/lib/formatters.js";
import { getMethodTone, requestBodyModes } from "@/lib/http-ui.js";
import { cn } from "@/lib/utils.js";

const tabs = ["Params", "Body", "Auth", "Headers", "Docs"];
const requestMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const authModes = [
  { value: "none", label: "No Auth" },
  { value: "bearer", label: "Bearer Token" }
];

function createRow() {
  return { id: `row-${Math.random().toString(36).slice(2, 8)}`, key: "", value: "", enabled: true };
}

function TableEditor({
  rows,
  onChange,
  title,
  addLabel,
  keyLabel = "name",
  valueLabel = "value",
  disabled = false
}) {
  function updateRow(id, field, value) {
    onChange(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    onChange([...rows, createRow()]);
  }

  function removeRow(id) {
    onChange(rows.filter((row) => row.id !== id));
  }

  function clearRows() {
    onChange([createRow()]);
  }

  const activeCount = rows.filter((row) => row.enabled && row.key.trim()).length;

  return (
    <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-background/10">
      <div className="flex items-center justify-between border-b border-border/20 px-3 py-2 text-[11px] text-muted-foreground lg:text-[12px]">
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground">{title}</span>
          <span>{activeCount} active</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            disabled={disabled}
            className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </button>
          <button
            type="button"
            onClick={clearRows}
            disabled={disabled}
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            Delete all
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_36px] border-b border-border/20 px-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground lg:text-[11px]">
        <div className="px-2 py-2"></div>
        <div className="px-2 py-2">{keyLabel}</div>
        <div className="px-2 py-2">{valueLabel}</div>
        <div className="px-2 py-2"></div>
      </div>
      <div className="thin-scrollbar min-h-0 overflow-auto">
        {rows.map((row, index) => (
          <div key={row.id} className={cn("grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_36px] border-b border-border/10 px-1", index % 2 === 0 && "bg-background/5")}>
            <label className="flex items-center justify-center">
              <input disabled={disabled} type="checkbox" checked={row.enabled} onChange={(event) => updateRow(row.id, "enabled", event.target.checked)} />
            </label>
            <Input disabled={disabled} className="h-10 border-0 bg-transparent text-[12px] focus-visible:ring-0 lg:text-[14px]" value={row.key} onChange={(event) => updateRow(row.id, "key", event.target.value)} placeholder={keyLabel} />
            <Input disabled={disabled} className="h-10 border-0 bg-transparent text-[12px] focus-visible:ring-0 lg:text-[14px]" value={row.value} onChange={(event) => updateRow(row.id, "value", event.target.value)} placeholder={valueLabel} />
            <button type="button" disabled={disabled} className="flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40" onClick={() => removeRow(row.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GraphQLEditor({ query, variables, onQueryChange, onVariablesChange, disabled }) {
  function handleFormatQuery() {
    onQueryChange(formatGraphqlText(query));
  }

  function handleFormatVariables() {
    try {
      onVariablesChange(formatJsonText(variables || "{}"));
    } catch {
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] overflow-hidden bg-background/10">
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex items-center justify-between border-b border-border/20 px-3 py-2 text-[11px] text-muted-foreground lg:text-[12px]">
          <span className="font-medium text-foreground">Query</span>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={handleFormatQuery} disabled={disabled}>
            <Wand2 className="h-3 w-3" />
            Format Query
          </Button>
        </div>
        <CodeEditor
          value={query}
          onChange={onQueryChange}
          placeholder={"query GetUsers {\n  users {\n    id\n    name\n  }\n}"}
          language="graphql"
          disabled={disabled}
        />
      </div>

      <div className="h-px bg-border/25" />

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex items-center justify-between border-b border-border/20 px-3 py-2 text-[11px] text-muted-foreground lg:text-[12px]">
          <span className="font-medium text-foreground">Variables</span>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={handleFormatVariables} disabled={disabled}>
            <Wand2 className="h-3 w-3" />
            Format Variables
          </Button>
        </div>
        <CodeEditor
          value={variables}
          onChange={onVariablesChange}
          placeholder={"{\n  \"id\": 1\n}"}
          language="json"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function SelectMenu({ value, options, onChange, className, renderValue, renderOption, buttonClassName }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handlePointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-8 w-full items-center justify-between border border-border/35 bg-background/30 px-3 text-left text-[12px] text-foreground outline-none transition-colors hover:bg-background/45 focus-visible:ring-1 focus-visible:ring-ring",
          buttonClassName
        )}
      >
        <span className="truncate">{renderValue ? renderValue(selected) : selected.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-full overflow-hidden border border-border/45 bg-popover">
          {options.map((option) => {
            const active = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-[12px] transition-colors",
                  active ? "bg-secondary/55 text-foreground" : "text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
                )}
              >
                {renderOption ? renderOption(option, active) : <span>{option.label}</span>}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MethodPicker({ value, onChange }) {
  const methodOptions = requestMethods.map((method) => ({ value: method, label: method }));

  return (
    <SelectMenu
      value={value}
      options={methodOptions}
      onChange={onChange}
      buttonClassName="lg:h-10 lg:text-[14px]"
      renderValue={(option) => <span className={cn("font-semibold uppercase tracking-[0.14em]", getMethodTone(option.value).split(" ")[0])}>{option.label}</span>}
      renderOption={(option, active) => (
        <div className="flex w-full items-center justify-between gap-3">
          <span className={cn("font-semibold uppercase tracking-[0.14em]", getMethodTone(option.value).split(" ")[0])}>{option.label}</span>
          {active ? <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Selected</span> : null}
        </div>
      )}
    />
  );
}

export function RequestPane({
  state,
  isSending,
  onSend,
  onChange,
  onTabChange,
  onParamsChange,
  onHeadersChange,
  onAuthChange
}) {
  const activeTab = state.activeEditorTab ?? "Params";
  const bodyDisabled = state.method === "GET" || state.method === "DELETE" || state.bodyType === "none";
  const isJsonBody = state.bodyType === "json";
  const isGraphqlBody = state.bodyType === "graphql";
  const isTableBody = state.bodyType === "form-data" || state.bodyType === "form-urlencoded";

  function handleFormatBody() {
    if (!isJsonBody) {
      return;
    }

    onChange("body", formatJsonText(state.body));
  }

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-0 border-r border-border/30 bg-card/84 p-0 shadow-none">
      <div className="grid grid-cols-[108px_minmax(0,1fr)_92px] gap-px border-b border-border/25 bg-border/20 lg:grid-cols-[124px_minmax(0,1fr)_108px]">
        <MethodPicker value={state.method} onChange={(method) => onChange("method", method)} />

        <Input
          className="h-8 rounded-none border-0 bg-input/60 text-[12.5px] lg:h-10 lg:text-[14px]"
          value={state.url}
          onChange={(event) => onChange("url", event.target.value)}
          placeholder="https://api.example.com/v1/users"
        />

        <Button className="h-8 gap-1.5 rounded-none px-2.5 text-[12px] lg:h-10 lg:text-[14px]" onClick={onSend} type="button" disabled={isSending}>
          <SendHorizontal className="h-3 w-3 lg:h-4 lg:w-4" />
          {isSending ? "Sending" : "Send"}
        </Button>
      </div>

      <div className="border-b border-border/25 px-2 py-2 text-[11px] text-muted-foreground lg:text-[12px]">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn("px-2 py-1 text-muted-foreground transition-colors lg:px-3 lg:py-1.5", activeTab === tab && "bg-secondary/35 text-foreground")}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "Params" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] text-[12px]">
            <div className="border-b border-border/20 px-3 py-3">
              <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">URL Preview</div>
              <div className="bg-background/20 px-3 py-2 text-foreground">{state.url}</div>
            </div>
            <TableEditor rows={state.queryParams} onChange={onParamsChange} title="Query Parameters" addLabel="Add" />
          </div>
        ) : null}

        {activeTab === "Headers" ? (
          <TableEditor rows={state.headers} onChange={onHeadersChange} keyLabel="header" valueLabel="value" title="Headers" addLabel="Add" />
        ) : null}

        {activeTab === "Body" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <div className="flex items-center justify-between gap-3 border-b border-border/20 px-3 py-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <SelectMenu
                  value={state.bodyType}
                  options={requestBodyModes}
                  onChange={(bodyType) => onChange("bodyType", bodyType)}
                  className="min-w-[180px]"
                />
                <div className="flex items-center gap-1 border border-border/25 bg-background/20 px-2.5 py-1.5 uppercase tracking-[0.14em]">
                  <Braces className="h-3 w-3" />
                  <span>{isGraphqlBody ? "GraphQL Request" : isTableBody ? "Form Request" : isJsonBody ? "JSON Highlight" : "Plain Editor"}</span>
                </div>
              </div>
              {isJsonBody ? (
                <Button variant="outline" size="sm" className="h-8 px-2.5 text-[11px]" type="button" onClick={handleFormatBody} disabled={bodyDisabled}>
                  <Wand2 className="h-3 w-3" />
                  Format JSON
                </Button>
              ) : null}
            </div>

            {isTableBody ? (
              <TableEditor
                rows={state.bodyRows}
                onChange={(bodyRows) => onChange("bodyRows", bodyRows)}
                keyLabel="name"
                valueLabel="value"
                title={state.bodyType === "form-data" ? "Multipart Form" : "Form URL Encoded"}
                addLabel="Add"
                disabled={bodyDisabled}
              />
            ) : null}

            {isGraphqlBody ? (
              <GraphQLEditor
                query={state.body}
                variables={state.graphqlVariables}
                onQueryChange={(value) => onChange("body", value)}
                onVariablesChange={(value) => onChange("graphqlVariables", value)}
                disabled={bodyDisabled}
              />
            ) : null}

            {!isTableBody && !isGraphqlBody ? (
              <CodeEditor
                value={state.body}
                onChange={(value) => onChange("body", value)}
                placeholder={isJsonBody ? '{\n  "name": "Kivo"\n}' : "Enter request body..."}
                language={isJsonBody ? "json" : "text"}
                disabled={bodyDisabled}
              />
            ) : null}
          </div>
        ) : null}

        {activeTab === "Auth" ? (
          <div className="grid gap-4 px-3 py-3 text-[12px] text-muted-foreground">
            <div className="grid max-w-[420px] gap-2">
              <label className="text-[10px] uppercase tracking-[0.18em]">Type</label>
              <SelectMenu
                value={state.auth.type}
                options={authModes}
                onChange={(type) => onAuthChange({ ...state.auth, type })}
              />
            </div>
            {state.auth.type === "bearer" ? (
              <div className="grid max-w-[420px] gap-2">
                <label className="text-[10px] uppercase tracking-[0.18em]">Token</label>
                <Input value={state.auth.token} onChange={(event) => onAuthChange({ ...state.auth, token: event.target.value })} placeholder="Paste bearer token" />
              </div>
            ) : (
              <div className="bg-background/20 p-3">Authorization headers will be generated automatically when you choose an auth type.</div>
            )}
          </div>
        ) : null}

        {activeTab === "Docs" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Notes</div>
            <textarea
              className="thin-scrollbar min-h-0 flex-1 resize-none border-0 bg-background/20 p-3 text-[12px] leading-5 text-foreground outline-none"
              value={state.docs}
              onChange={(event) => onChange("docs", event.target.value)}
              placeholder="Request notes, examples, reminders..."
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
