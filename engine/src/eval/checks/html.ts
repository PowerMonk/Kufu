// eval/checks/html.ts - Individual HTML structural checks.
//
// Each check is `(output: string) => CheckResult`. They're aggregated
// by `eval/layers/structural.ts`. These checks are pure-string /
// regex-based; they don't need a DOM. Where a DOM helps (e.g.
// duplicate-id detection, heading hierarchy), we use htmlparser2.

import { parseDocument } from "htmlparser2";

import type { CheckResult } from "../contract.ts";

export type HtmlCheck = (output: string) => CheckResult;

/** 1. The output must start with <!DOCTYPE html>. */
export const hasDoctype: HtmlCheck = (output) => {
  const pass = /^\s*<!doctype\s+html/i.test(output);
  return {
    id: "has_doctype",
    pass,
    detail: pass ? undefined : "no <!DOCTYPE html> declaration",
  };
};

/** 2. The root <html> tag must have a non-empty lang attribute. */
export const hasHtmlLang: HtmlCheck = (output) => {
  const m = output.match(/<html\b([^>]*)>/i);
  const lang = m?.[1] ? /\blang\s*=\s*"([^"]+)"/i.exec(m[1]) : null;
  const pass = !!(lang && lang[1].trim().length > 0);
  return {
    id: "has_html_lang",
    pass,
    detail: pass ? undefined : '<html lang="..."> missing or empty',
  };
};

/** 3. There must be exactly one <title> in <head> with non-empty content. */
export const hasTitle: HtmlCheck = (output) => {
  const titles = [...output.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  const nonEmpty = titles.find((m) => m[1].trim().length > 0);
  const pass = titles.length === 1 && !!nonEmpty;
  return {
    id: "has_title",
    pass,
    detail:
      titles.length === 0
        ? "no <title>"
        : titles.length > 1
          ? "multiple <title> tags"
          : "<title> is empty",
  };
};

/** 4. <meta charset> must be present. */
export const hasMetaCharset: HtmlCheck = (output) => {
  const pass = /<meta\b[^>]*\bcharset\s*=/i.test(output);
  return {
    id: "has_meta_charset",
    pass,
    detail: pass ? undefined : "no <meta charset>",
  };
};

/** 5. <meta name="viewport"> must be present. */
export const hasViewport: HtmlCheck = (output) => {
  const pass = /<meta\b[^>]*\bname\s*=\s*"viewport"/i.test(output);
  return {
    id: "has_viewport",
    pass,
    detail: pass ? undefined : 'no <meta name="viewport">',
  };
};

/** 6. Every <img> must have a non-empty alt attribute. */
export const imagesHaveAlt: HtmlCheck = (output) => {
  const imgs = [...output.matchAll(/<img\b([^>]*)>/gi)];
  if (imgs.length === 0) {
    return { id: "images_have_alt", pass: true, detail: "no <img> tags" };
  }
  const missing = imgs.filter((m) => !/\balt\s*=\s*"[^"]*"/i.test(m[1]));
  const pass = missing.length === 0;
  return {
    id: "images_have_alt",
    pass,
    detail: pass ? undefined : `${missing.length}/${imgs.length} <img> missing alt`,
  };
};

/** 7. Interactive handlers should live on <button>, not on generic elements. */
export const buttonsNotDivs: HtmlCheck = (output) => {
  const bad = [...output.matchAll(/<(?!button\b)[a-z][a-z0-9]*\b[^>]*\bon\w+\s*=/gi)];
  const pass = bad.length === 0;
  return {
    id: "buttons_not_divs",
    pass,
    detail: pass
      ? undefined
      : `${bad.length} inline event handler(s) on non-button elements`,
  };
};

/** 8. Every <a> must have an href. */
export const linksHaveHref: HtmlCheck = (output) => {
  const links = [...output.matchAll(/<a\b([^>]*)>/gi)];
  if (links.length === 0) {
    return { id: "links_have_href", pass: true, detail: "no <a> tags" };
  }
  const missing = links.filter((m) => !/\bhref\s*=\s*"[^"]*"/i.test(m[1]));
  const pass = missing.length === 0;
  return {
    id: "links_have_href",
    pass,
    detail: pass ? undefined : `${missing.length}/${links.length} <a> missing href`,
  };
};

/** 9. No duplicate id attributes across the document. */
export const noDuplicateIds: HtmlCheck = (output) => {
  const ids = [
    ...output.matchAll(/\bid\s*=\s*"([^"]+)"/g),
  ].map((m) => m[1]);
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  const pass = dupes.size === 0;
  return {
    id: "no_duplicate_ids",
    pass,
    detail: pass ? undefined : `duplicate id(s): ${[...dupes].join(", ")}`,
  };
};

/** 10. Heading levels must not skip (h1 -> h3 without h2). */
export const headingHierarchy: HtmlCheck = (output) => {
  const doc = parseDocument(output);
  const levels: number[] = [];
  const walk = (node: any): void => {
    if (!node) return;
    if (node.type === "tag" && /^h[1-6]$/i.test(node.name)) {
      levels.push(parseInt(node.name[1], 10));
    }
    if (Array.isArray(node.children)) for (const c of node.children) walk(c);
  };
  walk(doc);
  if (levels.length === 0) return { id: "heading_hierarchy", pass: true };
  let last = 0;
  const violations: string[] = [];
  for (const lv of levels) {
    if (last !== 0 && lv > last + 1) {
      violations.push(`h${last} -> h${lv}`);
    }
    last = lv;
  }
  const pass = violations.length === 0;
  return {
    id: "heading_hierarchy",
    pass,
    detail: pass ? undefined : `skipped levels: ${violations.join(", ")}`,
  };
};

/** 11. No purely-empty elements (whitespace-only div/p/span). */
export const noEmptyElements: HtmlCheck = (output) => {
  const re = /<(div|p|span|section|article)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const empties: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) {
    if (m[3].trim().length === 0) empties.push(m[1].toLowerCase());
  }
  const pass = empties.length === 0;
  return {
    id: "no_empty_elements",
    pass,
    detail: pass ? undefined : `${empties.length} empty <${empties[0] ?? "?"}>`,
  };
};

/** 12. No inline event handlers at all (onclick, onload, etc.). */
export const noInlineEventHandlers: HtmlCheck = (output) => {
  const handlers = [...output.matchAll(/\b(on\w+)\s*=\s*"/gi)].map(
    (m) => m[1],
  );
  const pass = handlers.length === 0;
  return {
    id: "no_inline_event_handlers",
    pass,
    detail: pass ? undefined : `${handlers.length} inline handler(s): ${[...new Set(handlers)].join(", ")}`,
  };
};

/** All structural HTML checks in evaluation order. */
export const HTML_CHECKS: HtmlCheck[] = [
  hasDoctype,
  hasHtmlLang,
  hasTitle,
  hasMetaCharset,
  hasViewport,
  imagesHaveAlt,
  buttonsNotDivs,
  linksHaveHref,
  noDuplicateIds,
  headingHierarchy,
  noEmptyElements,
  noInlineEventHandlers,
];
