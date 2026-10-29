# Jar of Links

A retro pixel-art **Three.js** web experience (Arabic RTL UI, styled after `hadealahmad.com`) featuring five closed glass jars filled with folded paper link notes:
- **الكل (`all`)** — Larger center jar picking across **every** row in `public/data/links.csv` (always visually full)
- **مرئيات (`watch`)** — YouTube videos, channels, playlists, anime & animated series (`type = watch`)
- **ألعاب (`games`)** — Steam & video games (`type = games`)
- **كتب (`books`)** — Books & novels on Goodreads (`type = books`)
- **مقالات (`articles`)** — Essays, blog posts & deep-dive reading (`type = articles`)

The visual number and stack height of folded paper cards inside each 3D jar dynamically reflect that jar's item count relative to the other jars, while **الكل (`all`)** always remains the fullest jar on the shelf.

Clicking or tapping any jar picks it up off the pixel shelf, pops open its cork lid, pulls out a folded paper slip from the top of its pile, resolves Open Graph metadata (`title`, `description`, `image`) directly from the link, and unfolds it into an interactive **Open Graph Link Preview Card** that opens the link in a new tab when clicked.

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

All five jars read from a **single** two-column static CSV file at [`public/data/links.csv`](./public/data/links.csv):

```csv
url,type
https://www.youtube.com/@LEMMiNO,watch
https://store.steampowered.com/app/632470/Disco_Elysium__The_Final_Cut/,games
https://www.goodreads.com/book/show/17803.After_Dark,books
https://hadealahmad.com/2021/08/the-internet-makes-you-stupid/,articles
```

| `type` Value | Target Jar | Included in `الكل` (`all`)? |
| :--- | :--- | :---: |
| `watch` | **مرئيات** | Yes |
| `games` | **ألعاب** | Yes |
| `books` | **كتب** | Yes |
| `articles` | **مقالات** | Yes |

At runtime, the client automatically resolves metadata (`title`, `description`, `image`) via native CORS-enabled provider endpoints (YouTube oEmbed, Unavatar + Wikidata, Apple Books, Steam CDN, AniList GraphQL, Wikipedia REST, WordPress REST) with Microlink OG fallback and a procedural pixel-art banner fallback. (If `type` is left blank, the parser automatically infers `watch`, `games`, `books`, or `articles` from the URL domain.)

---

## Publishing to GitHub Pages & Custom Domain (`jar.hadealahmad.com`)

Vite is configured with `base: './'`, so the compiled static site works identically under both `https://hadealahmad.github.io/jar-of-links/` and `https://jar.hadealahmad.com/`.

When you are ready to go live:
1. Switch the repository visibility from **Private** to **Public** in GitHub Settings (or keep private on GitHub Pro/Enterprise).
2. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions** (uses [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)).
3. To connect `jar.hadealahmad.com`:
   - Create `public/CNAME` containing:
     ```text
     jar.hadealahmad.com
     ```
   - Add a DNS `CNAME` record for `jar` pointing to `hadealahmad.github.io`.
   - Enable **Enforce HTTPS** in GitHub Pages settings once DNS propagates.
