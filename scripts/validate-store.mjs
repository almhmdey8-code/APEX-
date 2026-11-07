import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pages = ['index.html', 'admin.html'];
const failures = [];

function fail(message) { failures.push(message); }

for (const file of pages) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    fail(file + ': required page is missing');
    continue;
  }

  const html = fs.readFileSync(fullPath, 'utf8');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) fail(file + ': duplicate IDs: ' + duplicateIds.join(', '));

  const idSet = new Set(ids);
  const idRefs = [...new Set([...html.matchAll(/(?:\$|getElementById)\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]))];
  const missingIds = idRefs.filter(id => !idSet.has(id));
  if (missingIds.length) fail(file + ': JavaScript references missing IDs: ' + missingIds.join(', '));

  const modules = [...html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (!modules.length) fail(file + ': module script is missing');
  const inlineModules = modules.filter(match => {
    const opening = match[0].slice(0, match[0].indexOf('>') + 1);
    return !/\bsrc\s*=/.test(opening) && match[1].trim();
  });
  if (!inlineModules.length) fail(file + ': inline module script is missing');

  inlineModules.forEach((match, index) => {
    fs.writeFileSync('/tmp/apex-' + file.replace('.html', '') + '-' + index + '.mjs', match[1]);
  });

  const localRefs = [...new Set([...html.matchAll(/(?:href|src)\s*=\s*["']([^"'#?]+)(?:[?#][^"']*)?["']/gi)]
    .map(match => match[1])
    .filter(ref => !/^(?:[a-z]+:|\/\/|data:|javascript:)/i.test(ref) && ref !== '#' && !ref.startsWith('mailto:')))];
  for (const ref of localRefs) {
    const target = path.resolve(path.dirname(fullPath), ref);
    if (!target.startsWith(root + path.sep) && target !== root) {
      fail(file + ': local resource escapes repository: ' + ref);
    } else if (!fs.existsSync(target)) {
      // Firebase runtime config is intentionally local/ignored: the storefront
      // must remain deployable before the owner adds the public Web App config.
      const optionalRuntimeConfig = ref === './firebase/runtime-config.js';
      if (!optionalRuntimeConfig) fail(file + ': broken local resource: ' + ref);
    }
  }

  if (file === 'index.html') {
    const exports = new Set([...html.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(match => match[1]));
    const handlers = [...html.matchAll(/\bonclick\s*=\s*["']([^"']+)["']/gi)].map(match => match[1].trim());
    for (const handler of handlers) {
      if (/^(?:if\s*\(|document\.)/.test(handler)) continue;
      const fn = handler.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1];
      if (fn && !exports.has(fn)) fail('index.html: inline handler is not exposed on window: ' + fn);
    }
    if (/sb_secret_|service_role/i.test(html)) fail('index.html: privileged Supabase key must never be shipped to browsers');
    if (!html.includes('privacy.html')) fail('index.html: privacy policy link is missing');
  }

  if (file === 'admin.html' && !html.includes('apex_admins')) {
    fail('admin.html: server-side admin membership check is missing');
  }
}

if (failures.length) {
  console.error(failures.map(message => 'FAIL: ' + message).join('\n'));
  process.exit(1);
}
console.log('APEX storefront validation passed: required pages, IDs, local links, public-key boundary and inline handlers.');
