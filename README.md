# 🎬 OasisMovies — Premium Live Streaming Catalog & Player

**OasisMovies** is a high-performance, dark-mode cinematic streaming web application modeled after `StreamWave.xyz`. It enables instant browsing, searching, and live viewing of thousands of movies and TV series with zero lag, instant startup, and automatic multi-server failover.

---

## ⚡ Key Highlights & Architecture

- **Zero-Dependency Architecture:** Built with pure modern HTML5, vanilla JavaScript (ES6+), and tailored CSS3 with glassmorphism and ambient glow effects. No heavy bundles or build steps required.
- **Live TMDB Catalog:** Queries the TMDB API in real time for trending movies, binge-worthy TV series, all-time highest-rated masterpieces, action, and sci-fi.
- **7 Decentralized Failover Streaming Servers:**
  1. **Server 1 — VidLink (Primary):** Ultra-fast, responsive player with branded purple controls.
  2. **Server 2 — Embed.su:** High-bitrate 4K/1080p multi-source stream.
  3. **Server 3 — VidSrc.xyz:** High uptime global streaming mirror.
  4. **Server 4 — MultiEmbed:** Auto-fallback embed stream.
  5. **Server 5 — VidSrc.cc:** Fast cloud player.
  6. **Server 6 — SmashyStream:** Alternative scraper (#56 from the master catalog).
  7. **Server 7 — VidSrc.to:** Secondary mirror.
- **Interactive TV Series Drawer:** Dynamic season and episode selector. Clicking any episode seamlessly switches the video feed without page reloading.
- **Dual-Mode Engine (Personal vs. Monetization):**
  - **Ad-Free Personal Mode (Default):** 100% clean, no pop-ups, no ads. Built for CC's personal viewing.
  - **Monetization Test Mode:** Toggled with one click on the top-right pill badge. Simulates the frequency-capped (1 pop per session) click-interceptor for ad networks (Adsterra, Monetag).
- **Client-Side Persistence:** "My List" bookmarks and viewing history saved automatically to browser `localStorage`.
- **Keyboard Shortcuts:** `ESC` to close player/modals, `/` to focus the search bar.

---

## 🚀 Running Locally

To start watching immediately on your local machine:

```bash
# From CEO-Agent root:
python3 -m http.server 8088 --directory apps/oasis-movies
```

Then open in your browser:
👉 **[http://localhost:8088](http://localhost:8088)**

---

## 🛡️ Air-Gapped Cloudflare Pages Deployment (Production Guide)

Per CC's mandate in `HANDOVER_INVENTOR_AND_STREAMING_MONETIZATION.md`, if deploying this site publicly to monetize ad traffic, deploy under strict infrastructure air-gapping:

1. **Independent Git Repository:**
   ```bash
   cd apps/oasis-movies
   git init
   git add .
   git commit -m "feat: initial OasisMovies release"
   ```
2. **Push to an Isolated GitHub Organization / Account:**
   - Host on a separate, non-OASIS GitHub profile.
3. **Deploy to Cloudflare Pages:**
   - Connect the repo to a separate, burner Cloudflare account (not the OASIS account).
   - Build Settings:
     - Framework preset: `None`
     - Build command: *(leave empty)*
     - Build output directory: `.`
4. **Custom Domain:**
   - Map a clean privacy-protected domain (`.xyz`, `.to`, or `.mov`) registered with WHOIS privacy.
