# Jar of Links — Detailed Architecture & Subagent Implementation Plan

## 1. Product Vision & Requirements

**Jar of Links** is a static, retro pixel-art Three.js web experience hosted on GitHub Pages and built locally with **Bun + Vite + TypeScript + Three.js**.

### Core User Journey
1. **Landing Stage**: The visitor arrives at a cozy retro pixel-art 3D scene showing **5 closed glass jars filled with colorful folded paper notes** resting on wooden pixel shelves:
   - **Center Jar (`all`)**: Noticeably larger (`1.38x` scale), filled with multi-colored notes.
   - **Surrounding 4 Jars**: `youtube`, `articles`, `recommendations`, and `others`.
2. **Selecting a Jar**: Clicking/tapping any jar triggers a choreographed 3D sequence:
   - **Pick**: Camera/stage brings the chosen jar forward into focus while gently shaking the papers inside.
   - **Open**: The cork lid pops off with a playful arc and floats aside.
   - **Extract**: A folded paper slip rises out of the open jar mouth.
   - **Unfold**: The 3D paper unfolds toward the screen and transitions seamlessly into an unfolded pixel-art **Link Preview Card**.
3. **Link Preview Card**:
   - Displays the resolved **Open Graph (`og:image`)** preview (with retro pixel frame & procedural pixel-art fallback banner if a site lacks an OG image), site domain + favicon, title, description, and category stamp.
   - **Clicking the card** opens the link in a new browser tab (`target="_blank" rel="noopener noreferrer"`).
   - Action controls let the user **Draw Another** (using a non-repeating shuffle bag per jar) or **Put Back / Close** (reversing the animation cleanly).
4. **Static Admin Workflow**:
   - Each jar reads directly from its static CSV file in `public/data/{all,youtube,articles,recommendations,others}.csv`.
   - Supports **both** bare 1-column URL lists (`url` or headerless URLs) **and** pre-enriched 5-column CSVs (`url,title,description,image,site_name`).
   - Includes an optional Bun CLI helper (`bun run enrich`) to pre-fetch OG tags and sync `all.csv` before committing, plus zero-backend client-side OG resolution (YouTube fast-path + Microlink CORS API + procedural pixel fallback) so bare URLs work out of the box on GitHub Pages.

---

## 2. Subagent-Ready Modular Architecture

To parallelize implementation across **OpenCode Go (`opencode-go/deepseek-v4.1-flash`)** subagents without merge conflicts or coupling bugs, all shared types (`src/types.ts`) and jar definitions (`src/config/jars.ts`) are frozen upfront, and each subagent owns a strictly disjoint directory/file boundary:

| Workstream | Subagent Model | Owned Files | Responsibility |
| :--- | :--- | :--- | :--- |
| **0. Foundation & Orchestration** | Lead Orchestrator | `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/types.ts`, `src/config/jars.ts`, `src/main.ts`, `.github/workflows/deploy.yml` | Git/GitHub private repo setup, Bun scaffold, contract definitions, final integration, build/test verification, deployment readiness. |
| **1. Demo CSVs & Enrichment CLI** | `opencode-go/deepseek-v4.1-flash` | `public/data/all.csv`, `public/data/youtube.csv`, `public/data/articles.csv`, `public/data/recommendations.csv`, `public/data/others.csv`, `scripts/enrich-csv.ts` | Curated realistic demo CSV datasets (mixing rich OG rows + bare URL rows to test both paths) + Bun CLI script (`bun run enrich`) for static OG pre-enrichment & `all.csv` syncing. |
| **2. CSV Parser, Shuffle Store & OG Resolver** | `opencode-go/deepseek-v4.1-flash` | `src/data/csvParser.ts`, `src/data/jarStore.ts`, `src/data/ogResolver.ts`, `src/data/__tests__/csvParser.test.ts` | RFC-4180 CSV parser (1-col bare URLs or 5-col metadata), non-repeating shuffle-bag drawer per jar, YouTube oEmbed/thumbnail fast-path + Microlink CORS OG resolver with timeout & sessionStorage cache, and Bun unit tests. |
| **3. Procedural Pixel-Art Assets & 8-Bit Audio** | `opencode-go/deepseek-v4.1-flash` | `src/pixel/textures.ts`, `src/pixel/sfx.ts` | Crisp `NearestFilter` HTML5 Canvas pixel textures (parchment jar labels, cork, wood grain, starry pixel backdrop, folded note paper, deterministic procedural pixel OG fallback banners) + zero-dependency WebAudio 8-bit SFX synthesizer. |
| **4. Three.js Pixel Stage, 5 Jars & Animations** | `opencode-go/deepseek-v4.1-flash` | `src/scene/JarMesh.ts`, `src/scene/JarStage.ts` | Low-res pixelated WebGL renderer (`antialias: false`, upscaled `image-rendering: pixelated`), faceted translucent glass jars with cork stoppers & interior folded papers, hinged 3D unfolding hero paper, raycasting (mouse + touch), and responsive shelf layouts for PC landscape & Mobile portrait. |
| **5. Retro Pixel HUD & Unfolded Link Card UI** | `opencode-go/deepseek-v4.1-flash` | `src/styles/pixel.css`, `src/ui/HudOverlay.ts` | Pixel-stepped 8-bit UI overlay, header & mute toggle, hover/mobile jar badge, accessible keyboard shortcuts (`1-5`, `Enter`, `Escape`), and the unfolded paper Link Preview Card modal with clickable new-tab anchor, OG image frame, skeleton state, and Draw Another / Put Back buttons. |

---

## 3. Responsive Layout Strategy (PC & Mobile)

### Desktop / Landscape (`aspect >= 1.0`)
- Single wide wooden pixel shelf with a raised center pedestal:
  - Left wing: `youtube` (`x = -5.0`), `articles` (`x = -2.6`)
  - Center focal pedestal: **`all`** (`x = 0`, `scale = 1.38`)
  - Right wing: `recommendations` (`x = +2.6`), `others` (`x = +5.0`)
- Camera auto-computes distance from horizontal & vertical FOV so all 5 jars stay comfortably framed at any aspect ratio (`16:9`, `21:9`, `4:3`, split-screen).

### Mobile / Portrait (`aspect < 1.0`)
- Two-tier / staggered pixel shelf arrangement optimized for narrow portrait screens (`320px–430px` wide):
  - Upper shelf: `youtube` (left) & `articles` (right)
  - Prominent center tier: **`all`** (`x = 0`, `scale = 1.38`)
  - Lower shelf: `recommendations` (left) & `others` (right)
- Touch interaction distinguishes intentional tap (`pointerdown` -> `pointerup` within `< 12px` movement) from accidental swipe, and the unfolded link card adapts to `min(92vw, 440px)` with safe-area padding (`env(safe-area-inset-*)`) and `44px+` touch targets.

---

## 4. Static Hosting

- Vite is configured with `base: './'` so static fetches (`./data/links.csv`, `./assets/...`) resolve cleanly on both root domains and subpaths.
- `.github/workflows/deploy.yml` runs `bun test` and `bun run build`, publishing `./dist` via `actions/deploy-pages@v4`.
