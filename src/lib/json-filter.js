// Kivo JSON Query Engine v1
// Architecture:
//   Query → Tokenizer → Parser → AST → Validator → Query Planner → Executor
//
// Supports:
//   - Text search:     "dex"
//   - Conditions:      age > 20
//   - Compound:        age > 20 && status == "active"
//   - Complex:         (name == "dex" || name == "dexter") && age >= 18
//   - Negation:        !(completed == true)
//   - NOT shorthand:   !completed (equivalent to completed == false)
//
// Operators: == != > < >= <= = (alias for ==)
// Logical:   && || !
// Grouping:  ( )


function buildNormalized(raw) {
  if (raw === null) return { orig: raw, type: "null", __str: "null" };

  const t = typeof raw;
  if (t !== "object") return { orig: raw, type: "leaf", __str: String(raw).toLowerCase() };

  if (Array.isArray(raw)) {
    const len = raw.length;
    const children = new Array(len);
    for (let i = 0; i < len; i++) {
      children[i] = { key: null, lowerKey: null, node: buildNormalized(raw[i]) };
    }
    return { orig: raw, type: "array", children };
  }

  const keys = Object.keys(raw);
  const children = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    children[i] = { key: k, lowerKey: k.toLowerCase(), node: buildNormalized(raw[k]) };
  }
  return { orig: raw, type: "object", children };
}

function buildGlobalIndex(root) {
  const index = new Map();
  const stack = [root];

  while (stack.length > 0) {
    const wrapper = stack.pop();
    if (wrapper.type !== "object" && wrapper.type !== "array") continue;

    if (wrapper.type === "object") {
      for (let i = 0; i < wrapper.children.length; i++) {
        const child = wrapper.children[i];
        let list = index.get(child.lowerKey);
        if (!list) {
          list = [];
          index.set(child.lowerKey, list);
        }
        list.push({ parent: wrapper, valueNode: child.node });
        if (child.node.type === "object" || child.node.type === "array") {
          stack.push(child.node);
        }
      }
    } else {
      for (let i = 0; i < wrapper.children.length; i++) {
        stack.push(wrapper.children[i].node);
      }
    }
  }

  return index;
}

// ==================
// LAYER 1: Tokenizer
// ==================

const TOKEN = {
  IDENT: 1, NUMBER: 2, STRING: 3, BOOL: 4, NULL: 5,
  OP: 6, AND: 7, OR: 8, LPAREN: 9, RPAREN: 10, NOT: 11
};

function tokenize(input) {
  const tokens = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    if (input[i] === " " || input[i] === "\t") { i++; continue; }

    // logical AND
    if (input[i] === "&" && input[i + 1] === "&") {
      tokens.push({ type: TOKEN.AND }); i += 2; continue;
    }
    // logical OR
    if (input[i] === "|" && input[i + 1] === "|") {
      tokens.push({ type: TOKEN.OR }); i += 2; continue;
    }

    // parens
    if (input[i] === "(") { tokens.push({ type: TOKEN.LPAREN }); i++; continue; }
    if (input[i] === ")") { tokens.push({ type: TOKEN.RPAREN }); i++; continue; }

    // != (comparison, not NOT)
    if (input[i] === "!" && input[i + 1] === "=") {
      tokens.push({ type: TOKEN.OP, value: "!=" }); i += 2; continue;
    }
    // NOT operator (standalone !)
    if (input[i] === "!") {
      tokens.push({ type: TOKEN.NOT }); i++; continue;
    }

    // Comparison operators
    if (input[i] === "=" && input[i + 1] === "=") {
      tokens.push({ type: TOKEN.OP, value: "==" }); i += 2; continue;
    }
    if (input[i] === ">" && input[i + 1] === "=") {
      tokens.push({ type: TOKEN.OP, value: ">=" }); i += 2; continue;
    }
    if (input[i] === "<" && input[i + 1] === "=") {
      tokens.push({ type: TOKEN.OP, value: "<=" }); i += 2; continue;
    }
    if (input[i] === "=") {
      tokens.push({ type: TOKEN.OP, value: "==" }); i++; continue;
    }
    if (input[i] === ">") {
      tokens.push({ type: TOKEN.OP, value: ">" }); i++; continue;
    }
    if (input[i] === "<") {
      tokens.push({ type: TOKEN.OP, value: "<" }); i++; continue;
    }

    // String literals with escape support
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      let j = i + 1;
      let str = "";
      while (j < len && input[j] !== quote) {
        if (input[j] === "\\" && j + 1 < len) {
          str += input[j + 1];
          j += 2;
        } else {
          str += input[j];
          j++;
        }
      }
      tokens.push({ type: TOKEN.STRING, value: str });
      i = j + 1; continue;
    }

    // Identifiers, numbers, booleans, null
    if (/[\w.\-]/.test(input[i])) {
      let j = i;
      while (j < len && /[\w.\-]/.test(input[j])) j++;
      const word = input.slice(i, j);

      if (word === "true" || word === "false") {
        tokens.push({ type: TOKEN.BOOL, value: word === "true" });
      } else if (word === "null") {
        tokens.push({ type: TOKEN.NULL, value: null });
      } else if (!isNaN(Number(word)) && word !== "") {
        tokens.push({ type: TOKEN.NUMBER, value: Number(word) });
      } else {
        tokens.push({ type: TOKEN.IDENT, value: word.toLowerCase() });
      }
      i = j; continue;
    }

    i++;
  }

  return tokens;
}

// ===================================
// LAYER 2: Parser (Recursive Descent)
// ===================================
// Grammar:
//   expression → orExpr
//   orExpr     → andExpr ('||' andExpr)*
//   andExpr    → unary ('&&' unary)*
//   unary      → '!' unary | primary
//   primary    → '(' expression ')' | condition
//   condition  → IDENT OP value | IDENT (bare → truthiness check)

function parse(tokens) {
  let pos = 0;

  function peek() { return pos < tokens.length ? tokens[pos] : null; }
  function advance() { return tokens[pos++]; }

  function parseValue() {
    const t = peek();
    if (!t) return undefined;
    if (t.type === TOKEN.STRING || t.type === TOKEN.NUMBER ||
      t.type === TOKEN.BOOL || t.type === TOKEN.NULL) {
      advance();
      return t.value;
    }
    if (t.type === TOKEN.IDENT) {
      advance();
      return t.value;
    }
    return undefined;
  }

  function parsePrimary() {
    const t = peek();
    if (!t) return null;

    // Grouped expression
    if (t.type === TOKEN.LPAREN) {
      advance();
      const expr = parseOrExpr();
      if (peek() && peek().type === TOKEN.RPAREN) advance();
      return expr;
    }

    // Condition: IDENT OP VALUE  or  bare IDENT 
    if (t.type === TOKEN.IDENT) {
      const key = advance().value;
      const opToken = peek();
      if (opToken && opToken.type === TOKEN.OP) {
        const op = advance().value;
        const val = parseValue();
        if (val === undefined) return null; // validation missing value
        return { type: "COND", key, op, value: val };
      }
      // bare identifier: key exists and is truthy
      return { type: "COND", key, op: "==", value: true };
    }

    return null;
  }

  function parseUnary() {
    const t = peek();
    if (t && t.type === TOKEN.NOT) {
      advance();
      const operand = parseUnary(); // supports chained !!
      if (!operand) return null;
      return { type: "NOT", operand };
    }
    return parsePrimary();
  }

  function parseAndExpr() {
    let left = parseUnary();
    while (peek() && peek().type === TOKEN.AND) {
      advance();
      const right = parseUnary();
      if (!right) break; // validation: dangling &&
      left = { type: "AND", left, right };
    }
    return left;
  }

  function parseOrExpr() {
    let left = parseAndExpr();
    while (peek() && peek().type === TOKEN.OR) {
      advance();
      const right = parseAndExpr();
      if (!right) break; // validation: dangling ||
      left = { type: "OR", left, right };
    }
    return left;
  }

  const result = parseOrExpr();

  // Validation: if there are unconsumed tokens, query is malformed
  if (pos < tokens.length) return null;

  return result;
}

// ==========================
// LAYER 3: Compiled Matchers
// ==========================

function compileCond(op, val) {
  switch (op) {
    case "==": return (v) => v == val;
    case "!=": return (v) => v != val;
    case ">": return (v) => v > val;
    case ">=": return (v) => v >= val;
    case "<": return (v) => v < val;
    case "<=": return (v) => v <= val;
    default: return () => false;
  }
}

// ======================
// LAYER 4: Query Planner 
// ======================

function planQuery(ast, globalIndex) {
  if (!ast) return null;

  if (ast.type === "COND") {
    const entries = globalIndex.get(ast.key);
    return {
      type: "INDEX",
      key: ast.key,
      matcher: compileCond(ast.op, ast.value),
      estimatedSize: entries ? entries.length : 0
    };
  }

  if (ast.type === "NOT") {
    const inner = planQuery(ast.operand, globalIndex);
    if (!inner) return null;
    return {
      type: "NOT",
      operand: inner,
      estimatedSize: inner.estimatedSize
    };
  }

  if (ast.type === "AND") {
    const leftPlan = planQuery(ast.left, globalIndex);
    const rightPlan = planQuery(ast.right, globalIndex);
    if (!leftPlan || !rightPlan) return leftPlan || rightPlan;

    const firstSmaller = (leftPlan.estimatedSize || Infinity) <= (rightPlan.estimatedSize || Infinity);
    return {
      type: "AND",
      first: firstSmaller ? leftPlan : rightPlan,
      second: firstSmaller ? rightPlan : leftPlan,
      estimatedSize: Math.min(leftPlan.estimatedSize, rightPlan.estimatedSize)
    };
  }

  if (ast.type === "OR") {
    const leftPlan = planQuery(ast.left, globalIndex);
    const rightPlan = planQuery(ast.right, globalIndex);
    if (!leftPlan || !rightPlan) return leftPlan || rightPlan;

    return {
      type: "OR",
      left: leftPlan,
      right: rightPlan,
      estimatedSize: (leftPlan.estimatedSize || 0) + (rightPlan.estimatedSize || 0)
    };
  }

  return null;
}

// =================
// LAYER 5: Executor 
// =================

const MAX_MATCHES = 500;

// execute an INDEX plan and return Set<parent.orig>
function executeIndex(plan, globalIndex) {
  const entries = globalIndex.get(plan.key);
  if (!entries) return new Set();

  const result = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (plan.matcher(entries[i].valueNode.orig)) {
      result.add(entries[i].parent.orig);
      if (result.size >= MAX_MATCHES) break;
    }
  }
  return result;
}

// collect ALL parent.orig for a given key (for NOT complement)
function collectAllForKey(key, globalIndex) {
  const entries = globalIndex.get(key);
  if (!entries) return new Set();

  const result = new Set();
  for (let i = 0; i < entries.length; i++) {
    result.add(entries[i].parent.orig);
  }
  return result;
}

function executePlan(plan, globalIndex) {
  if (!plan) return new Set();

  // INDEX: direct lookup O(k)
  if (plan.type === "INDEX") {
    return executeIndex(plan, globalIndex);
  }

  // NOT: complement against the key's universe
  if (plan.type === "NOT") {
    if (plan.operand.type === "INDEX") {

      // Get all objects that have this key
      const universe = collectAllForKey(plan.operand.key, globalIndex);

      // Get objects that match the inner condition
      const innerMatched = executeIndex(plan.operand, globalIndex);

      // Complement: objects with the key that DON'T match
      const result = new Set();
      for (const obj of universe) {
        if (!innerMatched.has(obj)) {
          result.add(obj);
          if (result.size >= MAX_MATCHES) break;
        }
      }
      return result;
    }

    // General NOT: run inner, then complement against all indexed objects
    const innerResult = executePlan(plan.operand, globalIndex);

    // For general NOT we need a universe — collect all unique parent origs
    const allOrigs = new Set();
    for (const [, entries] of globalIndex) {
      for (let i = 0; i < entries.length; i++) {
        allOrigs.add(entries[i].parent.orig);
      }
    }
    const result = new Set();
    for (const obj of allOrigs) {
      if (!innerResult.has(obj)) {
        result.add(obj);
        if (result.size >= MAX_MATCHES) break;
      }
    }
    return result;
  }

  // AND: index intersection (pure O(k), no Object.keys scan) 
  if (plan.type === "AND") {
    const firstResult = executePlan(plan.first, globalIndex);
    if (firstResult.size === 0) return firstResult;

    // Index intersection: run second through index, intersect with first
    const secondResult = executePlan(plan.second, globalIndex);

    const result = new Set();
    // Iterate the smaller set for efficiency
    const [smaller, larger] = firstResult.size <= secondResult.size
      ? [firstResult, secondResult]
      : [secondResult, firstResult];

    for (const obj of smaller) {
      if (larger.has(obj)) result.add(obj);
    }
    return result;
  }

  // OR: execute both, union
  if (plan.type === "OR") {
    const leftResult = executePlan(plan.left, globalIndex);
    const rightResult = executePlan(plan.right, globalIndex);

    for (const obj of rightResult) {
      leftResult.add(obj);
      if (leftResult.size >= MAX_MATCHES) break;
    }
    return leftResult;
  }

  return new Set();
}

// ====================
// LAYER 6: Text Search 
// ====================

function textSearch(root, q) {
  const matchedWrappers = new Set();
  const fullMatchWrappers = new Set();

  const stack = [{ wrapper: root, parentLink: null }];

  while (stack.length > 0) {
    const frame = stack.pop();
    const wrapper = frame.wrapper;

    if (wrapper.type === "null" || wrapper.type === "leaf") {
      if (wrapper.__str.includes(q)) {
        matchedWrappers.add(wrapper);
        let link = frame.parentLink;
        if (link !== null && link.wrapper.type === "object") {
          fullMatchWrappers.add(link.wrapper);
        }
        while (link !== null) {
          if (matchedWrappers.has(link.wrapper)) break;
          matchedWrappers.add(link.wrapper);
          link = link.parentLink;
        }
      }
      continue;
    }

    const parentLink = frame;

    for (let i = 0; i < wrapper.children.length; i++) {
      const child = wrapper.children[i];

      if (child.lowerKey !== null && child.lowerKey.includes(q)) {
        fullMatchWrappers.add(wrapper);
        matchedWrappers.add(wrapper);
        let link = frame.parentLink;
        while (link !== null) {
          if (matchedWrappers.has(link.wrapper)) break;
          matchedWrappers.add(link.wrapper);
          link = link.parentLink;
        }
        break;
      }

      stack.push({ wrapper: child.node, parentLink });
    }
  }

  if (matchedWrappers.size === 0) return undefined;
  return rebuildFromWrappers(root, matchedWrappers, fullMatchWrappers);
}

function rebuildFromWrappers(wrapper, matchedSet, fullMatchSet) {
  if (wrapper.type === "null" || wrapper.type === "leaf") {
    return matchedSet.has(wrapper) ? wrapper.orig : undefined;
  }

  if (!matchedSet.has(wrapper)) return undefined;
  if (fullMatchSet.has(wrapper)) return wrapper.orig;

  const isArray = wrapper.type === "array";
  let res = null;

  for (let i = 0; i < wrapper.children.length; i++) {
    const child = wrapper.children[i];
    const childResult = rebuildFromWrappers(child.node, matchedSet, fullMatchSet);
    if (childResult !== undefined) {
      if (!res) res = isArray ? [] : {};
      if (isArray) res.push(childResult);
      else res[child.key] = childResult;
    }
  }

  return res;
}

// ==================================
// LAYER 7: Query Router + Plan Cache
// ==================================

let _cachedRaw = null;
let _cachedTree = null;
let _globalIndex = null;
const _planCache = new Map();
const MAX_PLAN_CACHE = 64;

function getTree(data) {
  if (data === _cachedRaw && _cachedTree) return _cachedTree;

  _cachedRaw = data;
  _cachedTree = buildNormalized(data);
  _globalIndex = buildGlobalIndex(_cachedTree);
  _planCache.clear(); // invalidate plan cache when data changes
  return _cachedTree;
}

function getCachedPlan(input) {
  if (_planCache.has(input)) return _planCache.get(input);

  const tokens = tokenize(input);
  const ast = parse(tokens);

  // Validation: parse returns null for malformed queries
  if (!ast) {
    _planCache.set(input, null);
    return null;
  }

  const plan = planQuery(ast, _globalIndex);

  // LRU eviction: drop oldest if cache is full
  if (_planCache.size >= MAX_PLAN_CACHE) {
    const firstKey = _planCache.keys().next().value;
    _planCache.delete(firstKey);
  }
  _planCache.set(input, plan);
  return plan;
}

function isStructuredQuery(input) {
  return /[=!<>]/.test(input);
}

function needsAST(input) {
  return input.includes("&&") || input.includes("||") || input.includes("(") || input.includes("!");
}

function collectMatchedOrigs(matchedSet, data) {
  if (Array.isArray(data)) return [...matchedSet];

  const result = {};
  const keys = Object.keys(data);
  let hasResult = false;
  for (let i = 0; i < keys.length; i++) {
    if (matchedSet.has(data[keys[i]])) {
      result[keys[i]] = data[keys[i]];
      hasResult = true;
    }
  }
  return hasResult ? result : {};
}

export function filterJson(data, inputStr) {
  if (!inputStr || !inputStr.trim()) return data;

  const input = inputStr.trim();
  const tree = getTree(data);
  const empty = Array.isArray(data) ? [] : {};

  // Path 1: AST pipeline (compound / NOT queries)
  if (needsAST(input)) {
    const plan = getCachedPlan(input);

    // Validation fallback: malformed query -> return unfiltered data
    if (!plan) return data;

    const matchedSet = executePlan(plan, _globalIndex);
    if (matchedSet.size === 0) return empty;

    return collectMatchedOrigs(matchedSet, data);
  }

  // Path 2: Single condition (fast index, no AST overhead) 
  if (isStructuredQuery(input)) {
    const match = input.match(/^([\w.-]+)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/);
    if (match) {
      const key = match[1].toLowerCase();
      let op = match[2];
      const valStr = match[3].trim();

      if (op === "=") op = "==";

      let val = valStr;
      if (valStr === "true") val = true;
      else if (valStr === "false") val = false;
      else if (valStr === "null") val = null;
      else if (valStr !== "" && !isNaN(Number(valStr))) val = Number(valStr);
      else if ((valStr[0] === '"' && valStr.at(-1) === '"') || (valStr[0] === "'" && valStr.at(-1) === "'"))
        val = valStr.slice(1, -1);

      const matcher = compileCond(op, val);
      const entries = _globalIndex.get(key);
      if (!entries || entries.length === 0) return empty;

      const matched = new Set();
      for (let i = 0; i < entries.length; i++) {
        if (matcher(entries[i].valueNode.orig)) {
          matched.add(entries[i].parent.orig);
          if (matched.size >= MAX_MATCHES) break;
        }
      }

      if (matched.size === 0) return empty;
      return collectMatchedOrigs(matched, data);
    }
  }

  // Path 3: Text search
  const result = textSearch(tree, input.toLowerCase());
  return result === undefined ? empty : result;
}
