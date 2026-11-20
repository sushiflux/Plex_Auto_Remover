import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const edge = edgeCandidates.find((p) => fs.existsSync(p));
if (!edge) {
  console.error('Microsoft Edge not found for PDF rendering.');
  process.exit(1);
}

function parseMarkdown(md) {
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const meta = {};
  let body = md;
  if (fmMatch) {
    for (const line of fmMatch[1].split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    body = fmMatch[2];
  }
  return { meta, body };
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderBody(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  const toc = [];
  let inUl = false;
  let inOl = false;
  let inCallout = false;
  let calloutType = '';

  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === '---') { closeLists(); continue; }

    if (line.startsWith('> [!')) {
      closeLists();
      const m = line.match(/^> \[!([A-ZÄÖÜ]+)\]/);
      calloutType = m ? m[1] : 'INFO';
      inCallout = true;
      out.push(`<div class="callout callout-${calloutType.toLowerCase()}"><div class="callout-title">${calloutType}</div>`);
      continue;
    }
    if (inCallout && line.startsWith('> ')) {
      out.push(`<p>${inlineFormat(line.slice(2))}</p>`);
      continue;
    }
    if (inCallout && !line.startsWith('>')) {
      out.push('</div>');
      inCallout = false;
    }

    if (line.startsWith('## ')) {
      closeLists();
      const title = line.slice(3).trim();
      const id = `ch-${toc.length + 1}`;
      toc.push({ id, title });
      out.push(`<h2 id="${id}" class="chapter">${inlineFormat(title)}</h2>`);
      continue;
    }
    if (line.startsWith('### ')) {
      closeLists();
      out.push(`<h3>${inlineFormat(line.slice(4).trim())}</h3>`);
      continue;
    }
    if (/^- /.test(line)) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inlineFormat(line.slice(2))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inlineFormat(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    if (line.trim() === '') {
      closeLists();
      continue;
    }
    closeLists();
    out.push(`<p>${inlineFormat(line)}</p>`);
  }
  closeLists();
  if (inCallout) out.push('</div>');
  return { html: out.join('\n'), toc };
}

function buildHtml(mdPath, logoSvg) {
  const md = fs.readFileSync(mdPath, 'utf8');
  const { meta, body } = parseMarkdown(md);
  const { html, toc } = renderBody(body);
  const isDe = meta.lang === 'de';

  const tocHtml = toc
    .map((t) => `<a href="#${t.id}" class="toc-item">${escapeHtml(t.title)}</a>`)
    .join('\n');

  return `<!doctype html>
<html lang="${meta.lang || 'de'}">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 22mm 18mm 20mm 18mm; }
  @page :first { margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Inter, system-ui, sans-serif; color: #0f172a; margin: 0; font-size: 10.5pt; line-height: 1.55; }
  .cover {
    width: 210mm; height: 297mm; background: linear-gradient(155deg, #0b0f17 0%, #111827 65%, #1e293b 100%);
    color: #f8fafc; padding: 26mm 22mm; display: flex; flex-direction: column; justify-content: space-between;
    page-break-after: always;
  }
  .cover-top { display: flex; align-items: center; gap: 14px; }
  .cover-logo { width: 52px; height: 52px; }
  .cover-brand { font-size: 14pt; font-weight: 600; letter-spacing: -0.01em; }
  .cover-pill { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(245,158,11,0.16); color: #fbbf24; font-size: 9pt; font-weight: 600; margin-bottom: 14px; }
  .cover h1 { font-size: 34pt; font-weight: 700; margin: 0 0 10px 0; line-height: 1.1; }
  .cover-rule { width: 72px; height: 4px; background: linear-gradient(90deg, #f59e0b, #dc2626); border-radius: 2px; margin: 14px 0 18px 0; }
  .cover-tagline { font-size: 13pt; color: #cbd5e1; max-width: 140mm; margin: 0; }
  .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 28px; }
  .meta-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 12px; }
  .meta-label { font-size: 7.5pt; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; }
  .meta-val { font-size: 9.5pt; font-weight: 600; margin-top: 3px; color: #f8fafc; }
  .cover-footer { display: flex; justify-content: space-between; font-size: 9pt; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; }
  .toc-page { page-break-after: always; }
  .toc-title { font-size: 18pt; font-weight: 700; margin: 0 0 16px 0; color: #0f172a; }
  .toc-item { display: block; padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; text-decoration: none; font-weight: 500; }
  h2.chapter { page-break-before: always; font-size: 17pt; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f59e0b; padding-bottom: 6px; margin: 0 0 14px 0; }
  h2.chapter:first-of-type { page-break-before: auto; }
  h3 { font-size: 12pt; font-weight: 600; color: #1e293b; margin: 18px 0 8px 0; }
  p { margin: 0 0 10px 0; }
  ul, ol { margin: 0 0 12px 0; padding-left: 20px; }
  li { margin-bottom: 5px; }
  code { font-family: Consolas, monospace; font-size: 9.2pt; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; color: #b45309; }
  .callout { margin: 14px 0; padding: 12px 14px; border-radius: 8px; border-left: 4px solid #f59e0b; background: #fffbeb; }
  .callout-warnung, .callout-warning { border-left-color: #dc2626; background: #fef2f2; }
  .callout-title { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px; color: #92400e; }
  .callout-warnung .callout-title, .callout-warning .callout-title { color: #991b1b; }
</style>
</head>
<body>
  <section class="cover">
    <div class="cover-top">
      <div class="cover-logo">${logoSvg}</div>
      <div class="cover-brand">${escapeHtml(meta.title || 'Plex Auto Remover')}</div>
    </div>
    <div>
      <div class="cover-pill">${escapeHtml(meta.subtitle || '')}</div>
      <h1>${escapeHtml(meta.title || 'Plex Auto Remover')}</h1>
      <div class="cover-rule"></div>
      <p class="cover-tagline">${escapeHtml(meta.tagline || '')}</p>
      <div class="meta-grid">
        <div class="meta-card"><div class="meta-label">${isDe ? 'Version' : 'Version'}</div><div class="meta-val">${escapeHtml(meta.version || '')}</div></div>
        <div class="meta-card"><div class="meta-label">${isDe ? 'Datum' : 'Date'}</div><div class="meta-val">${escapeHtml(meta.date || '')}</div></div>
        <div class="meta-card"><div class="meta-label">Status</div><div class="meta-val">${escapeHtml(meta.status || '')}</div></div>
        <div class="meta-card"><div class="meta-label">${isDe ? 'Freigabe' : 'Access'}</div><div class="meta-val">${escapeHtml(meta.classification || '')}</div></div>
      </div>
    </div>
    <div class="cover-footer">
      <span>${escapeHtml(meta.copyright || '')}</span>
      <span>${isDe ? 'Mit ♥ gemacht' : 'Made with ♥'}</span>
    </div>
  </section>

  <section class="toc-page">
    <h2 class="toc-title">${isDe ? 'Inhaltsverzeichnis' : 'Table of Contents'}</h2>
    ${tocHtml}
  </section>

  <main>${html}</main>
</body>
</html>`;
}

const logoSvg = fs.readFileSync(path.join(root, 'branding', 'logo.svg'), 'utf8');
const jobs = [
  { md: path.join(root, 'docs', 'handbuch', 'de', 'HANDBUCH.md'), pdf: path.join(root, 'docs', 'handbuch', 'Plex-Auto-Remover-Handbuch.pdf') },
  { md: path.join(root, 'docs', 'handbuch', 'en', 'HANDBOOK.md'), pdf: path.join(root, 'docs', 'handbuch', 'Plex-Auto-Remover-Handbook.pdf') },
];

for (const job of jobs) {
  const tmpHtml = job.pdf.replace(/\.pdf$/i, '.tmp.html');
  fs.writeFileSync(tmpHtml, buildHtml(job.md, logoSvg), 'utf8');
  execFileSync(edge, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${job.pdf}`, `file:///${tmpHtml.replace(/\\/g, '/')}`]);
  fs.unlinkSync(tmpHtml);
  console.log(`Generated: ${path.relative(root, job.pdf)}`);
}
