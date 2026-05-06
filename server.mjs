import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const catalogs = JSON.parse(readFileSync(join(__dirname, "docs-catalog.json"), "utf8"));
const catalogBySlug = new Map(catalogs.map((catalog) => [catalog.slug, catalog]));
const allowedDocumentPaths = new Set(
  catalogs.flatMap((catalog) => catalog.documents.map((document) => new URL(document.href, "http://local").pathname)),
);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const send = (response, statusCode, body, contentType = "text/html; charset=utf-8") => {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
};

const redirect = (response, location) => {
  response.writeHead(302, { location });
  response.end();
};

const getSafeFilePath = (pathname) => {
  const normalizedPath = normalize(`.${pathname.replace(/^\/client-docs/, "")}`);
  const filePath = resolve(publicDir, "client-docs", normalizedPath);
  return filePath.startsWith(publicDir) ? filePath : null;
};

const serveFile = async (request, response, filePath) => {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    response.writeHead(200, {
      "content-length": fileStat.size,
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "private, max-age=60",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    send(response, 404, "Not found", "text/plain; charset=utf-8");
  }
};

const renderIndex = () => {
  const firstCatalog = catalogs[0];
  const links = catalogs
    .map(
      (catalog) =>
        `<a class="client-link" href="/docs/${escapeHtml(catalog.slug)}">${escapeHtml(catalog.clientName)}</a>`,
    )
    .join("");

  return renderLayout(
    "Documentacoes",
    `<section class="intro">
      <h1>Documentacoes</h1>
      <p>Catalogos privados por link para clientes.</p>
      <div class="client-list">${links}</div>
    </section>`,
    firstCatalog ? `/docs/${firstCatalog.slug}` : null,
  );
};

const renderCatalog = (catalog, activeDocument) => {
  const documentLinks = catalog.documents
    .map((document) => {
      const activeClass = document.slug === activeDocument.slug ? " active" : "";
      return `<a class="doc-link${activeClass}" href="/docs/${escapeHtml(catalog.slug)}/${escapeHtml(document.slug)}">
        <strong>${escapeHtml(document.title)}</strong>
        <span>${escapeHtml(document.audience)}</span>
        <small>${escapeHtml(document.description)}</small>
      </a>`;
    })
    .join("");

  return renderLayout(
    `${catalog.clientName} - Documentacao`,
    `<header>
      <p class="eyebrow">Catalogo privado por link</p>
      <h1>${escapeHtml(catalog.clientName)}</h1>
      <p>${escapeHtml(catalog.summary)}</p>
    </header>
    <main class="catalog">
      <aside>
        <p class="project-label">Projeto</p>
        <h2>${escapeHtml(catalog.projectName)}</h2>
        <nav>${documentLinks}</nav>
      </aside>
      <section class="viewer">
        <div class="viewer-head">
          <div>
            <h2>${escapeHtml(activeDocument.title)}</h2>
            <p>${escapeHtml(activeDocument.description)}</p>
          </div>
          <a class="open-link" href="${escapeHtml(activeDocument.href)}" target="_blank" rel="noreferrer">Abrir em nova aba</a>
        </div>
        <iframe title="${escapeHtml(activeDocument.title)}" src="${escapeHtml(activeDocument.href)}"></iframe>
      </section>
    </main>`,
  );
};

const renderLayout = (title, body, redirectUrl = null) => `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${redirectUrl ? `<meta http-equiv="refresh" content="0; url=${escapeHtml(redirectUrl)}">` : ""}
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f6f8fb; color: #172033; font-family: Arial, Helvetica, sans-serif; }
    header, .intro { background: #0f172a; color: #fff; padding: 32px; }
    header h1, .intro h1 { margin: 8px 0 10px; font-size: 34px; letter-spacing: 0; }
    header p, .intro p { margin: 0; color: #dbeafe; max-width: 760px; line-height: 1.55; }
    .eyebrow { color: #5eead4; font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: .06em; }
    .catalog { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 18px; padding: 18px; max-width: 1400px; margin: 0 auto; }
    aside, .viewer, .intro { border: 1px solid #dbe2ee; background: #fff; border-radius: 8px; }
    aside { padding: 16px; height: fit-content; }
    .project-label { color: #64748b; font-size: 12px; font-weight: 700; margin: 0; text-transform: uppercase; }
    aside h2 { margin: 4px 0 16px; font-size: 18px; }
    nav { display: grid; gap: 10px; }
    .doc-link { border: 1px solid #dbe2ee; border-radius: 8px; color: #172033; display: grid; gap: 5px; padding: 13px; text-decoration: none; }
    .doc-link:hover, .doc-link.active { border-color: #0f766e; background: #ecfdf5; }
    .doc-link span { color: #0f766e; font-size: 13px; font-weight: 700; }
    .doc-link small { color: #64748b; line-height: 1.4; }
    .viewer { overflow: hidden; }
    .viewer-head { align-items: center; border-bottom: 1px solid #dbe2ee; display: flex; gap: 16px; justify-content: space-between; padding: 16px 18px; }
    .viewer-head h2 { margin: 0 0 4px; font-size: 20px; }
    .viewer-head p { margin: 0; color: #64748b; line-height: 1.45; }
    .open-link, .client-link { background: #0f766e; border-radius: 6px; color: #fff; display: inline-block; font-weight: 700; padding: 10px 14px; text-decoration: none; white-space: nowrap; }
    iframe { border: 0; display: block; height: 76vh; min-height: 620px; width: 100%; }
    .intro { color: #172033; margin: 32px auto; max-width: 760px; }
    .intro h1 { color: #172033; }
    .intro p { color: #64748b; }
    .client-list { margin-top: 18px; }
    @media (max-width: 860px) {
      .catalog { grid-template-columns: 1fr; padding: 12px; }
      header { padding: 24px; }
      header h1, .intro h1 { font-size: 28px; }
      .viewer-head { align-items: flex-start; flex-direction: column; }
      iframe { min-height: 560px; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname);
  } catch {
    send(response, 400, "Bad request", "text/plain; charset=utf-8");
    return;
  }

  if (pathname === "/" || pathname === "/docs" || pathname === "/docs/") {
    if (catalogs[0]) {
      redirect(response, `/docs/${catalogs[0].slug}`);
      return;
    }
    send(response, 200, renderIndex());
    return;
  }

  if (pathname.startsWith("/client-docs/")) {
    if (!allowedDocumentPaths.has(pathname)) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    const filePath = getSafeFilePath(pathname);
    if (!filePath) {
      send(response, 403, "Forbidden", "text/plain; charset=utf-8");
      return;
    }

    await serveFile(request, response, filePath);
    return;
  }

  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "docs" && parts.length >= 2 && parts.length <= 3) {
    const catalog = catalogBySlug.get(parts[1]);
    if (!catalog) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    const activeDocument = parts[2]
      ? catalog.documents.find((document) => document.slug === parts[2])
      : catalog.documents[0];

    if (!activeDocument) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    send(response, 200, renderCatalog(catalog, activeDocument));
    return;
  }

  send(response, 404, "Not found", "text/plain; charset=utf-8");
});

server.listen(port, host, () => {
  console.log(`Documentation server running on http://${host}:${port}`);
});
