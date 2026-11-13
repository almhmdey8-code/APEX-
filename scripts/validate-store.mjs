import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const pages = ['index.html', 'admin.html', 'product-studio.html'];
const failures = [];
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-validation-'));

function fail(message) { failures.push(message); }

try {
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
      const tempFile = path.join(tempDir, file.replace('.html', '') + '-' + index + '.mjs');
      fs.writeFileSync(tempFile, match[1], 'utf8');
      const checked = spawnSync(process.execPath, ['--check', tempFile], { encoding: 'utf8' });
      if (checked.status !== 0) {
        const detail = (checked.stderr || checked.stdout || 'unknown syntax error').trim();
        fail(file + ': JavaScript module syntax error (' + detail + ')');
      }
    });

    const localRefs = [...new Set([...html.matchAll(/(?:href|src)\s*=\s*["']([^"'#?]+)(?:[?#][^"']*)?["']/gi)]
      .map(match => match[1])
      .filter(ref => !/^(?:[a-z]+:|\/\/|data:|javascript:)/i.test(ref) && ref !== '#' && !ref.startsWith('mailto:')))];
    for (const ref of localRefs) {
      const target = path.resolve(path.dirname(fullPath), ref);
      if (!target.startsWith(root + path.sep) && target !== root) {
        fail(file + ': local resource escapes repository: ' + ref);
      } else if (!fs.existsSync(target)) {
        fail(file + ': broken local resource: ' + ref);
      }
    }

    if (file === 'index.html') {
      if (!html.includes("runStoreService('banners',loadStoreBanners)") ||
          !html.includes("runStoreService('payment-methods',loadPaymentMethods)") ||
          !html.includes("runStoreService('catalog',loadStoreCurrency)")) {
        fail('index.html: storefront startup services must be isolated from each other');
      }

      const exports = new Set([...html.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(match => match[1]));
      const handlers = [...html.matchAll(/\bonclick\s*=\s*["']([^"']+)["']/gi)].map(match => match[1].trim());
      for (const handler of handlers) {
        if (/^(?:if\s*\(|document\.)/.test(handler)) continue;
        const fn = handler.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1];
        if (fn && !exports.has(fn)) fail('index.html: inline handler is not exposed on window: ' + fn);
      }
      if (/sb_secret_|service_role/i.test(html)) fail('index.html: privileged Supabase key must never be shipped to browsers');
      if (!html.includes('privacy.html')) fail('index.html: privacy policy link is missing');
      if (!/country\s*===\s*wantedCountry/.test(html) || !/country\s*===\s*['"]ALL['"]/.test(html)) {
        fail('index.html: checkout payment methods are not restricted to the selected country');
      }
      if (/['"]apple_pay['"]/.test(html)) fail('index.html: Apple Pay must not appear in customer checkout');
      if (!html.includes('window.scanApexCardQr=scanApexCardQr')) fail('index.html: wallet QR scan handler is not exposed');
      if (!html.includes('window.transferApexWallet=transferApexWallet')) fail('index.html: wallet transfer handler is not exposed');
    }

    if (file === 'admin.html') {
      if (/apex-admin-navigation-reliability[\s\S]*?stopImmediatePropagation\s*\(/.test(html)) {
        fail('admin.html: navigation reliability layer must not block the original service loaders');
      }
      if (!html.includes('async function runAdminService(name,task)')) {
        fail('admin.html: independent admin service error boundary is missing');
      }

      if (!html.includes('apex_admins')) fail('admin.html: server-side admin membership check is missing');
      const exports = new Set([...html.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(match => match[1]));
      const handlers = [...html.matchAll(/\bonclick\s*=\s*["']([^"']+)["']/gi)].map(match => match[1].trim());
      for (const handler of handlers) {
        if (/^(?:if\s*\(|document\.)/.test(handler)) continue;
        const fn = handler.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1];
        if (fn && !exports.has(fn)) fail('admin.html: inline handler is not exposed on window: ' + fn);
      }
    }
  }

  const functionSlugs = [
    'apex-wallet-checkout',
    'apex-create-order',
    'apex-admin-customers',
    'apex-ai-guard',
    'apex-email-campaign',
    'apex-store-assistant',
    'apex-product-analyze',
  ];
  for (const slug of functionSlugs) {
    if (!fs.existsSync(path.join(root, 'supabase', 'functions', slug, 'index.ts'))) {
      fail('Supabase Edge Function source is missing: ' + slug);
    }
  }

  const configPath = path.join(root, 'supabase', 'config.toml');
  if (!fs.existsSync(configPath) || !/\[functions\.apex-product-analyze\][\s\S]*?verify_jwt\s*=\s*true/.test(fs.readFileSync(configPath, 'utf8'))) {
    fail('Supabase JWT configuration for apex-product-analyze is missing');
  }

  const countryMigration = path.join(root, 'supabase', 'migrations', '20261111225028_enforce_customer_country_payment_scope.sql');
  if (!fs.existsSync(countryMigration)) {
    fail('Supabase payment country-scope migration is missing');
  } else {
    const sql = fs.readFileSync(countryMigration, 'utf8');
    if ((sql.match(/country_code in \(v_country,'ALL'\)/g) || []).length !== 2) {
      fail('Supabase order and wallet top-up must both enforce payment country scope');
    }
  }

  const trustedDeviceMigration = path.join(root, 'supabase', 'migrations', '20261112000445_apex_admin_trusted_device_registration.sql');
  if (!fs.existsSync(trustedDeviceMigration)) fail('Applied trusted-device migration archive is missing');
  const shippingRouteMigration = path.join(root, 'supabase', 'migrations', '20261112125538_apex_country_aware_shipping_routes.sql');
  if (!fs.existsSync(shippingRouteMigration)) fail('Applied country-aware shipping migration archive is missing');
  if (fs.existsSync(path.join(root, 'firebase', 'otp.js'))) fail('obsolete Firebase OTP source must not be restored');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.map(message => 'FAIL: ' + message).join('\n'));
  process.exit(1);
}
console.log('APEX storefront validation passed: customer/admin/product-studio pages, IDs, JavaScript syntax, local links, public-key boundary, handlers, payment country scope and all seven Supabase Edge Function sources.');
