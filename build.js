#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, 'docs');

const pages = [
  {
    slug: '',
    title: 'vit — open source is social',
    description: 'software improvements should flow between projects like conversation — not bottleneck through a single maintainer.',
  },
  {
    slug: 'start',
    title: 'get started — vit',
    description: 'Get started with vit in 60 seconds. Browse the network, skim capabilities, and ship your first cap.',
    md: 'GET-STARTED.md',
  },
  {
    slug: 'doctrine',
    title: 'doctrine — vit',
    description: 'The vit doctrine: software should live. A social system for personalized software where the unit of exchange is capability.',
    md: 'DOCTRINE.md',
  },
  {
    slug: 'vocab',
    title: 'vocabulary — vit',
    description: 'Core terminology for vit: beacons, caps, remixes, provenance, and the CLI verbs that drive the workflow.',
    md: 'VOCAB.md',
  },
  {
    slug: 'architecture',
    title: 'architecture — vit',
    description: 'Technical architecture of vit: ATProto record types, cap lexicons, and system design.',
    md: 'ARCHITECTURE.md',
  },
];

const landingContent = `
        <h2 class="hero">open source is social</h2>
        <p>software improvements should flow between projects like conversation &mdash; not bottleneck through a single maintainer.</p>
        <div class="hero-visual">
          <img src="/vit-architecture-contrast.svg" alt="Architecture contrast: today's hub-and-spoke open source model versus vit's distributed capability mesh">
        </div>
        <p class="cta-row">
          <a href="/start/">get started in 60 seconds &rarr;</a>
          <a href="https://explore.v-it.org">explore the network &rarr;</a>
        </p>
        <hr>
        <p>a capability is a structured change instruction &mdash; what to do, why it matters, how to integrate it. not a diff. not a PR. a social post that humans and agents can both read, evaluate, and remix.</p>
        <section>
          <p>a codebase is not a distribution artifact. a codebase is a <strong>living organism</strong> that can adapt to each install, and it deserves a living ecosystem.</p>
          <p>the future is not &ldquo;one repo, one roadmap.&rdquo; the future is <strong>many codebases</strong>, each living, all sharing capabilities with each other through a social network that rewards provenance and trust.</p>
        </section>
        <p><a href="/doctrine/">read the full doctrine &rarr;</a></p>`;

function nav(activeSlug) {
  const items = [
    { href: '/', label: 'home', slug: '' },
    { href: '/start/', label: 'start', slug: 'start' },
    { href: 'https://explore.v-it.org', label: 'explore', slug: null },
    { href: '/doctrine/', label: 'doctrine', slug: 'doctrine' },
    { href: '/vocab/', label: 'vocab', slug: 'vocab' },
    { href: '/architecture/', label: 'architecture', slug: 'architecture' },
    { href: 'https://github.com/solpbc/vit', label: 'github', slug: null },
  ];
  return items
    .map(({ href, label, slug }) => {
      const cls = slug !== null && slug === activeSlug ? ' class="active"' : '';
      return `<a href="${href}"${cls}>${label}</a>`;
    })
    .join('\n          ');
}

const wordmark = `<svg viewBox="0 0 56 34" xmlns="http://www.w3.org/2000/svg" height="28" aria-hidden="true">
          <circle cx="16" cy="6" r="3" fill="#06D6A0"/>
          <path d="M5.5 11 L16 27 L26.5 11" stroke="#06D6A0" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <circle cx="33.5" cy="6" r="3" fill="#06D6A0"/>
          <line x1="33.5" y1="12.5" x2="33.5" y2="27" stroke="#06D6A0" stroke-width="3.5" stroke-linecap="round"/>
          <line x1="45" y1="7" x2="45" y2="27" stroke="#06D6A0" stroke-width="3.5" stroke-linecap="round"/>
          <line x1="39" y1="12.5" x2="51" y2="12.5" stroke="#06D6A0" stroke-width="3.5" stroke-linecap="round"/>
        </svg>`;

function template({ title, description, activeSlug, content, hashRedirect }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">${activeSlug === '' ? '\n  <meta property="og:image" content="https://v-it.org/vit-architecture-contrast.png">' : ''}
  <link rel="icon" type="image/svg+xml" href="/brand/vit-mark.svg">
  <style>
    :root {
      color-scheme: light;
      --vit-green: #06D6A0;
      --vit-green-deep: #059669;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #111827;
      background: #ffffff;
      line-height: 1.6;
    }

    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 24px 20px 32px;
    }

    header {
      border-bottom: 2px solid var(--vit-green);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }

    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    header h1 {
      margin: 0;
      line-height: 1;
    }

    header h1 a {
      display: inline-flex;
      align-items: flex-end;
      text-decoration: none;
      cursor: pointer;
    }

    header h1 svg {
      display: inline-block;
      height: 28px;
      width: auto;
    }

    .ality {
      display: inline-block;
      color: var(--vit-green);
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1;
      opacity: 0;
      max-width: 0;
      overflow: hidden;
      transition: opacity 0.3s ease, max-width 0.4s ease, margin 0.4s ease;
      white-space: nowrap;
      margin-left: 0;
      padding-bottom: 5px;
    }

    .ality.show {
      opacity: 1;
      max-width: 50px;
      margin-left: 1px;
    }

    .tagline {
      margin: 6px 0 0;
      color: #4b5563;
      font-size: 1rem;
    }

    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }

    nav a {
      color: var(--vit-green-deep);
      text-decoration: none;
    }

    nav a:hover {
      text-decoration: underline;
    }

    nav a.active {
      color: var(--vit-green-deep);
      text-decoration: underline;
      text-decoration-color: var(--vit-green);
      text-underline-offset: 3px;
    }

    .nav-toggle {
      display: none;
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--vit-green-deep);
      padding: 0;
      line-height: 1;
    }

    a {
      color: var(--vit-green-deep);
    }

    main {
      min-height: 240px;
    }

    .hero {
      font-size: 1.8rem;
      margin-top: 0;
      margin-bottom: 0.4em;
      line-height: 1.2;
    }

    .hero-visual {
      margin: 1.2em -80px;
    }

    .hero-visual img {
      width: 100%;
      height: auto;
      display: block;
    }

    @media (max-width: 880px) {
      .hero-visual {
        margin-left: -20px;
        margin-right: -20px;
      }
    }

    .cta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
    }

    .cta-row a {
      color: var(--vit-green-deep);
      font-weight: 500;
    }

    main h1,
    main h2,
    main h3,
    main h4 {
      line-height: 1.25;
      margin-top: 1.5em;
      margin-bottom: 0.6em;
    }

    main p,
    main ul,
    main ol,
    main blockquote,
    main pre {
      margin-top: 0;
      margin-bottom: 1em;
    }

    pre,
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    pre {
      background: #f3f4f6;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }

    code {
      background: #f3f4f6;
      padding: 0.1em 0.3em;
      border-radius: 4px;
    }

    pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
    }

    hr {
      border: 0;
      border-top: 1px solid var(--vit-green);
      margin: 1.5em 0;
    }

    footer {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 0.9rem;
      color: #6b7280;
    }

    footer a {
      color: var(--vit-green-deep);
    }

    @media (max-width: 600px) {
      .nav-toggle {
        display: block;
      }

      .header-bar {
        flex-wrap: wrap;
      }

      .header-bar > nav {
        display: none;
        width: 100%;
        flex-direction: column;
        gap: 8px;
        padding-top: 12px;
      }

      .header-bar > nav.open {
        display: flex;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-bar">
        <h1><a href="/" aria-label="vit" id="vit-mark">
        ${wordmark}<span class="ality">ality</span>
        </a></h1>
        <button class="nav-toggle" aria-label="Menu" aria-expanded="false">&#9776;</button>
        <nav>
          ${nav(activeSlug)}
        </nav>
      </div>
${activeSlug !== '' ? '      <p class="tagline">open source is social</p>' : ''}
    </header>

    <main>
      ${content}
    </main>

    <footer>
      part of <a href="https://solpbc.org">sol pbc</a>. created by <a href="https://bsky.app/profile/jeremie.com">Jeremie Miller</a>. vit is a trademark of sol pbc.
    </footer>
  </div>
${hashRedirect ? `
  <script>
    // Redirect old hash URLs to path URLs
    (function() {
      var hash = location.hash.slice(1);
      var map = { 'get-started': '/start/', doctrine: '/doctrine/', vocab: '/vocab/', architecture: '/architecture/' };
      if (map[hash]) location.replace(map[hash]);
    })();
  </script>
` : ''}
  <script>
    // Mobile nav toggle
    document.querySelector('.nav-toggle').addEventListener('click', function() {
      var nav = this.parentNode.querySelector('nav');
      var open = nav.classList.toggle('open');
      this.setAttribute('aria-expanded', open);
      this.textContent = open ? '\\u2715' : '\\u2630';
    });

    // Vitality easter egg — click the vit mark to reveal the full word
    document.getElementById('vit-mark').addEventListener('click', function(e) {
      e.preventDefault();
      this.querySelector('.ality').classList.toggle('show');
    });
  </script>
</body>
</html>`;
}

// Build all pages
for (const page of pages) {
  let content;
  if (page.md) {
    const md = readFileSync(join(docsDir, page.md), 'utf8');
    content = marked.parse(md);
  } else {
    content = landingContent;
  }

  const html = template({
    title: page.title,
    description: page.description,
    activeSlug: page.slug,
    content,
    hashRedirect: page.slug === '',
  });

  if (page.slug === '') {
    writeFileSync(join(docsDir, 'index.html'), html);
  } else {
    const dir = join(docsDir, page.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
  }
}

console.log('Built %d pages', pages.length);
