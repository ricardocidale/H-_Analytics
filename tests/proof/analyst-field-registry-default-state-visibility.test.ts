/**
 * Analyst FIELD_REGISTRY default-state visibility audit (task #781).
 *
 * Background — the third silent-failure mode in the Analyst Adjust deep-link
 * chain. Two prior audits already cover:
 *   - `analyst-field-registry-mount-points.test.ts` (task #760/#771): every
 *     registered `mountPoint` slug resolves AND every field id has a marker
 *     somewhere under `client/src/`.
 *   - `analyst-deep-link-destination-marker.test.ts` (task #771): the marker
 *     lives in the file that actually hosts the registered `mountPoint`
 *     (catches "marker is on the wrong page" drift).
 *
 * Both audits are static-source matches against attribute literals — they
 * cannot see whether the marker is *visible* at runtime. A field marker can
 * exist in source on the right page yet be gated behind a default-off
 * `useState(...)` toggle, e.g. ConvertibleTermsCard wraps `capitalRaiseValuationCap`
 * inside `{showValuationCap && (...)}` where `showValuationCap` is initialised
 * from `(formData.X ?? global.X) > 0`. With default state (no existing value)
 * the gate is false → the marker is not in the DOM → the focus hook silently
 * exhausts its retry budget.
 *
 * Task #776 added a runtime dev-mode warning for this exact failure, but the
 * warning only fires when a developer happens to click Adjust on the affected
 * field. This audit moves the same check to PR time: for every registered
 * field, walk the destination file's AST, find each marker location, and
 * walk up from the marker to assert it is not gated by any default-off
 * conditional render.
 *
 * Implementation:
 *   - Static AST walk via the TypeScript compiler API (no jsdom rendering).
 *     The destination components depend on contexts/queries/auth that are
 *     painful to fixture; the AST walk gets the same answer with a
 *     fraction of the plumbing because the only thing we care about is
 *     whether the marker's JSX ancestors include a `{<expr> && (...)}`
 *     gate that is provably false at default state.
 *
 *   - "Default false" classification:
 *       * Literal `false`, `null`, `undefined`, `0`, `""`, `NaN`.
 *       * Identifier whose declaration is a `const x = <init>` and `<init>`
 *         classifies as default-false (recursive lookup, same file only).
 *       * Identifier destructured from `useState(<init>)` where `<init>`
 *         classifies as default-false.
 *       * Comparison expressions (`>`, `<`, `>=`, `<=`, `===`, `!==`,
 *         `==`, `!=`) — the ConvertibleTermsCard pattern
 *         `(formData.x ?? global.x) > 0` falls in this bucket. At default
 *         state both sides are unset/zero so the comparison resolves
 *         falsy; we conservatively treat any comparison whose constant
 *         operand is zero/null/empty as default-false.
 *       * Logical `!<default-true>` flips to default-false.
 *
 *   - Per-marker test: walk parents from the marker's JsxAttribute to its
 *     containing JsxElement, then up the JSX tree. Each ancestor that is a
 *     `JsxExpression` whose expression is a `BinaryExpression` with `&&`
 *     contributes a gate (the LHS). If any gate is default-false, the
 *     marker is hidden by default → violation.
 *
 *   - Markers we accept (matches the focus hook's two conventions):
 *       1. `data-field="<id>"` — direct attribute (Company Assumptions style).
 *       2. `data-testid="field-<id>"` — direct attribute (admin Model-Defaults
 *          when not going through a helper).
 *       3. `testId="field-<id>"` — prop forwarded by `PctField` /
 *          `DollarField` / `NumberField` etc. through `data-testid={testId}`
 *          (see `client/src/components/admin/model-defaults/FieldHelpers.tsx`).
 *
 * Adding a new destination file:
 *   Add an entry to `MOUNT_POINT_DESTINATIONS` mapping the registry slug to
 *   the file(s) that legitimately host its markers — same pattern the
 *   sibling deep-link audit uses. A registered slug not present in the map
 *   is skipped with a warning so this audit does not double-fail when the
 *   sibling map is stale.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import * as ts from "typescript";
import { FIELD_REGISTRY } from "../../engine/analyst/registry/field-registry";

const ROOT = join(__dirname, "../..");

/**
 * Slug → destination file(s). Mirrors the structure used by
 * `analyst-deep-link-destination-marker.test.ts` but kept independent so
 * this audit does not silently break when that map drifts: an unmapped slug
 * here is reported as a soft skip (not a hard failure), letting the sibling
 * test own the "map is incomplete" complaint.
 */
const MOUNT_POINT_DESTINATIONS: Readonly<Record<string, readonly string[]>> = {
  "company-assumptions/funding": [
    "client/src/components/company-assumptions/FundingSection.tsx",
  ],
  "defaults/revenue": [
    "client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx",
  ],
  "defaults/management-company": [
    "client/src/components/admin/model-defaults/CompanyTab.tsx",
  ],
  "defaults/market-macro": [
    "client/src/components/admin/model-defaults/MarketMacroTab.tsx",
  ],
  "defaults/property": [
    "client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx",
  ],
};

interface ParsedDestination {
  readonly path: string;
  readonly source: string;
  readonly sourceFile: ts.SourceFile;
}

/** Parse a destination file once and cache the resulting SourceFile. */
const parsedCache = new Map<string, ParsedDestination>();
function parseDestination(rel: string): ParsedDestination | null {
  const cached = parsedCache.get(rel);
  if (cached) return cached;
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  const source = readFileSync(abs, "utf-8");
  const sourceFile = ts.createSourceFile(
    abs,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const parsed = { path: rel, source, sourceFile };
  parsedCache.set(rel, parsed);
  return parsed;
}

/**
 * Read the literal text value of a JsxAttribute initializer when it is a
 * plain string literal — handles both `attr="foo"` and `attr={"foo"}`.
 * Returns null for non-literal initializers (e.g. dynamic expressions),
 * which are intentionally out of scope: we only audit static markers, and
 * a dynamic marker value would also be invisible to the sibling string-
 * matching audits.
 */
function readStringAttribute(attr: ts.JsxAttribute): string | null {
  const init = attr.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const expr = init.expression;
    if (ts.isStringLiteral(expr)) return expr.text;
    if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  }
  return null;
}

/**
 * Find every JsxAttribute that registers `fieldId` as a marker — accepts
 * the three conventions documented in the file header.
 */
function findMarkerAttributes(
  sourceFile: ts.SourceFile,
  fieldId: string,
): ts.JsxAttribute[] {
  const expectedTestId = `field-${fieldId}`;
  const out: ts.JsxAttribute[] = [];
  function visit(node: ts.Node): void {
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      const value = readStringAttribute(node);
      if (value !== null) {
        if (name === "data-field" && value === fieldId) {
          out.push(node);
        } else if (
          (name === "data-testid" || name === "testId") &&
          value === expectedTestId
        ) {
          out.push(node);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return out;
}

/**
 * Three-state classification: a node's truthiness at default state.
 *   - "false": provably false at default state (gate hides the body).
 *   - "true":  provably truthy at default state (gate is open).
 *   - "unknown": cannot be determined statically — treated as not-failing
 *     so the audit stays conservative and avoids false positives on
 *     legitimate run-time gates we have no static signal about.
 */
type Truthiness = "false" | "true" | "unknown";

const COMPARISON_OPS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

/**
 * Recognise the literal "zero-ish" right-hand-side of a comparison gate.
 * Pattern: `(formData.x ?? global.x) > 0`. Treating only zero/null/empty
 * comparisons as default-false keeps the heuristic narrow — comparing
 * against `true`/non-zero literals is rarer and would over-trigger.
 */
function isZeroish(node: ts.Expression): boolean {
  if (ts.isNumericLiteral(node)) return node.text === "0";
  if (ts.isStringLiteral(node)) return node.text === "";
  if (ts.isPrefixUnaryExpression(node)) {
    // `-0` parses as a prefix expression; treat as zero too.
    if (
      node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand) &&
      node.operand.text === "0"
    ) {
      return true;
    }
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(node) && node.text === "undefined") return true;
  return false;
}

/**
 * Look up the variable declaration for `name` in the same source file and
 * return its initializer plus a hint whether it was destructured from
 * `useState(...)`. Used by `classifyExpr` so an identifier gate (`showFoo`)
 * can be resolved to its initial value.
 */
interface Declaration {
  readonly initializer: ts.Expression;
  readonly fromUseState: boolean;
}

function findDeclaration(
  sourceFile: ts.SourceFile,
  name: string,
): Declaration | null {
  let found: Declaration | null = null;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isVariableDeclaration(node)) {
      // const x = <init>
      if (ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
        found = { initializer: node.initializer, fromUseState: false };
        return;
      }
      // const [x, setX] = useState(<init>)
      if (
        ts.isArrayBindingPattern(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "useState"
      ) {
        for (const element of node.name.elements) {
          if (
            ts.isBindingElement(element) &&
            ts.isIdentifier(element.name) &&
            element.name.text === name &&
            // Only the first element (the value, not the setter) reflects
            // the initial state.
            node.name.elements[0] === element
          ) {
            const initArg = node.initializer.arguments[0];
            if (initArg) {
              found = { initializer: initArg, fromUseState: true };
              return;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/**
 * Classify an expression's truthiness at default state. The three return
 * states intentionally distinguish "provably false" from "don't know":
 * only the former triggers a violation.
 */
function classifyExpr(
  expr: ts.Expression,
  sourceFile: ts.SourceFile,
  visited: Set<string>,
): Truthiness {
  // Literals first.
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return "false";
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (expr.kind === ts.SyntaxKind.NullKeyword) return "false";
  if (ts.isNumericLiteral(expr)) return expr.text === "0" ? "false" : "true";
  if (ts.isStringLiteral(expr)) return expr.text === "" ? "false" : "true";
  if (ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text === "" ? "false" : "true";
  }

  // Identifier — `undefined` is a literal here, otherwise look up the decl.
  if (ts.isIdentifier(expr)) {
    if (expr.text === "undefined" || expr.text === "NaN") return "false";
    if (visited.has(expr.text)) return "unknown"; // guard recursion cycles
    const next = new Set(visited).add(expr.text);
    const decl = findDeclaration(sourceFile, expr.text);
    if (!decl) return "unknown";
    return classifyExpr(decl.initializer, sourceFile, next);
  }

  // Logical NOT flips classification (and only `false` flips to `true`).
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const inner = classifyExpr(expr.operand, sourceFile, visited);
    if (inner === "false") return "true";
    if (inner === "true") return "false";
    return "unknown";
  }

  // Parenthesised — descend.
  if (ts.isParenthesizedExpression(expr)) {
    return classifyExpr(expr.expression, sourceFile, visited);
  }

  // BinaryExpression — handle && / || / ?? / comparison.
  if (ts.isBinaryExpression(expr)) {
    const opKind = expr.operatorToken.kind;
    if (opKind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const left = classifyExpr(expr.left, sourceFile, visited);
      const right = classifyExpr(expr.right, sourceFile, visited);
      if (left === "false" || right === "false") return "false";
      if (left === "true" && right === "true") return "true";
      return "unknown";
    }
    if (opKind === ts.SyntaxKind.BarBarToken) {
      const left = classifyExpr(expr.left, sourceFile, visited);
      const right = classifyExpr(expr.right, sourceFile, visited);
      if (left === "true" || right === "true") return "true";
      if (left === "false" && right === "false") return "false";
      return "unknown";
    }
    if (opKind === ts.SyntaxKind.QuestionQuestionToken) {
      // For `x ?? y`, the result is `y` only when `x` is null/undefined.
      // Statically we cannot know `x`, so we just check the RHS.
      return classifyExpr(expr.right, sourceFile, visited);
    }
    if (COMPARISON_OPS.has(opKind)) {
      // Pattern-match the ConvertibleTermsCard gate:
      //   `(formData.x ?? global.x) > 0`
      // At default state both sides of the `??` are unset → comparison is
      // false. We narrow this rule to comparisons whose RHS is a "zero-ish"
      // literal so unrelated comparisons (e.g. `tabIndex === 2`) stay
      // "unknown" and don't trigger false positives.
      if (isZeroish(expr.right) || isZeroish(expr.left)) {
        return "false";
      }
      return "unknown";
    }
  }

  return "unknown";
}

/**
 * Walk JSX ancestors of `marker` upward and collect every gate expression
 * (the LHS of an `&&` inside a JsxExpression) that wraps it. The returned
 * gates are in inside-out order; only their truthiness matters so the
 * order is incidental.
 */
function collectJsxAndGates(marker: ts.Node): ts.Expression[] {
  const gates: ts.Expression[] = [];
  let cur: ts.Node | undefined = marker.parent;
  while (cur) {
    if (
      ts.isJsxExpression(cur) &&
      cur.expression &&
      ts.isBinaryExpression(cur.expression) &&
      cur.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      // The JsxExpression body is the right-hand side of the `&&`. The
      // marker must descend from the RHS — otherwise the gate doesn't
      // actually wrap it. (Defensive against a marker accidentally living
      // in the LHS, which would not be hidden by the `&&`.)
      const rhs = cur.expression.right;
      if (containsNode(rhs, marker)) {
        gates.push(cur.expression.left);
      }
    }
    cur = cur.parent;
  }
  return gates;
}

function containsNode(root: ts.Node, target: ts.Node): boolean {
  let found = false;
  function visit(n: ts.Node): void {
    if (found) return;
    if (n === target) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  }
  visit(root);
  return found;
}

interface Violation {
  readonly fieldId: string;
  readonly mountPoint: string;
  readonly destinationPath: string;
  readonly markerLine: number;
  readonly gateText: string;
}

/**
 * Self-test fixture used by the synthetic-detection assertion below.
 * The fixture intentionally exercises every detection branch
 * (`useState(false)`, `useState(<comparison-via-const>)`, plain
 * `useState(true)` for a negative control) on three synthetic markers so
 * a future refactor of `classifyExpr` / `collectJsxAndGates` either keeps
 * them all working or fails loudly with a precise pinpoint.
 */
const SELF_TEST_SOURCE = `
import { useState } from "react";
function Comp({ formData, global }: any) {
  const hasA = (formData.a ?? global.a) > 0;
  const [showA, setShowA] = useState(hasA);
  const [showB, setShowB] = useState(false);
  const [showC, setShowC] = useState(true);
  return (
    <div>
      {showA && (<input data-field="hiddenByCompareGate" />)}
      {showB && (<input data-testid="field-hiddenByLiteralFalseGate" />)}
      {showC && (<input data-field="visibleByLiteralTrueGate" />)}
      <input data-field="visibleNoGate" />
      <input testId="field-visibleNoGate2" />
    </div>
  );
}
`;

function classifySelfTestField(fieldId: string): Truthiness | "no-marker" {
  const sf = ts.createSourceFile(
    "self-test.tsx",
    SELF_TEST_SOURCE,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const markers = findMarkerAttributes(sf, fieldId);
  if (markers.length === 0) return "no-marker";
  // Roll up: if any gate is "false" the marker is hidden.
  const allHidden = markers.every((marker) => {
    const gates = collectJsxAndGates(marker);
    return gates.some((gate) => classifyExpr(gate, sf, new Set()) === "false");
  });
  if (allHidden) return "false";
  // No marker is hidden — the audit would not flag it.
  return "true";
}

describe("Analyst FIELD_REGISTRY default-state visibility audit", () => {
  const ENTRIES = Object.entries(FIELD_REGISTRY);

  it("self-test: detection catches markers behind default-off useState gates", () => {
    // The two known-bad fixtures must both resolve as hidden — one via the
    // `(formData.x ?? global.x) > 0` comparison-through-const pattern that
    // ConvertibleTermsCard uses, and one via a plain literal `false` gate.
    expect(classifySelfTestField("hiddenByCompareGate")).toBe("false");
    expect(classifySelfTestField("hiddenByLiteralFalseGate")).toBe("false");
  });

  it("self-test: detection does not flag markers visible at default state", () => {
    // Negative controls — the audit must not flag literal-`true` gates or
    // markers with no gate at all, otherwise it would block legitimate
    // conditional UI.
    expect(classifySelfTestField("visibleByLiteralTrueGate")).toBe("true");
    expect(classifySelfTestField("visibleNoGate")).toBe("true");
    expect(classifySelfTestField("visibleNoGate2")).toBe("true");
  });

  it("has at least one registered field (sanity check)", () => {
    // Mirrors the sibling audits — guards against a refactor that empties
    // FIELD_REGISTRY, which would make every assertion below vacuously
    // pass and silently disable the check.
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it("every registered field's marker is visible at default state on its destination surface", () => {
    const violations: Violation[] = [];

    for (const [fieldId, entry] of ENTRIES) {
      const destPaths = MOUNT_POINT_DESTINATIONS[entry.mountPoint];
      // Soft-skip slugs not in our local map. The sibling deep-link audit
      // owns the "destination map is incomplete" failure — duplicating it
      // here would just double-noise the output when the sibling is stale.
      if (!destPaths) continue;

      for (const rel of destPaths) {
        const dest = parseDestination(rel);
        // Same soft-skip rationale: missing files are the sibling's
        // failure to surface.
        if (!dest) continue;

        const markers = findMarkerAttributes(dest.sourceFile, fieldId);
        // No marker in this file — sibling test catches "marker absent
        // entirely". This audit only fires on the hidden-by-gate failure
        // mode, so an absent marker here is also a soft-skip.
        if (markers.length === 0) continue;

        // A field is hidden-by-default if EVERY marker it has in this
        // file is wrapped in at least one default-false gate. If even one
        // marker is unconditionally rendered, the focus hook will find it.
        const allHidden = markers.every((marker) => {
          const gates = collectJsxAndGates(marker);
          return gates.some(
            (gate) => classifyExpr(gate, dest.sourceFile, new Set()) === "false",
          );
        });
        if (!allHidden) continue;

        // Surface a representative gate from the first marker for the
        // error message — enough signal for a developer to find the
        // offending toggle without dumping the whole AST.
        const firstMarker = markers[0];
        const firstGate = collectJsxAndGates(firstMarker).find(
          (g) => classifyExpr(g, dest.sourceFile, new Set()) === "false",
        );
        const lineCol = dest.sourceFile.getLineAndCharacterOfPosition(
          firstMarker.getStart(dest.sourceFile),
        );
        violations.push({
          fieldId,
          mountPoint: entry.mountPoint,
          destinationPath: rel,
          markerLine: lineCol.line + 1,
          gateText: firstGate ? firstGate.getText(dest.sourceFile) : "(unknown)",
        });
        // First destination that hides the marker is enough to report.
        break;
      }
    }

    if (violations.length > 0) {
      const lines = violations.map(
        (v) =>
          `  - "${v.fieldId}" (mountPoint="${v.mountPoint}") in ` +
          `${v.destinationPath}:${v.markerLine} is gated by ` +
          `\`{${v.gateText} && (...)}\` which is false at default state.`,
      );
      throw new Error(
        "FIELD_REGISTRY entries have a marker on the right destination " +
          "surface, but the marker is wrapped in a default-off conditional " +
          "render. The Analyst's 'Adjust' CTA will land on the right page, " +
          "the focus hook will retry, and silently exhaust its budget — the " +
          "user sees nothing happen (this is the runtime failure task #776 " +
          "warns about; this audit catches it at PR time):\n" +
          lines.join("\n") +
          "\n\nFix one of the following:\n" +
          "  - Render the marker outside the conditional block (e.g. keep " +
          "the input mounted and toggle a `disabled` attribute or " +
          "visibility class instead of unmounting it).\n" +
          "  - Move the field marker onto a wrapper element that is " +
          "always rendered (a `<span data-field=\"<id>\">` outside the " +
          "`{showFoo && ...}` block, with the input rendered conditionally " +
          "inside).\n" +
          "  - If the field is genuinely opt-in and should not be focusable " +
          "until the toggle is enabled, remove it from FIELD_REGISTRY (the " +
          "Analyst should not be promising an Adjust CTA for an invisible " +
          "field).",
      );
    }
  });
});
