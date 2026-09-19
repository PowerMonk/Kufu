// eval/selector.ts - Tiny CSS-subset selector matcher for Layer 1.
//
// Supports a deliberately small subset, by design:
//   - tag names           : "section"
//   - class selectors      : ".foo"
//   - id selectors         : "#bar"
//   - comma-separated OR  : "header, .hero, .banner"
//
// Combinators (>, +, ~) and attribute selectors ([type=...]) are
// intentionally NOT supported. If a manifest needs them, we extend
// this file. Keeping the subset small means Layer 1 is explainable
// and the evaluator returns quickly even on the small model outputs.
//
// API:
//   const matches = matchAll(selector, document);
//   matches === number of DOM nodes that satisfy the selector.
//   matchOne returns true/false for a single selector against a single node.

import type { AnyNode, Element } from "domhandler";

/** Splits a top-level comma-separated selector into individual selectors. */
export function splitOr(selector: string): string[] {
  return selector
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Matches a single (non-comma) selector against an element.
 * Returns true if the element matches; false otherwise.
 */
export function nodeMatchesSingle(node: Element, selector: string): boolean {
  if (!node || node.type !== "tag") return false;
  const sel = selector.trim();
  if (!sel) return false;

  const classes = (node.attribs?.class ?? "").split(/\s+/).filter(Boolean);
  const id = node.attribs?.id ?? "";
  const tag = (node.name ?? "").toLowerCase();

  // Pure tag selector.
  if (!sel.startsWith(".") && !sel.startsWith("#")) {
    return tag === sel.toLowerCase();
  }

  // Class or id selector.
  if (sel.startsWith(".")) {
    const wanted = sel.slice(1).toLowerCase();
    return classes.map((c) => c.toLowerCase()).includes(wanted);
  }
  if (sel.startsWith("#")) {
    return id === sel.slice(1);
  }
  return false;
}

/**
 * Counts how many elements across `document` (recursively) match the
 * given OR-separated selector. Walks the tree because tasks often
 * need to count nested elements like <article> in <main>.
 */
export function countMatches(selector: string, document: AnyNode[]): number {
  const parts = splitOr(selector);
  let n = 0;
  const walk = (node: AnyNode): void => {
    if (!node) return;
    if (node.type === "tag") {
      for (const part of parts) {
        if (nodeMatchesSingle(node, part)) {
          n++;
          break;
        }
      }
    }
    const children = (node as { children?: AnyNode[] }).children;
    if (Array.isArray(children)) {
      for (const c of children) walk(c);
    }
  };
  for (const root of document) walk(root);
  return n;
}

/**
 * Returns true if any element in `document` matches `selector`.
 * Used by `element` requirement type.
 */
export function existsMatch(selector: string, document: AnyNode[]): boolean {
  const parts = splitOr(selector);
  const walk = (node: AnyNode): boolean => {
    if (!node) return false;
    if (node.type === "tag") {
      for (const part of parts) {
        if (nodeMatchesSingle(node, part)) return true;
      }
    }
    const children = (node as { children?: AnyNode[] }).children;
    if (Array.isArray(children)) {
      for (const c of children) {
        if (walk(c)) return true;
      }
    }
    return false;
  };
  for (const root of document) {
    if (walk(root)) return true;
  }
  return false;
}

/**
 * Finds the first element matching `selector` (single OR-combined).
 * Used by `attr` requirement type.
 */
export function findFirst(selector: string, document: AnyNode[]): Element | null {
  const parts = splitOr(selector);
  const walk = (node: AnyNode): Element | null => {
    if (!node) return null;
    if (node.type === "tag") {
      for (const part of parts) {
        if (nodeMatchesSingle(node, part)) return node;
      }
    }
    const children = (node as { children?: AnyNode[] }).children;
    if (Array.isArray(children)) {
      for (const c of children) {
        const r = walk(c);
        if (r) return r;
      }
    }
    return null;
  };
  for (const root of document) {
    const r = walk(root);
    if (r) return r;
  }
  return null;
}

