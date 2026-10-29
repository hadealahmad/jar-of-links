# Jar of Links

A retro pixel-art **Three.js** web experience featuring five closed glass jars filled with folded paper link notes:
- **Center Jar (`ALL`)** — Larger focal jar combining links across categories (`public/data/all.csv`)
- **YouTube (`YOUTUBE`)** — Videos, talks & creative coding (`public/data/youtube.csv`)
- **Articles (`ARTICLES`)** — Essays, tutorials & deep dives (`public/data/articles.csv`)
- **Recommendations (`RECS`)** — Hand-picked tools, indie gems & favorites (`public/data/recommendations.csv`)
- **Others (`OTHERS`)** — Internet curiosities, web toys & archives (`public/data/others.csv`)

Clicking or tapping any jar picks it up off the wooden pixel shelf, pops open its cork lid, pulls out a folded paper slip, and unfolds it into an interactive **Open Graph Link Preview Card** that opens the link in a new tab when clicked.

---

## Local Development (Bun)

```bash
# Install dependencies
bun install

# Start Vite dev server (http://localhost:5173)
bun run dev

# Run unit tests
bun test

# Type-check and build static production bundle into ./dist
bun run build

# Preview production bundle locally
bun run preview
```

---

## Managing the Static CSV Files

Each jar reads its own static CSV file inside [`public/data/`](./public/data/):

| Jar | CSV File |
| :--- | :--- |
| **All** (Center, large) | `public/data/all.csv` |
| **YouTube** | `public/data/youtube.csv` |
| **Articles** | `public/data/articles.csv` |
| **Recommendations** | `public/data/recommendations.csv` |
| **Others** | `public/data/others.csv` |

### Supported CSV Formats

1. **Simple Bare-URL List (1 column)** — You can paste plain URLs (with or without a `url` header):
   ```csv
   url
   https://www.youtube.com/watch?v=f4s1h2YETNY
   https://ciechanow.ski/mechanical-watch/
   ```
   At runtime, the client automatically resolves YouTube thumbnails/titles via oEmbed, fetches Open Graph metadata via CORS metadata API, and generates a retro pixel-art banner fallback if a site has no `og:image`.

2. **Pre-Enriched CSV (5 columns, instant zero-network card load)**:
   ```csv
   url,title,description,image,site_name
   https://threejs.org/,Three.js – JavaScript 3D Library,JavaScript 3D library for WebGL and WebGPU.,https://threejs.org/files/share.png,Three.js
   ```

### Optional CLI Pre-Enrichment & `all.csv` Sync

Before committing new links, you can optionally pre-populate missing Open Graph metadata and merge unique category links into `all.csv`:

```bash
# Preview what would be enriched without modifying files
bun run enrich -- --dry-run

# Enrich missing OG fields across all 5 CSVs
bun run enrich

# Enrich and also sync all category links into public/data/all.csv
bun run enrich -- --sync-all
```

---

## Publishing to GitHub Pages & Custom Domain (`jar.hadealahmad.com`)

Vite is configured with `base: './'`, so the compiled static site works identically under both `https://hadealahmad.github.io/jar-of-links/` and `https://jar.hadealahmad.com/`.

When you are ready to replace the demo CSVs and go live:
1. Replace the demo links in `public/data/{all,youtube,articles,recommendations,others}.csv` (and optionally run `bun run enrich -- --sync-all`).
2. Switch the repository visibility from **Private** to **Public** in GitHub Settings (or keep private on GitHub Pro/Enterprise).
3. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions** (uses [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)).
4. To connect `jar.hadealahmad.com`:
   - Create `public/CNAME` containing:
     ```text
     jar.hadealahmad.com
     ```
   - Add a DNS `CNAME` record for `jar` pointing to `hadealahmad.github.io`.
   - Enable **Enforce HTTPS** in GitHub Pages settings once DNS propagates.
