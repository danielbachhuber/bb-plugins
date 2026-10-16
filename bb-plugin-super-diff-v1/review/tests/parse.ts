// Reading a test file into tests and numbered steps, and a snapshot file into
// its entries. Pure, and generic: it knows Jest and Vitest's shared shapes
// (`test`/`it` inside `describe`, `expect(...).matcher()`, snapshot entries
// named after the test and a counter), not any one repository's helpers.
//
// Server-only: it loads the TypeScript compiler, which the panel never needs.
import ts from "typescript";

export { TEST_FILE, isTestFile, snapshotPathFor } from "./paths";

/**
 * What an assertion checks: an exact value, an error, a mock call, a recorded
 * snapshot, only that something is there, or whatever an assertion helper
 * checks, such as `expectPosted(post)`.
 */
export type StepKind = "exact" | "error" | "mock" | "snapshot" | "truthy" | "helper";

export interface TestStep {
  /** `<test>.<step>`, both from 1: "1.3". */
  id: string;
  kind: StepKind;
  /** 1-based line in the test file. */
  line: number;
  /** The assertion on one line: what is checked, its modifiers, the matcher, and its argument. */
  code: string;
  /** The snapshot entry this step wrote, for a snapshot step. */
  snapshotKey: string | null;
  /** The helper's name, for a helper step. */
  helper: string | null;
}

/**
 * Assertion helpers by naming convention: `expectPosted(...)`,
 * `assertForbidden(...)`. A capital after the prefix keeps out `expect`
 * itself and words like `expected`.
 */
const HELPER_NAME = /^(expect|assert)[A-Z]/;

export interface TestCase {
  /** From 1, in file order. */
  index: number;
  name: string;
  /** The describe names and the test name, joined by spaces, as snapshot keys use them. */
  fullName: string;
  line: number;
  /** The line the test's call ends on. */
  endLine: number;
  steps: TestStep[];
}

export interface TestFile {
  path: string;
  tests: TestCase[];
}

const TEST_CALLS = new Set(["test", "it"]);
const TRUTHY = new Set(["toBeDefined", "toBeTruthy", "toBeFalsy", "toBeNull", "toBeUndefined"]);
const MAX_CODE = 140;

function kindOf(matcher: string, modifiers: string[]): StepKind {
  if (/Snapshot$/.test(matcher)) return "snapshot";
  if (/^toThrow/.test(matcher) || modifiers.includes("rejects")) return "error";
  if (/^(toHaveBeen|toBeCalled|toHaveReturned|toHaveLastReturned|toHaveNthReturned|lastCalledWith|nthCalledWith)/.test(matcher)) return "mock";
  if (TRUTHY.has(matcher)) return "truthy";
  return "exact";
}

/** `test`, `it`, or `test.only` / `it.concurrent` and the like. */
function callName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) return expression.expression.text;
  return null;
}

function stringArg(node: ts.CallExpression): string | null {
  const first = node.arguments[0];
  if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) return first.text;
  return null;
}

const oneLine = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_CODE ? `${flat.slice(0, MAX_CODE - 1)}…` : flat;
};

/**
 * An assertion: `expect(x).toEqual(y)`, `expect(x).not.toBe(y)`,
 * `expect(p).rejects.toMatchSnapshot()`. Returns null for anything else.
 */
function readAssertion(node: ts.CallExpression, source: ts.SourceFile) {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const matcher = node.expression.name.text;
  const modifiers: string[] = [];
  let target: ts.Expression = node.expression.expression;
  while (ts.isPropertyAccessExpression(target)) {
    modifiers.unshift(target.name.text);
    target = target.expression;
  }
  if (!ts.isCallExpression(target) || !ts.isIdentifier(target.expression) || target.expression.text !== "expect") return null;
  const subject = target.arguments[0]?.getText(source) ?? "";
  const expected = node.arguments.map((a) => a.getText(source)).join(", ");
  const code = [subject, ...modifiers, matcher, expected].filter(Boolean).join(" ");
  return { matcher, modifiers, code: oneLine(code.replace(/^await /, "")) };
}

/**
 * @param options.helpers more assertion helpers to count as steps, for ones
 *   the naming convention does not catch; the agent names them
 */
export function parseTestFile(path: string, text: string, options: { helpers?: string[] } = {}): TestFile {
  const named = new Set(options.helpers ?? []);
  const isHelper = (name: string) => HELPER_NAME.test(name) || named.has(name);
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const tests: TestCase[] = [];
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const endLineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

  function collectSteps(body: ts.Node, test: TestCase) {
    let snapshots = 0;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && isHelper(node.expression.text)) {
        test.steps.push({
          id: `${test.index}.${test.steps.length + 1}`,
          kind: "helper",
          line: lineOf(node),
          code: oneLine(node.getText(source)),
          snapshotKey: null,
          helper: node.expression.text,
        });
        return;
      }
      if (ts.isCallExpression(node)) {
        const assertion = readAssertion(node, source);
        if (assertion) {
          const kind = kindOf(assertion.matcher, assertion.modifiers);
          test.steps.push({
            id: `${test.index}.${test.steps.length + 1}`,
            kind,
            line: lineOf(node),
            code: assertion.code,
            snapshotKey: kind === "snapshot" && !/Inline/.test(assertion.matcher) ? `${test.fullName} ${++snapshots}` : null,
            helper: null,
          });
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
  }

  function walk(node: ts.Node, describes: string[]) {
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      const title = stringArg(node);
      const body = node.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
      if (name === "describe" && title !== null && body) {
        ts.forEachChild(body, (child) => walk(child, [...describes, title]));
        return;
      }
      if (name !== null && TEST_CALLS.has(name) && title !== null && body) {
        const test: TestCase = { index: tests.length + 1, name: title, fullName: [...describes, title].join(" "), line: lineOf(node), endLine: endLineOf(node), steps: [] };
        tests.push(test);
        collectSteps(body, test);
        return;
      }
    }
    ts.forEachChild(node, (child) => walk(child, describes));
  }

  walk(source, []);
  return { path, tests };
}

/** A `.snap` file's entries, keyed as `exports[...]` names them. */
export function parseSnapshotFile(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  const pattern = /^exports\[`((?:[^`\\]|\\.)*)`\] = `((?:[^`\\]|\\.)*)`;$/gms;
  const unescape = (s: string) => s.replace(/\\([`\\$])/g, "$1");
  for (const match of text.matchAll(pattern)) {
    entries.set(unescape(match[1]!), unescape(match[2]!).replace(/^\n/, "").replace(/\n$/, ""));
  }
  return entries;
}
