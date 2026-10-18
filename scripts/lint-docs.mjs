import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename, relative } from 'node:path';
import { marked } from 'marked';
import { parse } from 'yaml';

// Portable quality gate for the Living Docs mechanical invariants. Markdown and
// YAML parsing belong to maintained parsers, not a second document grammar.
const root = resolve('docs');
const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.md'));
const links = new Map();
const errors = [];
for (const file of files) {
  const path = resolve(root, file);
  const body = await readFile(path, 'utf8');
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const reserved = ['index.md', 'log.md'].includes(basename(file));
  try {
    const metadata = match ? parse(match[1]) : null;
    if (!reserved && !metadata?.type) errors.push(`${file}: missing type`);
    if (reserved && metadata && !(file === 'index.md' && metadata.okf_version)) {
      errors.push(`${file}: reserved index has frontmatter`);
    }
    if (metadata?.status?.toLowerCase() === 'superseded') {
      const siblings = await readdir(dirname(path));
      if (!metadata.superseded_by || !siblings.some((name) => name.startsWith(`${metadata.superseded_by}-`))) {
        errors.push(`${file}: missing superseding record`);
      }
    }
  } catch (error) { errors.push(`${file}: ${error.message}`); }
  const targets = [];
  marked.walkTokens(marked.lexer(match ? body.slice(match[0].length) : body), (token) => {
    if (!['link', 'image'].includes(token.type)) return;
    const href = token.href.split('#')[0];
    if (!href || /^[a-z][a-z\d+.-]*:/i.test(href)) return;
    let decoded;
    try { decoded = decodeURI(href); }
    catch { errors.push(`${file}: invalid link URI ${href}`); return; }
    const target = href.startsWith('/') ? resolve(root, `.${decoded}`) : resolve(dirname(path), decoded);
    targets.push(target);
    if (!existsSync(target)) errors.push(`${file}: broken link ${href}`);
  });
  links.set(path, targets);
}
const rootIndex = resolve(root, 'index.md');
if (!links.has(rootIndex)) errors.push('Missing docs/index.md');
const reached = new Set();
function visit(index) {
  if (reached.has(index)) return;
  reached.add(index);
  for (const target of links.get(index) ?? []) {
    if (basename(target) === 'index.md') visit(target);
  }
}
visit(rootIndex);
for (const [file] of links) {
  if (basename(file) === 'index.md') {
    if (!reached.has(file)) errors.push(`${relative(root, file)}: unreachable index`);
  } else if (file !== resolve(root, 'constitution.md') && basename(file) !== 'log.md') {
    const index = resolve(dirname(file), 'index.md');
    if (!links.get(index)?.includes(file)) errors.push(`${relative(root, file)}: orphan concept`);
  }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Documentation: ${files.length} files, no mechanical invariant violations.`);
