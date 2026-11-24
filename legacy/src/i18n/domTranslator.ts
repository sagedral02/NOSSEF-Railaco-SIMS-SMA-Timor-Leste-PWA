// Whole-system UI translation.
// Source language of the UI is Indonesian. Every text node, placeholder, title and aria-label rendered by
// React is looked up in the dictionary (Indonesian → Tetun / Português / English) and replaced in place.
// Data values (names, notes, codes) are not in the dictionary and therefore stay untouched.
// Original Indonesian text is remembered per node so switching languages (including back to Indonesian) is lossless.
import type { Lang } from '../lib/i18n';
import { DICT, PATTERNS } from './dictionary';

const IDX: Record<Exclude<Lang, 'id'>, 0 | 1 | 2> = { tet: 0, pt: 1, en: 2 };
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);
// Month abbreviations produced by fmtDate (Indonesian) and relative times.
const MONTHS: Record<string, [string, string, string]> = { Mei: ['Mai', 'Mai', 'May'], Agu: ['Ago', 'Ago', 'Aug'], Okt: ['Out', 'Out', 'Oct'], Out: ['Out', 'Out', 'Oct'], Des: ['Dez', 'Dez', 'Dec'] };

let lang: Lang = 'id';
const original = new WeakMap<Text, string>(); // node -> Indonesian source text
const rendered = new WeakMap<Text, string>(); // node -> text we last wrote
const attrOriginal = new WeakMap<Element, Record<string, string>>();
const attrRendered = new WeakMap<Element, Record<string, string>>();

const LEAD = /^[\s·—|:.,(\-–]+/;
const TRAIL = /[\s·—|:,(\-–]+$/;

function lookup(core: string, i: 0 | 1 | 2): string | null {
  const hit = DICT.get(core);
  if (hit) return hit[i];
  for (const p of PATTERNS) {
    const m = core.match(p.re);
    if (m) return p.out[i].replace(/\$(\d)/g, (_, n) => translatePiece(m[Number(n)] ?? '', i));
  }
  return null;
}
/** Captured groups may themselves be translatable (e.g. error messages after a code). */
function translatePiece(s: string, i: 0 | 1 | 2) {
  return lookup(s.trim(), i) ?? s;
}
export function translateText(src: string, l: Lang = lang): string {
  if (l === 'id' || !src.trim()) return src;
  const i = IDX[l];
  const lead = src.match(LEAD)?.[0] ?? '';
  const rest = src.slice(lead.length);
  const trail = rest.match(TRAIL)?.[0] ?? '';
  const core = rest.slice(0, rest.length - trail.length);
  let out = core ? lookup(core, i) : null;
  if (out == null) {
    // Try the full string with punctuation (some entries include it), then fall back to month/relative-time fixes.
    out = lookup(src.trim(), i);
    if (out != null) return src.replace(src.trim(), out);
    out = core;
  }
  out = out
    .replace(/\b(\d{1,2}) (Mei|Agu|Okt|Out|Des) (\d{4})\b/g, (_, d, mo, y) => `${d} ${MONTHS[mo][i]} ${y}`)
    .replace(/^baru saja$/, ['agora daudauk', 'agora mesmo', 'just now'][i])
    .replace(/^(\d+) (mnt|jam|hari) lalu$/, (_, n, u) => {
      const units = { mnt: ['minutu liu ba', 'min atrás', 'min ago'], jam: ['oras liu ba', 'h atrás', 'h ago'], hari: ['loron liu ba', 'dias atrás', 'days ago'] } as Record<string, string[]>;
      return `${n} ${units[u][i]}`;
    });
  return lead + out + trail;
}

function skip(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP.has(e.tagName) || e.hasAttribute('data-no-i18n')) return true;
  }
  return false;
}
function handleText(node: Text) {
  const cur = node.nodeValue ?? '';
  if (rendered.get(node) !== cur) original.set(node, cur); // React (or someone) wrote new source text
  const src = original.get(node) ?? cur;
  const next = translateText(src);
  if (next !== cur) node.nodeValue = next;
  rendered.set(node, next);
}
function handleAttrs(el: Element) {
  const orig = attrOriginal.get(el) ?? {};
  const rend = attrRendered.get(el) ?? {};
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur == null) continue;
    if (rend[a] !== cur) orig[a] = cur;
    const next = translateText(orig[a] ?? cur);
    if (next !== cur) el.setAttribute(a, next);
    rend[a] = next;
  }
  attrOriginal.set(el, orig);
  attrRendered.set(el, rend);
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { if (!skip(root.parentElement)) handleText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skip(el)) return;
  handleAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) { if (!skip(n.parentElement)) handleText(n as Text); }
    else if (!skip(n as Element)) handleAttrs(n as Element);
  }
}

let observer: MutationObserver | null = null;
export function startDomTranslator(initial: Lang) {
  lang = initial;
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') { const t = m.target as Text; if (!skip(t.parentElement)) handleText(t); }
      else if (m.type === 'attributes') { if (!skip(m.target as Element)) handleAttrs(m.target as Element); }
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.body);
}
export function setDomLanguage(next: Lang) {
  lang = next;
  document.documentElement.lang = next === 'tet' ? 'tet' : next;
  walk(document.body);
}
