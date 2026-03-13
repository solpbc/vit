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
    description: 'vit is a social network of capabilities — where builders and their agents discover, remix, vet, and ship improvements across a living bazaar of codebases.',
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
        <p>vit is a social network of capabilities — where builders and their agents discover, remix, vet, and ship improvements across a living bazaar of codebases.</p>
        <p class="cta-row">
          <a href="/start/">get started in 60 seconds &rarr;</a>
          <a href="https://explore.v-it.org">explore the network &rarr;</a>
        </p>
        <hr>
        <section>
          <h2>software should live</h2>
          <p>vit is a <strong>social system for personalized software</strong> where the unit of exchange is not pull requests, not screenshots, not diffs, not even git.</p>
          <p>the unit of exchange is <strong>capability</strong>: structured, attributable, auditable capabilities, published into a network where other builders (and their agents) can <strong>discover it, remix it into their own codebases, vet it locally, vouch for it publicly, and ship new capabilities back into the stream</strong>.</p>
          <p>vit is how software becomes <em>organic</em> and <em>yours</em>.</p>
          <hr>
          <p>most open source codebases today are treated like artifacts: limited maintainers, often abandoned, complicated contribution options.</p>
          <p>vit assumes something different:</p>
          <p>a codebase is not a distribution artifact. a codebase is a <strong>living organism</strong> that can adapt to each install, and it deserves a living ecosystem.</p>
          <p>the future is not &ldquo;one repo, one roadmap.&rdquo; the future is <strong>many codebases</strong>, each personalized, each living, and all sharing capabilities with each other through a social network that rewards provenance and trust.</p>
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
  <meta property="og:type" content="website">
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

    header h1 {
      margin: 0;
      font-size: 2rem;
      line-height: 1.2;
      color: var(--vit-green);
    }

    header h1 a {
      color: inherit;
      text-decoration: none;
      cursor: default;
    }

    .egg {
      opacity: 0;
      transition: opacity 200ms ease;
      color: #9ca3af;
    }

    header h1:hover .egg {
      opacity: 1;
    }

    header h1.tapped .egg {
      opacity: 1;
    }

    .tagline {
      margin: 6px 0 0;
      color: #4b5563;
      font-size: 1rem;
    }

    .header-bar {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
    }

    header {
      border-bottom: 2px solid var(--vit-green);
      padding-bottom: 16px;
      margin-bottom: 24px;
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

    @media (max-width: 480px) {
      nav {
        gap: 10px;
        font-size: 0.9rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-bar">
        <h1><a href="/">vit<span class="egg">ality</span></a></h1>
        <nav>
          ${nav(activeSlug)}
        </nav>
      </div>
      <p class="tagline">open source is social</p>
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
    // Easter egg tap toggle
    document.querySelector('header h1').addEventListener('touchstart', function(e) {
      this.classList.toggle('tapped');
    });
    document.addEventListener('touchstart', function(e) {
      var h1 = document.querySelector('header h1');
      if (!h1.contains(e.target)) h1.classList.remove('tapped');
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
