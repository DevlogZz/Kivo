export function isJsonText(text) {
  if (typeof text !== "string") {
    return false;
  }

  const trimmed = text.trim();

  if (!trimmed) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function formatJsonText(text) {
  if (!isJsonText(text)) {
    return text;
  }

  return JSON.stringify(JSON.parse(text), null, 2);
}

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

export function formatGraphqlText(text) {
  const source = String(text || "").trim();

  if (!source) {
    return "";
  }

  const tokens = source.match(graphqlTokenPattern) ?? [];
  let indentLevel = 0;
  let line = "";
  const lines = [];

  function indent() {
    return "  ".repeat(Math.max(indentLevel, 0));
  }

  function pushLine(force = false) {
    const content = line.trimEnd();

    if (content || force) {
      lines.push(content);
    }

    line = "";
  }

  function append(value) {
    if (!line) {
      line = indent();
    }

    line += value;
  }

  tokens.forEach((token) => {
    if (token.startsWith("#")) {
      pushLine();
      lines.push(`${indent()}${token}`);
      return;
    }

    if (token === "{") {
      if (line.trim()) {
        append(" {");
        pushLine();
      } else {
        append("{");
        pushLine();
      }

      indentLevel += 1;
      return;
    }

    if (token === "}") {
      pushLine();
      indentLevel -= 1;
      line = `${indent()}}`;
      pushLine();
      return;
    }

    if (token === "(" || token === "[" || token === ":") {
      append(token);
      return;
    }

    if (token === ")" || token === "]" || token === "!" || token === "," || token === "=" || token === "@") {
      append(token);
      return;
    }

    if (token === "...") {
      if (line.trim() && !line.endsWith(" ")) {
        append(" ");
      }

      append(token);
      return;
    }

    const tokenNeedsLeadingSpace = line.trim() && !line.endsWith("(") && !line.endsWith("[") && !line.endsWith(":") && !line.endsWith(" ");
    const previousToken = line.trim().split(/\s+/).at(-1) ?? "";
    const shouldStartNewLine =
      line.trim() &&
      !previousToken.endsWith("(") &&
      !previousToken.endsWith(":") &&
      !graphqlKeywords.has(previousToken) &&
      !previousToken.startsWith("@") &&
      !previousToken.startsWith("$");

    if (shouldStartNewLine && !token.startsWith("@")) {
      pushLine();
    }

    if (tokenNeedsLeadingSpace && line.trim()) {
      append(" ");
    }

    append(token);
  });

  pushLine();

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function formatResponseBody(text) {
  if (!text) {
    return "";
  }

  return formatJsonText(text);
}
