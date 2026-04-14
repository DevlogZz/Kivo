# Kivo JSON Query Engine v1

A query engine for filtering JSON response payloads. Supports text search, conditional expressions, compound queries with `&&` / `||` / `!`, and parenthetical grouping.

---

## Architecture

```
User Query String
       │
       ▼
┌─────────────┐
│  Tokenizer  │  Scans input into typed tokens
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Parser    │  Recursive descent → AST tree
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Validator  │  Rejects malformed queries safely
└──────┬──────┘
       │
       ▼
┌──────────────┐
│ Query Planner│  Estimates cost, reorders execution
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Executor   │  Runs plan against cached index
└──────┬───────┘
       │
       ▼
    Results
```

---

## Query Language

### Supported Syntax

| Type | Example | Description |
|---|---|---|
| Text search | `dex` | Fuzzy match on keys and values |
| Condition | `age > 20` | Compare a key's value |
| Compound AND | `age > 20 && status == active` | Both conditions must match |
| Compound OR | `name == dex \|\| name == dexter` | Either condition matches |
| Grouping | `(a == 1 \|\| b == 2) && c > 3` | Parenthetical precedence |
| Negation | `!(completed == true)` | Invert a condition |
| NOT shorthand | `!completed` | Key exists and is falsy |
| Bare identifier | `completed` | Key exists and is truthy |

### Supported Operators

| Operator | Description |
|---|---|
| `=` or `==` | Loose equality |
| `!=` | Not equal |
| `>` | Greater than |
| `>=` | Greater than or equal |
| `<` | Less than |
| `<=` | Less than or equal |
| `&&` | Logical AND |
| `\|\|` | Logical OR |
| `!` | Logical NOT |

### Value Types

Values are auto-detected:

- **Numbers**: `42`, `3.14`
- **Booleans**: `true`, `false`
- **Null**: `null`
- **Strings**: `"quoted"`, `'quoted'`, or `bare` (unquoted identifiers)
- **Escaped strings**: `"hello \"world\""`, `'it\'s'`

---

## How It Works

### Layer 0: Normalization + Global Index

When a JSON response is received, a preprocessing pass runs once:

1. **Normalization** — Builds a parallel wrapper tree where:
   - All object keys are lowercased
   - Every primitive value has a pre-computed `__str` (lowercased string representation)
   - Original values are preserved as references (never cloned)

2. **Global Index** — Builds a `Map<key, entries[]>` indexing every key in the tree, used for condition query lookups.

```
Raw JSON ──► buildNormalized() ──► Wrapper Tree
                                        │
                                        ▼
                                 buildGlobalIndex()
                                        │
                                        ▼
                           Map { "userid" → [...], "name" → [...] }
```

Both are **cached** — they only rebuild when the response data reference changes.

---

### Layer 1: Tokenizer

The tokenizer scans the query string character-by-character and emits typed tokens:

```
Input:  "age > 20 && status == active"

Tokens: [IDENT:age] [OP:>] [NUMBER:20] [AND] [IDENT:status] [OP:==] [IDENT:active]
```

Supports escape sequences in quoted strings (`\"`, `\'`).

---

### Layer 2: Parser (Recursive Descent)

Implements this grammar with proper operator precedence:

```
expression → orExpr
orExpr     → andExpr ('||' andExpr)*
andExpr    → unary ('&&' unary)*
unary      → '!' unary | primary
primary    → '(' expression ')' | condition
condition  → IDENT OP value | IDENT
```

**AND binds tighter than OR** — so `a || b && c` is parsed as `a || (b && c)`.

Produces an AST:

```
Input: "age > 20 && status == active"

AST:
  { type: "AND",
    left:  { type: "COND", key: "age", op: ">", value: 20 },
    right: { type: "COND", key: "status", op: "==", value: "active" }
  }
```

**Validation**: Malformed queries (dangling operators, missing values, unmatched parens, unconsumed tokens) return `null`, and the engine falls back to returning unfiltered data.

---

### Layer 3: Query Planner

Transforms the AST into an optimized execution plan:

```
AST Node    →  Plan Node
─────────      ─────────
COND        →  INDEX (with estimatedSize from global index)
NOT         →  NOT (wraps inner plan)
AND         →  AND (smaller index first for early reduction)
OR          →  OR (both sides executed, union results)
```

For AND nodes, the planner checks `estimatedSize` of both sides and executes the smaller one first to reduce the candidate set early.

```
age > 20 && status == active

If index("age") has 200 entries and index("status") has 50:
  → Execute status first (50 candidates)
  → Intersect with age results
  → Instead of filtering 200, we filter 50
```

**Plan caching**: Plans are cached in a `Map` (LRU, max 64 entries) keyed by query string. Repeated or modified queries skip tokenize/parse/plan entirely.

---

### Layer 4: Executor

Runs the execution plan against the global index:

```
┌─────────────────────────────────────────────────────┐
│ INDEX  →  globalIndex.get(key) → compiled matcher   │
│           Returns Set<parent.orig>                  │
│                                                     │
│ AND    →  Execute first (smaller) → short-circuit   │
│           Execute second → Set intersection         │
│           Iterates the smaller set for O(min(k1,k2))│
│                                                     │
│ OR     →  Execute both → Set union                  │
│           Caps at MAX_MATCHES (500)                 │
│                                                     │
│ NOT    →  Collect universe (all objects with key)   │
│           Subtract inner matches → complement       │
└─────────────────────────────────────────────────────┘
```

AND chains short-circuit if the first condition yields zero results.

The executor returns `Set<orig>` — original object references from the raw JSON, avoiding unnecessary object creation.

---

### Layer 5: Text Search

For plain text queries (no operators), a separate iterative traversal runs:

- Uses linked parent pointers instead of ancestor array copying
- Matches against pre-computed `__str` values to avoid repeated `toLowerCase()` calls
- When a value matches, the **entire parent object** is preserved (all sibling properties visible)
- When a key matches, the **entire parent object** is returned as-is

---

### Layer 6: Query Router

The engine detects query type and routes accordingly:

```
Input contains && || ( ! ?
  → YES → AST Pipeline (tokenize → parse → plan → execute)

Input contains = ! < > ?
  → YES → Single INDEX (fast path, no AST overhead)

Otherwise
  → Text Search (iterative traversal with pre-computed strings)
```

---

## Performance Characteristics

| Operation | Complexity | Notes |
|---|---|---|
| Normalization | O(N) once | Cached per data reference |
| Global index build | O(N) once | Built during normalization |
| Condition query | O(k) | k = objects with that key |
| AND intersection | O(min(k1, k2)) | Iterates smaller set |
| OR union | O(k1 + k2) | Caps at 500 |
| NOT complement | O(universe) | Universe = all objects with key |
| Text search | O(N) | Pre-stringified, no runtime toLowerCase |
| Repeated query | O(1) lookup | Plan cache hit |

### Memory

- Wrapper tree: roughly 2x the raw JSON size (parallel structure with `__str` and `orig` refs)
- Global index: proportional to total key count
- Plan cache: max 64 entries, LRU eviction
- Results: returns original references to avoid extra allocations

---

## UI Integration

The engine integrates with the ResponsePane via:

- **300ms debounce** on input to prevent mid-typing execution
- **2-char minimum** for text search to avoid overly broad matches
- **50-item display cap** to prevent DOM explosion (shows "Showing 50 of X matches")
- **React.memo** on JsonTree to skip re-renders of unchanged subtrees
- **Auto-collapse** when search clears — nodes return to depth < 2

---

## File Structure

```
src/
└── lib/
    └── json-filter.js      ← Engine (tokenizer, parser, planner, executor, index)

src/
└── components/
    ├── ui/
    │   └── JsonTree.jsx     ← Memoized tree renderer with progressive loading
    └── workspace/
        └── ResponsePane.jsx ← Search bar UI, debounce, display cap
```
