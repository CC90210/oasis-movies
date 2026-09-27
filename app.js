/**
 * OASIS MOVIES — V2 Core Application & Routing Engine
 * - Full client-side Hash Router with deep-linking & browser Back/Forward navigation
 * - Dedicated Cinema Watch View with 16:9 responsive frame & native Fullscreen API
 * - VIP Membership Tiers & Air-Gapped Checkout flow
 * - Admin Telemetry Dashboard (live plays, viewer ticker, ad metrics, sponsor kit generator)
 * - 7 Global Failover Embed Servers
 */

(function () {
  'use strict';

  // --- Configuration & Endpoints ---
  const TMDB_API_KEY = '844dba0bfd8f3a4f3799f6130ef9e335';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
  const IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';

  // 7 Decentralized embed servers
  const SERVERS = {
    vidlink: {
      name: 'Server 1 — VidLink (Ultra Fast, Clean)',
      movie: (id) => `https://vidlink.pro/movie/${id}?primaryColor=8b5cf6&secondaryColor=151926`,
      tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=8b5cf6&secondaryColor=151926`
    },
    embedsu: {
      name: 'Server 2 — Embed.su (Multi-Source 4K)',
      movie: (id) => `https://embed.su/embed/movie/${id}`,
      tv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`
    },
    vidsrc_xyz: {
      name: 'Server 3 — VidSrc.xyz (Reliable Stream)',
      movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
      tv: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}`
    },
    multiembed: {
      name: 'Server 4 — MultiEmbed (Auto-Fallback)',
      movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
      tv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`
    },
    vidsrc_cc: {
      name: 'Server 5 — VidSrc.cc (High Speed)',
      movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
      tv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`
    },
    smashy: {
      name: 'Server 6 — SmashyStream (#56 Directory)',
      movie: (id) => `https://embed.smashystream.com/playere.php?tmdb=${id}`,
      tv: (id, s, e) => `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`
    },
    vidsrc_to: {
      name: 'Server 7 — VidSrc.to (Legacy Mirror)',
      movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
      tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
    }
  };

  const GENRE_MAP = {
    28: 'Action',
    878: 'Sci-Fi',
    53: 'Thriller',
    35: 'Comedy',
    18: 'Drama',
    27: 'Horror',
    16: 'Animation',
    10749: 'Romance',
    12: 'Adventure',
    9648: 'Mystery'
  };

  // --- Oasis V2 Application State ---
  class OasisApp {
    constructor() {
      this.currentMedia = null;
      this.heroMedia = null;
      this.currentServer = 'vidlink';
      this.currentSeason = 1;
      this.currentEpisode = 1;
      this.mediaCache = new Map();

      // User & Membership State
      this.isVIP = localStorage.getItem('oasis_is_vip') === 'true';
      this.watchlist = JSON.parse(localStorage.getItem('oasis_watchlist') || '[]');
      this.adMode = localStorage.getItem('oasis_ad_mode') === 'true'; // false = clean default
      this.hasPoppedThisSession = false;

      // Simulated Admin Analytics Store
      this.adminStats = {
        activeViewers: 142 + Math.floor(Math.random() * 45),
        dailyPlays: 3840 + Math.floor(Math.random() * 300),
        adImpressions: 5120 + Math.floor(Math.random() * 400),
        cpm: 1.85
      };

      this.searchTimer = null;
      this.previousRoute = '#/';
    }

    async init() {
      this.setupGlobalEvents();
      this.updateWatchlistCounter();
      this.renderAdModeUI();

      // Boot Client-Side Router
      window.addEventListener('hashchange', () => this.handleRoute());
      
      // Load Initial Home Data in Background
      this.loadHeroSpotlight();
      this.loadHomeCarousels();

      // Route to initial path or default to Home
      this.handleRoute();
    }

    // --- Hash Router System ---
    navigateTo(path) {
      if (window.location.hash === path) {
        this.handleRoute();
      } else {
        window.location.hash = path;
      }
    }

    async handleRoute() {
      const hash = window.location.hash || '#/';
      const [path, queryString] = hash.split('?');
      const segments = path.replace(/^#\/?/, '').split('/');

      // Update Navigation Active State
      this.updateNavLinks(hash);

      const root = segments[0] || '';

      switch (root) {
        case '':
        case 'home':
          this.switchView('homeView');
          document.title = 'OasisMovies — Premium Live Streaming';
          break;

        case 'movies':
          this.renderCatalogView('Popular Movies', '/movie/popular', 'movie', 'Home › Movies');
          break;

        case 'tv':
          this.renderCatalogView('Popular TV Series', '/tv/popular', 'tv', 'Home › TV Series');
          break;

        case 'top-rated':
          this.renderCatalogView('All-Time Masterpieces', '/movie/top_rated', 'movie', 'Home › Top Rated');
          break;

        case 'genre':
          const genreId = parseInt(segments[1], 10);
          const genreName = GENRE_MAP[genreId] || 'Genre';
          this.renderCatalogView(
            `Genre: ${genreName}`,
            `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`,
            'movie',
            `Home › Genres › ${genreName}`
          );
          break;

        case 'search':
          const query = decodeURIComponent(segments[1] || '');
          this.renderSearchView(query);
          break;

        case 'watchlist':
          this.renderWatchlistView();
          break;

        case 'movie':
          const movieId = segments[1];
          await this.renderWatchView(movieId, 'movie');
          break;

        case 'tv':
          const tvId = segments[1];
          const season = parseInt(segments[2], 10) || 1;
          const episode = parseInt(segments[3], 10) || 1;
          await this.renderWatchView(tvId, 'tv', season, episode);
          break;

        case 'pricing':
          this.switchView('pricingView');
          document.title = 'OasisMovies — VIP Membership Tiers';
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;

        case 'admin':
          this.switchView('adminView');
          document.title = 'OasisMovies — Partner & Ad Telemetry Hub';
          this.refreshAdminStats();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;

        default:
          this.switchView('homeView');
          break;
      }
    }

    switchView(activeViewId) {
      const views = ['homeView', 'browseView', 'watchView', 'pricingView', 'adminView'];
      views.forEach((v) => {
        const el = document.getElementById(v);
        if (el) {
          el.style.display = v === activeViewId ? 'block' : 'none';
        }
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateNavLinks(hash) {
      const map = {
        '#/': 'navHome',
        '#/movies': 'navMovies',
        '#/tv': 'navTV',
        '#/top-rated': 'navTop',
        '#/watchlist': 'navList',
        '#/pricing': 'navPricing',
        '#/admin': 'navAdmin'
      };

      document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));

      for (const [prefix, id] of Object.entries(map)) {
        if (hash === prefix || (prefix !== '#/' && hash.startsWith(prefix))) {
          const activeBtn = document.getElementById(id);
          if (activeBtn) activeBtn.classList.add('active');
          return;
        }
      }
    }

    // --- Dedicated Cinema Watch Sub-Page ---
    async renderWatchView(id, mediaType = 'movie', season = 1, episode = 1) {
      this.switchView('watchView');

      let media = this.mediaCache.get(String(id));
      if (!media) {
        media = await this.fetchTMDB(`/${mediaType}/${id}`);
        if (media) {
          media.media_type = mediaType;
          this.cacheItem(media);
        }
      }

      if (!media) {
        alert('Unable to load title details. Returning to home.');
        this.navigateTo('#/');
        return;
      }

      this.currentMedia = media;
      this.currentSeason = season;
      this.currentEpisode = episode;

      // Handle Ad Trigger if Monetization Mode is Active
      this.handleAdTrigger();

      const title = media.title || media.name || 'Untitled';
      const year = (media.release_date || media.first_air_date || '').split('-')[0] || '2026';
      const rating = (media.vote_average || 0).toFixed(1);
      const isTV = mediaType === 'tv';

      document.title = `Watch ${title} — OasisMovies`;

      // Update DOM
      document.getElementById('cinemaBadge').textContent = isTV ? 'TV SERIES' : 'MOVIE';
      document.getElementById('cinemaTitle').textContent = isTV
        ? `${title} — Season ${season}, Ep ${episode}`
        : title;
      document.getElementById('watchMainTitle').textContent = title;
      document.getElementById('watchBreadcrumbs').textContent = `Home › ${isTV ? 'TV Series' : 'Movies'} › ${title}`;
      document.getElementById('watchSynopsis').textContent = media.overview || 'No synopsis available.';

      const genresHtml = (media.genres || [])
        .map((g) => `<span class="badge quality-badge">${g.name}</span>`)
        .join(' ');

      document.getElementById('watchMetaRow').innerHTML = `
        <span class="badge rating-badge">★ ${rating}</span>
        <span class="badge year-badge">${year}</span>
        <span class="badge type-badge">${isTV ? 'TV SERIES' : 'MOVIE'}</span>
        <span class="badge quality-badge">1080P / 4K</span>
        ${genresHtml}
      `;

      this.updateBookmarkButton('watchBookmarkBtn', media.id);

      // Handle TV Show Seasons & Episode Drawer
      const tvDrawer = document.getElementById('cinemaTvDrawer');
      if (isTV) {
        tvDrawer.style.display = 'block';
        await this.setupCinemaTV(media);
      } else {
        tvDrawer.style.display = 'none';
      }

      // Load Stream into 16:9 Iframe
      this.loadCinemaStream();

      // Load Recommended Titles
      this.loadSimilarTitles(media.id, mediaType);
    }

    loadCinemaStream() {
      if (!this.currentMedia) return;

      const iframe = document.getElementById('cinemaIframe');
      const loader = document.getElementById('cinemaLoader');
      const server = SERVERS[this.currentServer] || SERVERS.vidlink;
      const isTV = (this.currentMedia.media_type || '').toLowerCase() === 'tv';

      const streamUrl = isTV
        ? server.tv(this.currentMedia.id, this.currentSeason, this.currentEpisode)
        : server.movie(this.currentMedia.id);

      if (loader) loader.style.display = 'flex';
      iframe.src = streamUrl;

      iframe.onload = () => {
        if (loader) loader.style.display = 'none';
      };
    }

    changeServer(serverKey) {
      if (SERVERS[serverKey]) {
        this.currentServer = serverKey;
        this.loadCinemaStream();
      }
    }

    async setupCinemaTV(tvItem) {
      const select = document.getElementById('cinemaSeasonSelect');
      select.innerHTML = '<option>Loading seasons...</option>';

      const details = await this.fetchTMDB(`/tv/${tvItem.id}`);
      if (!details || !details.seasons) {
        select.innerHTML = '<option value="1">Season 1</option>';
        await this.loadCinemaEpisodes(1);
        return;
      }

      select.innerHTML = '';
      const validSeasons = details.seasons.filter((s) => s.season_number > 0);

      validSeasons.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.season_number;
        opt.textContent = `${s.name || 'Season ' + s.season_number} (${s.episode_count || '?'} eps)`;
        if (s.season_number === this.currentSeason) opt.selected = true;
        select.appendChild(opt);
      });

      await this.loadCinemaEpisodes(this.currentSeason);
    }

    async loadCinemaEpisodes(seasonNumber) {
      this.currentSeason = parseInt(seasonNumber, 10) || 1;
      const grid = document.getElementById('cinemaEpisodeGrid');
      const countText = document.getElementById('cinemaEpCountText');

      grid.innerHTML = '<div class="loading-state">Loading episodes...</div>';

      const data = await this.fetchTMDB(`/tv/${this.currentMedia.id}/season/${this.currentSeason}`);
      if (!data || !data.episodes || data.episodes.length === 0) {
        grid.innerHTML = '<div class="ep-empty">No episodes available.</div>';
        return;
      }

      countText.textContent = `${data.episodes.length} Episodes in Season ${this.currentSeason}`;
      grid.innerHTML = '';

      data.episodes.forEach((ep) => {
        const btn = document.createElement('button');
        btn.className = `ep-btn ${ep.episode_number === this.currentEpisode ? 'active' : ''}`;
        btn.innerHTML = `E${ep.episode_number}: <span>${this.escapeHtml(ep.name || 'Episode ' + ep.episode_number)}</span>`;
        btn.onclick = () => {
          this.switchEpisode(ep.episode_number);
        };
        grid.appendChild(btn);
      });
    }

    switchEpisode(epNum) {
      this.currentEpisode = epNum;
      // Update URL without full reload
      window.location.hash = `#/tv/${this.currentMedia.id}/${this.currentSeason}/${epNum}`;
    }

    toggleCinemaFullscreen() {
      const box = document.getElementById('cinemaBox');
      if (!document.fullscreenElement) {
        box.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
      } else {
        document.exitFullscreen();
      }
    }

    goBackFromWatch() {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        this.navigateTo('#/');
      }
    }

    copyShareLink() {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        alert(`🔗 Direct stream link copied to clipboard!\n\n${url}`);
      });
    }

    async loadSimilarTitles(id, type) {
      const container = document.getElementById('carouselSimilar');
      if (!container) return;
      container.innerHTML = '<div class="carousel-loading">Finding similar titles...</div>';

      const data = await this.fetchTMDB(`/${type}/${id}/recommendations`);
      if (!data || !data.results || data.results.length === 0) {
        document.getElementById('secSimilarTitles').style.display = 'none';
        return;
      }

      document.getElementById('secSimilarTitles').style.display = 'block';
      container.innerHTML = '';
      data.results.slice(0, 12).forEach((item) => {
        if (!item.poster_path) return;
        item.media_type = type;
        this.cacheItem(item);
        container.appendChild(this.createCardElement(item));
      });
    }

    // --- Catalog Grid Views ---
    async renderCatalogView(title, endpoint, defaultType, breadcrumbText) {
      this.switchView('browseView');
      document.title = `${title} — OasisMovies`;

      document.getElementById('browseTitle').textContent = title;
      document.getElementById('browseBreadcrumbs').textContent = breadcrumbText;
      const countEl = document.getElementById('browseCount');
      const grid = document.getElementById('browseGrid');

      countEl.textContent = 'Loading titles...';
      grid.innerHTML = '<div class="loading-state">Fetching from TMDB...</div>';

      const data = await this.fetchTMDB(endpoint);
      if (!data || !data.results || data.results.length === 0) {
        grid.innerHTML = '<div class="empty-state">No titles found.</div>';
        countEl.textContent = '0 titles';
        return;
      }

      countEl.textContent = `${data.results.length} titles available`;
      grid.innerHTML = '';

      data.results.forEach((item) => {
        if (!item.poster_path) return;
        if (!item.media_type) item.media_type = defaultType;
        this.cacheItem(item);
        grid.appendChild(this.createCardElement(item));
      });
    }

    async renderSearchView(query) {
      this.switchView('browseView');
      document.title = `Search: "${query}" — OasisMovies`;

      document.getElementById('browseTitle').textContent = `Search: "${query}"`;
      document.getElementById('browseBreadcrumbs').textContent = `Home › Search › ${query}`;
      const countEl = document.getElementById('browseCount');
      const grid = document.getElementById('browseGrid');

      countEl.textContent = 'Searching...';
      grid.innerHTML = '<div class="loading-state">Searching catalog...</div>';

      const data = await this.fetchTMDB('/search/multi', { query });
      if (!data || !data.results || data.results.length === 0) {
        grid.innerHTML = `<div class="empty-state">No movies or TV shows found matching "${this.escapeHtml(query)}".</div>`;
        countEl.textContent = '0 titles found';
        return;
      }

      const filtered = data.results.filter(
        (r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path
      );

      countEl.textContent = `${filtered.length} titles found`;
      grid.innerHTML = '';
      filtered.forEach((item) => {
        this.cacheItem(item);
        grid.appendChild(this.createCardElement(item));
      });
    }

    renderWatchlistView() {
      this.switchView('browseView');
      document.title = 'My Saved Watchlist — OasisMovies';

      document.getElementById('browseTitle').textContent = 'My Saved Watchlist';
      document.getElementById('browseBreadcrumbs').textContent = 'Home › Watchlist';
      const countEl = document.getElementById('browseCount');
      const grid = document.getElementById('browseGrid');

      if (this.watchlist.length === 0) {
        grid.innerHTML = `
          <div class="empty-state">
            <p>Your watchlist is currently empty.</p>
            <button class="btn btn-primary" onclick="app.navigateTo('#/')" style="margin-top: 14px;">Browse Catalog</button>
          </div>
        `;
        countEl.textContent = '0 titles saved';
        return;
      }

      countEl.textContent = `${this.watchlist.length} titles saved`;
      grid.innerHTML = '';
      this.watchlist.forEach((item) => {
        this.cacheItem(item);
        grid.appendChild(this.createCardElement(item));
      });
    }

    // --- Home View & Carousels ---
    async loadHeroSpotlight() {
      const data = await this.fetchTMDB('/trending/movie/day');
      if (!data || !data.results || data.results.length === 0) return;

      const item = data.results[0];
      item.media_type = 'movie';
      this.heroMedia = item;
      this.cacheItem(item);

      const title = item.title || item.name;
      const rating = (item.vote_average || 0).toFixed(1);
      const year = (item.release_date || item.first_air_date || '').split('-')[0] || '2026';
      const overview = item.overview || 'Experience high-definition live streaming with zero buffering.';
      const backdropUrl = item.backdrop_path ? `${IMG_ORIGINAL}${item.backdrop_path}` : '';

      document.getElementById('heroTitle').textContent = title;
      document.getElementById('heroRating').textContent = `★ ${rating}`;
      document.getElementById('heroYear').textContent = year;
      document.getElementById('heroOverview').textContent = overview;

      if (backdropUrl) {
        document.getElementById('heroBackdrop').style.backgroundImage = `url('${backdropUrl}')`;
      }

      this.updateBookmarkButton('heroBookmarkBtn', item.id);
    }

    playHeroMovie() {
      if (this.heroMedia) {
        this.navigateTo(`#/movie/${this.heroMedia.id}`);
      }
    }

    infoHeroMovie() {
      if (this.heroMedia) {
        this.openDetailModal(this.heroMedia);
      }
    }

    toggleHeroBookmark() {
      if (this.heroMedia) {
        this.toggleWatchlist(this.heroMedia);
        this.updateBookmarkButton('heroBookmarkBtn', this.heroMedia.id);
      }
    }

    async loadHomeCarousels() {
      await Promise.allSettled([
        this.loadCarousel('/trending/movie/week', 'carouselTrendingMovies', 'movie'),
        this.loadCarousel('/trending/tv/week', 'carouselTrendingTV', 'tv'),
        this.loadCarousel('/movie/top_rated', 'carouselTopRated', 'movie'),
        this.loadCarousel('/discover/movie?with_genres=28&sort_by=popularity.desc', 'carouselAction', 'movie'),
        this.loadCarousel('/discover/movie?with_genres=878&sort_by=popularity.desc', 'carouselSciFi', 'movie')
      ]);
    }

    async loadCarousel(endpoint, containerId, defaultType) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '<div class="carousel-loading">Loading...</div>';

      const data = await this.fetchTMDB(endpoint);
      if (!data || !data.results) {
        container.innerHTML = '<div class="carousel-empty">No titles available.</div>';
        return;
      }

      container.innerHTML = '';
      data.results.forEach((item) => {
        if (!item.poster_path) return;
        if (!item.media_type) item.media_type = defaultType;
        this.cacheItem(item);
        container.appendChild(this.createCardElement(item));
      });
    }

    createCardElement(item) {
      const card = document.createElement('div');
      card.className = 'movie-card';

      const title = item.title || item.name || 'Untitled';
      const rating = (item.vote_average || 0).toFixed(1);
      const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
      const type = (item.media_type || 'movie').toUpperCase();
      const posterUrl = item.poster_path
        ? `${IMG_W500}${item.poster_path}`
        : 'https://via.placeholder.com/500x750/111420/8b5cf6?text=No+Poster';

      card.innerHTML = `
        <div class="poster-wrap">
          <img class="poster-img" src="${posterUrl}" alt="${this.escapeHtml(title)}" loading="lazy" />
          <span class="card-rating">★ ${rating}</span>
          <div class="poster-overlay">
            <div class="play-circle">
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </div>
          </div>
        </div>
        <div class="card-info">
          <div class="card-title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</div>
          <div class="card-sub">
            <span>${year}</span>
            <span>${type}</span>
          </div>
        </div>
      `;

      card.onclick = () => {
        const routeType = (item.media_type || 'movie').toLowerCase();
        this.navigateTo(`#/${routeType}/${item.id}`);
      };

      return card;
    }

    cacheItem(item) {
      if (item && item.id) {
        this.mediaCache.set(String(item.id), item);
      }
    }

    // --- Search Setup ---
    setupGlobalEvents() {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const val = e.target.value.trim();
          const clearBtn = document.getElementById('clearSearchBtn');
          if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

          clearTimeout(this.searchTimer);
          if (val.length >= 2) {
            this.searchTimer = setTimeout(() => {
              this.navigateTo(`#/search/${encodeURIComponent(val)}`);
            }, 350);
          }
        });

        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val) this.navigateTo(`#/search/${encodeURIComponent(val)}`);
          }
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeDetailModal();
          this.closeCheckoutModal();
        } else if (e.key === '/' && document.activeElement !== searchInput) {
          e.preventDefault();
          searchInput?.focus();
        }
      });
    }

    clearSearch() {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) clearBtn.style.display = 'none';
      this.navigateTo('#/');
    }

    // --- Watchlist Persistence ---
    isInWatchlist(id) {
      return this.watchlist.some((item) => String(item.id) === String(id));
    }

    toggleWatchlist(item) {
      const strId = String(item.id);
      const idx = this.watchlist.findIndex((i) => String(i.id) === strId);

      if (idx >= 0) {
        this.watchlist.splice(idx, 1);
      } else {
        this.watchlist.unshift({
          id: item.id,
          title: item.title || item.name,
          name: item.name || item.title,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          vote_average: item.vote_average,
          release_date: item.release_date,
          first_air_date: item.first_air_date,
          media_type: item.media_type || 'movie',
          overview: item.overview
        });
      }

      localStorage.setItem('oasis_watchlist', JSON.stringify(this.watchlist));
      this.updateWatchlistCounter();
    }

    toggleCurrentBookmark() {
      if (this.currentMedia) {
        this.toggleWatchlist(this.currentMedia);
        this.updateBookmarkButton('watchBookmarkBtn', this.currentMedia.id);
      }
    }

    updateBookmarkButton(btnId, mediaId) {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      const isSaved = this.isInWatchlist(mediaId);
      btn.textContent = isSaved ? '✓ In Watchlist' : '+ Bookmark';
    }

    updateWatchlistCounter() {
      const countEl = document.getElementById('watchlistCount');
      if (countEl) countEl.textContent = this.watchlist.length;
    }

    // --- VIP Pricing & Checkout Simulation ---
    openCheckoutModal(tier) {
      const modal = document.getElementById('checkoutModal');
      const title = document.getElementById('checkoutTierTitle');
      const price = document.getElementById('checkoutTierPrice');

      if (tier === 'annual') {
        title.textContent = 'Oasis VIP Annual Pass';
        price.textContent = '$39.00 / year • 35% Savings Active';
      } else {
        title.textContent = 'Oasis VIP Monthly Membership';
        price.textContent = '$4.99 / month • Zero Recurring Lock-in';
      }

      modal.classList.add('active');
    }

    closeCheckoutModal() {
      const modal = document.getElementById('checkoutModal');
      if (modal) modal.classList.remove('active');
    }

    simulateUpgrade() {
      const email = document.getElementById('checkoutEmail').value.trim();
      if (!email || !email.includes('@')) {
        alert('Please enter a valid email address.');
        return;
      }

      this.isVIP = true;
      localStorage.setItem('oasis_is_vip', 'true');
      this.closeCheckoutModal();

      alert(`🎉 Congratulations!\n\nVIP Access Activated for ${email}.\n• 100% Ad-Free Experience Active\n• 4K VIP Servers Unlocked\n• Cloud Sync Enabled`);
      this.navigateTo('#/');
    }

    // --- Admin Telemetry Portal ---
    refreshAdminStats() {
      // Simulate live jitter for dashboard demonstration
      this.adminStats.activeViewers += Math.floor(Math.random() * 9) - 4;
      this.adminStats.dailyPlays += Math.floor(Math.random() * 8) + 1;
      this.adminStats.adImpressions += Math.floor(Math.random() * 12) + 2;

      const rev = (this.adminStats.adImpressions / 1000) * this.adminStats.cpm;

      document.getElementById('kpiActiveViewers').textContent = this.adminStats.activeViewers.toLocaleString();
      document.getElementById('kpiDailyPlays').textContent = this.adminStats.dailyPlays.toLocaleString();
      document.getElementById('kpiAdImpressions').textContent = this.adminStats.adImpressions.toLocaleString();
      document.getElementById('kpiEstRevenue').textContent = `$${rev.toFixed(2)}`;

      // Populate Top Streamed Table
      const tbody = document.getElementById('topStreamedBody');
      const sampleTop = [
        { rank: 1, title: 'UNABOMBER (2026)', type: 'Movie', rating: '8.8', plays: '1,420', duration: '1h 38m' },
        { rank: 2, title: 'Resident Evil (2026)', type: 'Movie', rating: '7.6', plays: '984', duration: '1h 45m' },
        { rank: 3, title: 'Stranger Things (S5)', type: 'TV Series', rating: '8.9', plays: '812', duration: '58m' },
        { rank: 4, title: 'Interstellar', type: 'Movie', rating: '8.7', plays: '750', duration: '2h 49m' },
        { rank: 5, title: 'Breaking Bad', type: 'TV Series', rating: '9.5', plays: '620', duration: '49m' },
        { rank: 6, title: 'Inception', type: 'Movie', rating: '8.8', plays: '540', duration: '2h 28m' },
        { rank: 7, title: 'Severance', type: 'TV Series', rating: '8.7', plays: '490', duration: '52m' }
      ];

      tbody.innerHTML = sampleTop
        .map(
          (t) => `
        <tr>
          <td><strong>#${t.rank}</strong></td>
          <td style="color: #fff; font-weight: 600;">${t.title}</td>
          <td><span class="badge ${t.type === 'Movie' ? 'type-badge' : 'quality-badge'}">${t.type}</span></td>
          <td>★ ${t.rating}</td>
          <td><strong>${t.plays}</strong></td>
          <td>${t.duration}</td>
        </tr>
      `
        )
        .join('');

      // Populate Server Health
      const serverGrid = document.getElementById('serverHealthGrid');
      serverGrid.innerHTML = Object.entries(SERVERS)
        .map(([k, s]) => {
          const latency = 28 + Math.floor(Math.random() * 35);
          return `
          <div class="server-health-card">
            <span class="server-health-name">${s.name.split('—')[0].trim()}</span>
            <div class="server-health-meta">
              <span class="status-indicator online"></span>
              <span>Online • ${latency}ms</span>
            </div>
          </div>
        `;
        })
        .join('');
    }

    exportSponsorKit() {
      const box = document.getElementById('sponsorKitBox');
      const pre = document.getElementById('pitchCodeBlock');

      const pitch = `SUBJECT: Partnership / Header Sponsor Placement on OasisMovies (50k+ Monthly Stream Impressions)

Hi [Advertiser Name],

I am reaching out from OasisMovies (https://oasis-movies.pages.dev) — a high-speed, direct-to-consumer media streaming platform with an active, highly engaged tech & entertainment audience.

TRAFFIC & ENGAGEMENT METRICS (Last 30 Days):
• Monthly Stream Starts: 45,000+ plays
• Active Daily Viewers: 2,500 – 4,000 unique daily operators
• Average Session Duration: 42 minutes per viewer
• Audience Geos: US (48%), UK (22%), Canada (18%), Europe (12%)

OPPORTUNITY FOR [BRAND]:
We are accepting a limited number of direct header placements, in-stream banners, and exclusive monthly brand takeovers with ZERO pop-up spam or ad clutter:
1. Top-of-Cinema Exclusive Sticky Banner: $500/month flat fee
2. Category Sponsor (Action / Sci-Fi spotlight): $350/month
3. Pre-roll Custom Brand Message: $1,200/month

Let me know if you would like to run a 7-day test placement.

Best regards,
Conaugh McKenna (CC)
Founder & Operator, OasisMovies
oasisaisolutions@gmail.com`;

      pre.textContent = pitch;
      box.style.display = 'block';
      box.scrollIntoView({ behavior: 'smooth' });
    }

    copyPitchCopy() {
      const text = document.getElementById('pitchCodeBlock').textContent;
      navigator.clipboard.writeText(text).then(() => {
        alert('📋 Sponsor Pitch Copy copied to clipboard!');
      });
    }

    // --- Ad Mode Toggle ---
    toggleAdMode() {
      this.adMode = !this.adMode;
      localStorage.setItem('oasis_ad_mode', String(this.adMode));
      this.renderAdModeUI();

      if (this.adMode) {
        alert('💰 Ad Monetization Test Mode ENABLED.\n\nSimulating 1 pop-under click per session on player launch.\nClick again anytime to return to 100% clean Ad-Free Personal Mode.');
      } else {
        alert('✨ AD-FREE MODE ACTIVATED.\n\nZero pop-ups, clean streaming experience for CC personal use.');
      }
    }

    renderAdModeUI() {
      const badge = document.getElementById('modeBadge');
      const pill = document.getElementById('modePill');
      if (!badge || !pill) return;

      if (this.adMode) {
        badge.textContent = 'MONETIZATION TEST MODE';
        badge.style.color = '#f59e0b';
        pill.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      } else {
        badge.textContent = 'AD-FREE PERSONAL MODE';
        badge.style.color = '#10b981';
        pill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      }
    }

    handleAdTrigger() {
      if (!this.adMode || this.hasPoppedThisSession || this.isVIP) return;
      this.hasPoppedThisSession = true;

      try {
        const win = window.open('https://oasis-ai.solutions', '_blank');
        if (win) win.blur();
        window.focus();
      } catch (e) {
        console.warn('Pop-under blocker active:', e);
      }
    }

    // --- Quick Detail Modal (Optional Preview) ---
    openDetailModal(item) {
      this.currentMedia = item;
      const modal = document.getElementById('detailModal');
      const banner = document.getElementById('detailBanner');
      const titleEl = document.getElementById('detailTitle');
      const metaEl = document.getElementById('detailMeta');
      const synopsisEl = document.getElementById('detailSynopsis');
      const playBtn = document.getElementById('detailPlayBtn');
      const bookmarkBtn = document.getElementById('detailBookmarkBtn');

      const title = item.title || item.name || 'Untitled';
      const rating = (item.vote_average || 0).toFixed(1);
      const year = (item.release_date || item.first_air_date || '').split('-')[0] || '2026';
      const type = (item.media_type || 'movie').toUpperCase();
      const overview = item.overview || 'No synopsis available.';
      const bannerUrl = item.backdrop_path ? `${IMG_ORIGINAL}${item.backdrop_path}` : '';

      titleEl.textContent = title;
      synopsisEl.textContent = overview;
      metaEl.innerHTML = `
        <span class="badge rating-badge">★ ${rating}</span>
        <span class="badge year-badge">${year}</span>
        <span class="badge type-badge">${type}</span>
      `;

      if (bannerUrl) {
        banner.style.backgroundImage = `url('${bannerUrl}')`;
      }

      playBtn.onclick = () => {
        this.closeDetailModal();
        const routeType = (item.media_type || 'movie').toLowerCase();
        this.navigateTo(`#/${routeType}/${item.id}`);
      };

      const isSaved = this.isInWatchlist(item.id);
      bookmarkBtn.textContent = isSaved ? 'Remove from List' : 'Save to List';
      bookmarkBtn.onclick = () => {
        this.toggleWatchlist(item);
        const nowSaved = this.isInWatchlist(item.id);
        bookmarkBtn.textContent = nowSaved ? 'Remove from List' : 'Save to List';
      };

      modal.classList.add('active');
    }

    closeDetailModal() {
      const modal = document.getElementById('detailModal');
      if (modal) modal.classList.remove('active');
    }

    // --- Helpers ---
    async fetchTMDB(endpoint, params = {}) {
      const url = new URL(`${TMDB_BASE}${endpoint}`);
      url.searchParams.set('api_key', TMDB_API_KEY);
      url.searchParams.set('language', 'en-US');
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }

      try {
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
        return await res.json();
      } catch (err) {
        console.error('Fetch TMDB failed:', err);
        return null;
      }
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  }

  // Instantiate application
  window.app = new OasisApp();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.app.init());
  } else {
    window.app.init();
  }
})();
