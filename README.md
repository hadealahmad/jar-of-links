# Jar of Links

A retro pixel-art **Three.js** web experience (Arabic RTL UI, styled after `hadealahmad.com`) featuring five closed glass jars filled with folded paper link notes:
- **الكل (`all`)** — Larger center jar picking across **every** row in `public/data/links.csv` (always visually full)
- **يوتيوب (`youtube`)** — Videos, talks & creative coding (`type = youtube`)
- **مقالات (`articles`)** — Essays, tutorials & deep dives (`type = articles`)
- **توصيات (`recommendations`)** — Hand-picked tools, indie gems & favorites (`type = recommendations`)
- **أخرى (`others`)** — Internet curiosities, web toys & archives (`type = others`)

The visual number and stack height of folded paper cards inside each 3D jar dynamically reflect that jar's item count relative to the other jars, while **الكل (`all`)** always remains the fullest jar on the shelf.

Clicking or tapping any jar picks it up off the pixel shelf, pops open its cork lid, pulls out a folded paper slip from the top of its pile, and unfolds it into an interactive **Open Graph Link Preview Card** that opens the link in a new tab when clicked.

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

## Managing Links (`public/data/links.csv`)

All five jars read from a **single** static CSV file at [`public/data/links.csv`](./public/data/links.csv) with a `type` column:

| `type` Value | Target Jar | Included in `الكل` (`all`)? |
| :--- | :--- | :---: |
| `youtube` | **يوتيوب** | Yes |
| `articles` | **مقالات** | Yes |
| `recommendations` | **توصيات** | Yes |
| `others` | **أخرى** | Yes |

### Supported CSV Formats

1. **Minimal `url,type` List (2 columns)** — Add bare URLs and their category:
   ```csv
   url,type
   https://www.youtube.com/watch?v=f4s1h2YETNY,youtube
   https://ciechanow.ski/mechanical-watch/,articles
   https://excalidraw.com/,recommendations
   https://neal.fun/,others
   ```
   At runtime, the client automatically resolves YouTube thumbnails/titles via oEmbed, fetches Open Graph metadata via CORS metadata API, and generates a retro pixel-art banner fallback if a site has no `og:image`. (If `type` is left blank, YouTube URLs default to `youtube` and other URLs default to `others`.)

2. **Pre-Enriched CSV (6 columns, instant zero-network card load)**:
   ```csv
   url,type,title,description,image,site_name
   https://threejs.org/,recommendations,Three.js – JavaScript 3D Library,JavaScript 3D library for WebGL and WebGPU.,https://threejs.org/files/share.png,Three.js
   ```

### Optional CLI Pre-Enrichment

Before committing new links, you can pre-populate missing Open Graph metadata in `public/data/links.csv`:

```bash
# Preview what would be enriched without modifying files
bun run enrich -- --dry-run

# Enrich missing OG fields in public/data/links.csv
bun run enrich
```

---

## Publishing to GitHub Pages & Custom Domain (`jar.hadealahmad.com`)

Vite is configured with `base: './'`, so the compiled static site works identically under both `https://hadealahmad.github.io/jar-of-links/` and `https://jar.hadealahmad.com/`.

When you are ready to replace the demo CSV and go live:
1. Replace the demo links in `public/data/links.csv` (and optionally run `bun run enrich`).
2. Switch the repository visibility from **Private** to **Public** in GitHub Settings (or keep private on GitHub Pro/Enterprise).
3. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions** (uses [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)).
4. To connect `jar.hadealahmad.com`:
   - Create `public/CNAME` containing:
     ```text
     jar.hadealahmad.com
     ```
   - Add a DNS `CNAME` record for `jar` pointing to `hadealahmad.github.io`.
   - Enable **Enforce HTTPS** in GitHub Pages settings once DNS propagates.
