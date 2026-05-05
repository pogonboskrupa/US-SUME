#!/usr/bin/env node
/**
 * Build script: copies web assets into www/ for Capacitor packaging.
 * Run: npm run build
 */
const fs   = require('fs');
const path = require('path');

const SRC  = __dirname;
const DEST = path.join(__dirname, 'www');

// Files/dirs to include in the APK
const COPY_FILES = [
  'index.html',
  'sw.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'GRANICE.kml',
  'FORVARDER IKONA.png',
  'static',
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(f => copyRecursive(path.join(src, f), path.join(dest, f)));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.mkdirSync(DEST, { recursive: true });

let copied = 0, skipped = 0;
for (const f of COPY_FILES) {
  const src = path.join(SRC, f);
  if (!fs.existsSync(src)) { console.warn(`  SKIP (not found): ${f}`); skipped++; continue; }
  copyRecursive(src, path.join(DEST, f));
  console.log(`  OK: ${f}`);
  copied++;
}

console.log(`\nBuild done — ${copied} items copied to www/ (${skipped} skipped)\n`);
