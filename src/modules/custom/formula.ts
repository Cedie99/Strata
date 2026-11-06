// A small expression language for calculated fields and validation rules, shared by the browser
// (live preview) and the server (the stored result). It is parsed here, never passed to eval.
//
//   qty * price                      price - cost >= 0
//   round(amount * 12 / 100, 2)      if(vat, amount * 0.12, 0)
//   status = "Active" and qty > 0    not discontinued
//
// Values are numbers, text or yes/no. Field keys stand for the record's values: number-like fields
// are numbers (empty = 0), Yes/no fields are yes/no, everything else is text.

export type Value = number | string | boolean;

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "var"; name: string }
  | { k: "unary"; op: "-" | "not"; arg: Node }
  | { k: "bin"; op: string; left: Node; right: Node }
  | { k: "call"; fn: string; args: Node[] };

export class FormulaError extends Error {}

type Token = { t: "num" | "str" | "id" | "op" | "end"; v: string; at: number };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const at = i;
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?|^\d+\.?/i.exec(src.slice(i))!;
      out.push({ t: "num", v: m[0], at });
      i += m[0].length;
    } else if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new FormulaError(`Text starting at position ${at + 1} is missing its closing ${c}`);
      out.push({ t: "str", v: src.slice(i + 1, end), at });
      i = end + 1;
    } else if (/[a-z_]/i.test(c)) {
      const m = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], at });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      const op = ["<=", ">=", "!=", "<>", "==", "&&", "||"].includes(two) ? two : c;
      if (!"+-*/%()<>=!,".includes(op[0])) throw new FormulaError(`Unexpected "${c}" at position ${at + 1}`);
      out.push({ t: "op", v: op, at });
      i += op.length;
    }
  }
  out.push({ t: "end", v: "", at: src.length });
  return out;
}

const FUNCTIONS: Record<string, { min: number; max: number }> = {
  round: { min: 1, max: 2 },
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  min: { min: 1, max: 20 },
  max: { min: 1, max: 20 },
  if: { min: 3, max: 3 },
  empty: { min: 1, max: 1 },
  len: { min: 1, max: 1 },
  days: { min: 2, max: 2 },
};

// Lowest to highest precedence.
const LEVELS: string[][] = [["or", "||"], ["and", "&&"], ["=", "==", "!=", "<>", "<", "<=", ">", ">="], ["+", "-"], ["*", "/", "%"]];
const NOT_LEVEL = 2;

/** Parses an expression; throws FormulaError with a readable message. */
export function parseFormula(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isOp = (tok: Token, ops: string[]) => (tok.t === "op" || tok.t === "id") && ops.includes(tok.v.toLowerCase());

  const level = (n: number): Node => {
    if (n === LEVELS.length) return unary();
    // "not" covers a whole comparison: not price > cost = not (price > cost).
    if (n === NOT_LEVEL && isOp(peek(), ["not", "!"])) {
      next();
      return { k: "unary", op: "not", arg: level(n) };
    }
    let left = level(n + 1);
    while (isOp(peek(), LEVELS[n])) {
      const op = next().v.toLowerCase();
      left = { k: "bin", op, left, right: level(n + 1) };
    }
    return left;
  };
  const unary = (): Node => {
    if (isOp(peek(), ["-"])) {
      next();
      return { k: "unary", op: "-", arg: unary() };
    }
    return primary();
  };
  const primary = (): Node => {
    const tok = next();
    if (tok.t === "num") return { k: "num", v: Number(tok.v) };
    if (tok.t === "str") return { k: "str", v: tok.v };
    if (tok.t === "op" && tok.v === "(") {
      const inner = level(0);
      if (next().v !== ")") throw new FormulaError("A ( is missing its )");
      return inner;
    }
    if (tok.t === "id") {
      const name = tok.v.toLowerCase();
      if (name === "true" || name === "yes") return { k: "bool", v: true };
      if (name === "false" || name === "no") return { k: "bool", v: false };
      if (peek().v === "(") {
        const fn = FUNCTIONS[name];
        if (!fn) throw new FormulaError(`Unknown function "${tok.v}"`);
        next();
        const args: Node[] = [];
        if (peek().v !== ")") {
          args.push(level(0));
          while (peek().v === ",") {
            next();
            args.push(level(0));
          }
        }
        if (next().v !== ")") throw new FormulaError(`${tok.v}( is missing its )`);
        if (args.length < fn.min || args.length > fn.max)
          throw new FormulaError(`${tok.v}() takes ${fn.min === fn.max ? fn.min : `${fn.min} to ${fn.max}`} value(s)`);
        return { k: "call", fn: name, args };
      }
      return { k: "var", name: tok.v };
    }
    throw new FormulaError(tok.t === "end" ? "The formula ends too early" : `Unexpected "${tok.v}" at position ${tok.at + 1}`);
  };

  if (!src.trim()) throw new FormulaError("The formula is empty");
  const node = level(0);
  if (peek().t !== "end") throw new FormulaError(`Unexpected "${peek().v}" at position ${peek().at + 1}`);
  return node;
}

/** Field keys an expression uses. */
export function formulaRefs(node: Node, out = new Set<string>()): Set<string> {
  if (node.k === "var") out.add(node.name);
  else if (node.k === "unary") formulaRefs(node.arg, out);
  else if (node.k === "bin") formulaRefs(node.left, formulaRefs(node.right, out));
  else if (node.k === "call") node.args.forEach((a) => formulaRefs(a, out));
  return out;
}

const num = (v: Value) => (typeof v === "number" ? v : typeof v === "boolean" ? Number(v) : Number(v) || 0);
const truthy = (v: Value) => (typeof v === "string" ? v !== "" : Boolean(v));
const dayNumber = (v: Value) => Math.floor(new Date(`${String(v).slice(0, 10)}T12:00:00Z`).getTime() / 86_400_000);

/** Evaluates a parsed expression against a record's values. */
export function evaluate(node: Node, vars: (name: string) => Value): Value {
  switch (node.k) {
    case "num":
    case "str":
    case "bool":
      return node.v;
    case "var":
      return vars(node.name);
    case "unary":
      return node.op === "-" ? -num(evaluate(node.arg, vars)) : !truthy(evaluate(node.arg, vars));
    case "bin": {
      if (node.op === "and" || node.op === "&&") return truthy(evaluate(node.left, vars)) && truthy(evaluate(node.right, vars));
      if (node.op === "or" || node.op === "||") return truthy(evaluate(node.left, vars)) || truthy(evaluate(node.right, vars));
      const a = evaluate(node.left, vars);
      const b = evaluate(node.right, vars);
      // Text compares as text (ignoring case) unless both sides read as numbers.
      const asText = (typeof a === "string" && isNaN(Number(a))) || (typeof b === "string" && isNaN(Number(b)));
      const cmp = asText
        ? String(a).toLowerCase().localeCompare(String(b).toLowerCase())
        : num(a) - num(b);
      switch (node.op) {
        case "+":
          return asText ? `${a}${b}` : num(a) + num(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/":
          return num(b) === 0 ? 0 : num(a) / num(b);
        case "%":
          return num(b) === 0 ? 0 : num(a) % num(b);
        case "=":
        case "==":
          return cmp === 0;
        case "!=":
        case "<>":
          return cmp !== 0;
        case "<":
          return cmp < 0;
        case "<=":
          return cmp <= 0;
        case ">":
          return cmp > 0;
        default:
          return cmp >= 0;
      }
    }
    case "call": {
      const args = node.args.map((a) => evaluate(a, vars));
      switch (node.fn) {
        case "round": {
          const p = 10 ** num(args[1] ?? 0);
          return Math.round(num(args[0]) * p) / p;
        }
        case "floor":
          return Math.floor(num(args[0]));
        case "ceil":
          return Math.ceil(num(args[0]));
        case "abs":
          return Math.abs(num(args[0]));
        case "min":
          return Math.min(...args.map(num));
        case "max":
          return Math.max(...args.map(num));
        case "if":
          return truthy(args[0]) ? args[1] : args[2];
        case "empty":
          return args[0] === "" || args[0] === undefined;
        case "len":
          return String(args[0]).length;
        default: // days(from, to): days between two dates
          return args[0] && args[1] ? dayNumber(args[1]) - dayNumber(args[0]) : 0;
      }
    }
  }
}

/** Parses and checks that every field it uses exists; returns the error message, or null. */
export function checkFormula(src: string, known: Set<string>): string | null {
  try {
    const unknown = [...formulaRefs(parseFormula(src))].filter((r) => !known.has(r));
    return unknown.length ? `Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")} (use the field keys)` : null;
  } catch (e) {
    if (e instanceof FormulaError) return e.message;
    throw e;
  }
}
