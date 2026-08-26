# Kuppi Docs MCP

Kuppi exposes a remote **Model Context Protocol** server at `https://kuppi.orinai.org/api/mcp`
(Streamable HTTP, stateless JSON mode). Connect any MCP-capable AI — Claude
Desktop, Codex, Cursor, etc. — and it can explore the study-note library in
real time: browse auto-generated hashtags, search compact results, read the
extracted text of any note in-chat, hand out permalinks, and (with login)
publish new notes.

## Connect

Reads need no account. Add this to your client's MCP config:

```json
{
  "mcpServers": {
    "kuppi": {
      "url": "https://kuppi.orinai.org/api/mcp"
    }
  }
}
```

## Upload (login required)

`kuppi_upload_note` is the only authenticated tool. It uses the same session
JWT as the terminal uploader:

1. Get a token once (valid 14 days):

   ```bash
   curl -X POST https://kuppi.orinai.org/api/cli/login \
     -H "Content-Type: application/json" \
     -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}'
   ```

2. Put the token in the MCP config headers:

   ```json
   {
     "mcpServers": {
       "kuppi": {
         "url": "https://kuppi.orinai.org/api/mcp",
         "headers": { "Authorization": "Bearer <token>" }
       }
     }
   }
   ```

3. Re-login when it expires (the tool tells you when).

Uploads are capped at 10 MB inline base64; bigger files go through the
website or the terminal uploader (`curl -fsSL https://kuppi.orinai.org/api/cli/script -o kuppi-upload.mjs`).
Hashtags are generated automatically from the content on every upload path.

## Tools

| Tool | Auth | What it does |
| --- | --- | --- |
| `kuppi_trending_tags` | none | Most-used hashtags across the library — discovery entry point. |
| `kuppi_search_notes` | none | Search by text query, hashtags, subject, study level. Compact rows + related tags; never returns full documents. |
| `kuppi_read_note` | none | Paginated plain-text view of a note. PDFs/images are parsed/OCR'd server-side once and cached in MariaDB (`resources.extractedText`). |
| `kuppi_get_note_link` | none | Permalink `/r/{id}`, stream link `/f/{id}`, hashtags. |
| `kuppi_upload_note` | Bearer JWT | Publish a note inline (≤10 MB); returns id, permalink, auto-hashtags. |

Token-efficiency rules baked into the responses: listings carry ids/tags/
snippets only (~tens of tokens per row), content reads are paginated slices,
and every search includes co-occurring hashtags so an AI can hop topics
without reading documents.

## Plain REST mirrors

The same reads work without an MCP client:

- `GET /api/v1/search?q=&tags=a,b&subject=&studyLevel=&limit=`
- `GET /api/v1/tags?limit=&q=<prefix>`
- `GET /api/v1/notes/:id`
- `GET /api/v1/notes/:id/content?offset=0&length=20000`

All published-content only; errors use `{ "error": { "message": ... } }`.

## Implementation map

- `server/mcpServer.ts` — endpoint + tool definitions (stateless Streamable HTTP)
- `server/apiV1Service.ts` — shared service layer (search/meta/content/upload)
- `server/autoTagger.ts` — hashtag generation (OpenRouter LLM with deterministic fallback) + text-extraction cache
- `drizzle/schema.ts` — `resourceTags` table, `resources.extractedText/extractedAt`

Backfill existing library: `corepack pnpm@10.4.1 exec tsx scripts/backfill-tags.ts [--force] [--limit N]`.
