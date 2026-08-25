// Search-engine and social-scraper layer. Kuppi is a client-rendered SPA, so
// crawlers that don't execute JS (and every link-preview bot) would otherwise
// see an empty shell. vercel.json routes bot User-Agents for /, /r/:id and
// numeric permalinks here; this middleware answers with complete static HTML:
// real titles, descriptions, visible content and JSON-LD structured data.
// Humans are never routed here and keep getting the interactive app.

import type { Express } from "express";
import { getResourceById, listResources } from "./kuppiDb";

const BOT_UA = /googlebot|bingbot|yandex|baiduspider|duckduckbot|twitterbot|facebookexternalhit|linkedinbot|whatsapp|slackbot|discordbot|pinterest|telegrambot/i;
const SITE = "https://kuppi.orinai.org";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(parts: { title: string; description: string; canonical: string; ogType?: string; jsonLd?: unknown; body: string }): string {
  const jsonLd = parts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(parts.jsonLd).replace(/</g, "\\u003c")}</script>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(parts.title)}</title>
<meta name="description" content="${esc(parts.description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${esc(parts.canonical)}">
<meta property="og:type" content="${parts.ogType ?? "website"}">
<meta property="og:site_name" content="Kuppi">
<meta property="og:title" content="${esc(parts.title)}">
<meta property="og:description" content="${esc(parts.description)}">
<meta property="og:url" content="${esc(parts.canonical)}">
<meta name="twitter:card" content="summary">
${jsonLd}
</head>
<body>
${parts.body}
<p><a href="/">Open the full Kuppi library — free study notes from Sri Lankan students.</a></p>
</body>
</html>`;
}

function renderHome(res: Express["response"], resources: Array<{ id: number; title: string; description: string; subject: string; studyLevel: string }>) {
  const items = resources.slice(0, 30);
  const list = items.map((r) => `<li><a href="/r/${r.id}">${esc(r.title)}</a> — ${esc(r.subject)} · ${esc(r.studyLevel)}<br>${esc(r.description.slice(0, 160))}</li>`).join("");
  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(page({
    title: "Kuppi — Free Study Notes & Past Papers Shared by Sri Lankan Students",
    description: "Kuppi is a free, student-powered library of study notes, past papers, worksheets and revision guides for Sri Lankan A/L and O/L students.",
    canonical: `${SITE}/`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Kuppi study resources",
      itemListElement: items.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/r/${r.id}`,
        name: r.title,
      })),
    },
    body: `<main><h1>Kuppi — the student-powered study library</h1>
<p>Free notes, past papers and revision guides shared by Sri Lankan students for A/L and O/L.</p>
<h2>Latest shared resources</h2><ul>${list || "<li>The library is growing — be the first to share.</li>"}</ul></main>`,
  }));
}

async function renderResource(res: Express["response"], id: number) {
  const resource = await getResourceById(id) as
    | { id: number; title: string; description: string; subject: string; studyLevel: string; originalFileName: string; mimeType: string; createdAt: Date; author: { fullName: string; username: string } }
    | null;
  if (!resource) {
    res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(page({
      title: "Resource not found — Kuppi",
      description: "This Kuppi resource is no longer available.",
      canonical: `${SITE}/r/${id}`,
      body: "<main><h1>This resource is no longer available.</h1></main>",
    }));
    return;
  }
  const url = `${SITE}/r/${id}`;
  const fileUrl = `${SITE}/f/${id}`;
  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(page({
    title: `${resource.title} — free ${resource.studyLevel} ${resource.subject} resource on Kuppi`,
    description: resource.description.slice(0, 300),
    canonical: url,
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: resource.title,
      description: resource.description,
      url,
      inLanguage: "en",
      learningResourceType: "Study notes",
      educationalLevel: resource.studyLevel,
      about: resource.subject,
      datePublished: new Date(resource.createdAt).toISOString(),
      author: { "@type": "Person", name: resource.author.fullName },
      isAccessibleForFree: true,
      encoding: { "@type": "MediaObject", contentUrl: fileUrl, encodingFormat: resource.mimeType, name: resource.originalFileName },
    },
    body: `<article><h1>${esc(resource.title)}</h1>
<p>${esc(resource.subject)} · ${esc(resource.studyLevel)} · shared by ${esc(resource.author.fullName)} (@${esc(resource.author.username)})</p>
<p>${esc(resource.description)}</p>
<p><a href="${fileUrl}">Open / download ${esc(resource.originalFileName)}</a></p></article>`,
  }));
}

export function registerSeoRoutes(app: Express) {
  // Dynamic sitemap: homepage plus every published resource permalink.
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const resources = await listResources({}, undefined) as Array<{ id: number; updatedAt?: Date; createdAt: Date }>;
      const urls = [
        `  <url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
        `  <url><loc>${SITE}/about</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
        ...resources.map((r) => `  <url><loc>${SITE}/r/${r.id}</loc><lastmod>${new Date(r.updatedAt ?? r.createdAt).toISOString().slice(0, 10)}</lastmod><priority>0.8</priority></url>`),
      ];
      res.status(200).setHeader("Content-Type", "application/xml; charset=utf-8").send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`,
      );
    } catch (error) {
      console.error("[Seo] sitemap failed:", error);
      res.status(500).setHeader("Content-Type", "application/xml").send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
    }
  });

  // Bot-only HTML rendering; everyone else falls through to the SPA.
  app.use(async (req, res, next) => {
    if (req.method !== "GET") return next();
    const ua = String(req.headers["user-agent"] ?? "");
    if (!BOT_UA.test(ua)) return next();
    try {
      if (req.path === "/" || req.path === "/about") {
        const resources = await listResources({}, undefined) as Array<{ id: number; title: string; description: string; subject: string; studyLevel: string }>;
        if (req.path === "/about") {
          return res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(page({
            title: "About Kuppi — the Sri Lankan study tradition, online",
            description: "Kuppi means a small study circle where Sri Lankan students teach each other. Kuppi the platform is a free library of A/L and O/L notes, past papers and revision guides shared by real students.",
            canonical: `${SITE}/about`,
            body: `<main><h1>What is a kuppi — and why we built a library around it</h1>
<p>In Sri Lanka, a <strong>kuppi</strong> is the small study circle students form when exam pressure hits — everyone teaching everyone else what they finally understood. The word means a little lamp: something small that holds light and passes it on.</p>
<p><strong>Kuppi the platform</strong> is a free library where Sri Lankan students share the study material that actually helped them — notes, past papers, revision guides, worksheets and quizzes for Combined Maths, Physics, Chemistry, Biology, Economics and more, for A/L and O/L. Every file was uploaded by a real student. Preview in your browser, download free, and pass your own understanding forward.</p>
<p>Kuppi was created by <a href="https://www.januth.dev">Januth Nimnal</a>.</p></main>`,
          }));
        }
        return renderHome(res, resources);
      }
      const match = req.path.match(/^\/(?:r\/)?(\d+)\/?$/);
      if (match) return await renderResource(res, Number(match[1]));
      return next();
    } catch (error) {
      console.error("[Seo] bot render failed:", error);
      return next();
    }
  });
}
