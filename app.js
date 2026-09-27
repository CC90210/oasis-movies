/**
 * OASIS MOVIES — Core Application Engine
 * High-performance streaming client with multi-server failover,
 * TMDB metadata integration, TV episode navigator, and ad-mode toggle.
 */

(function () {
  'use strict';

  // --- Configuration & Endpoints ---
  const TMDB_API_KEY = '844dba0bfd8f3a4f3799f6130ef9e335';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
  const IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';

  // Multi-server embed resolver map
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
      name: 'Server 6 — SmashyStream (Alternative)',
      movie: (id) => `https://embed.smashystream.com/playere.php?tmdb=${id}`,
      tv: (id, s, e) => `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`
    },
    vidsrc_to: {
      name: 'Server 7 — VidSrc.to (Legacy Mirror)',
      movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
      tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
    }
  };

  // --- Application State ---
  class OasisApp {
    constructor() {
      this.currentMedia = null;
      this.heroMedia = null;
      this.currentServer = 'vidlink';
      this.currentSeason = 1;
      this.currentEpisode = 1;
      this.activeGenre = 'all';
      this.activeNav = 'home';
      this.activeTypeFilter = null; // 'movie' or 'tv'
      this.mediaCache = new Map();

      // Persistence
      this.watchlist = JSON.parse(localStorage.getItem('oasis_watchlist') || '[]');
      this.adMode = localStorage.getItem('oasis_ad_mode') === 'true'; // false = Ad-Free default
      this.hasPoppedThisSession = false;

      // Search debounce timer
      this.searchTimer = null;
    }

    async init() {
      this.setupEventListeners();
      this.updateWatchlistCounter();
      this.renderAdModeUI();

      // Load Carousels & Hero
      await Promise.allSettled([
        this.loadHeroSpotlight(),
        this.loadCarousel('/trending/movie/week', 'carouselTrendingMovies', 'movie'),
        this.loadCarousel('/trending/tv/week', 'carouselTrendingTV', 'tv'),
        this.loadCarousel('/movie/top_rated', 'carouselTopRated', 'movie'),
        this.loadCarousel('/discover/movie?with_genres=28&sort_by=popularity.desc', 'carouselAction', 'movie'),
        this.loadCarousel('/discover/movie?with_genres=878&sort_by=popularity.desc', 'carouselSciFi', 'movie')
      ]);
    }

    setupEventListeners() {
      // Search input live handler
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const val = e.target.value.trim();
          const clearBtn = document.getElementById('clearSearchBtn');
          if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

          clearTimeout(this.searchTimer);
          if (val.length >= 2) {
            this.searchTimer = setTimeout(() => this.performSearch(val), 350);
          } else if (val.length === 0) {
            this.clearSearch();
          }
        });

        // Enter key in search
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val) this.performSearch(val);
          }
        });
      }

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closePlayer();
          this.closeDetailModal();
        } else if (e.key === '/' && document.activeElement !== searchInput) {
          e.preventDefault();
          searchInput?.focus();
        }
      });
    }

    // --- TMDB API Wrapper ---
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

    // --- Hero Spotlight ---
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
      document.getElementById('heroType').textContent = 'MOVIE';
      document.getElementById('heroOverview').textContent = overview;

      if (backdropUrl) {
        document.getElementById('heroBackdrop').style.backgroundImage = `url('${backdropUrl}')`;
        document.getElementById('ambientGlow').style.background = `radial-gradient(circle at 50% 20%, rgba(139, 92, 246, 0.25) 0%, transparent 70%)`;
      }

      this.updateBookmarkButton('heroBookmarkBtn', item.id);
    }

    playHeroMovie() {
      if (this.heroMedia) {
        this.openPlayer(this.heroMedia);
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

    // --- Carousel Loading ---
    async loadCarousel(endpoint, containerId, defaultType = 'movie') {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = `<div class="carousel-loading">Loading titles...</div>`;
      const data = await this.fetchTMDB(endpoint);

      if (!data || !data.results || data.results.length === 0) {
        container.innerHTML = `<div class="carousel-empty">No titles available right now.</div>`;
        return;
      }

      container.innerHTML = '';
      data.results.forEach((item) => {
        if (!item.poster_path) return;
        if (!item.media_type) item.media_type = defaultType;
        this.cacheItem(item);

        const card = this.createCardElement(item);
        container.appendChild(card);
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

      card.onclick = () => this.openDetailModal(item);
      return card;
    }

    cacheItem(item) {
      if (item && item.id) {
        this.mediaCache.set(String(item.id), item);
      }
    }

    // --- Search Functionality ---
    async performSearch(query) {
      const searchSection = document.getElementById('searchResultsSection');
      const searchGrid = document.getElementById('searchGrid');
      const queryText = document.getElementById('searchQueryText');
      const countText = document.getElementById('searchResultCount');

      queryText.textContent = query;
      searchSection.style.display = 'block';
      searchGrid.innerHTML = `<div class="loading-state">Searching catalog...</div>`;

      // Hide home carousels during search
      this.toggleHomeSections(false);

      const data = await this.fetchTMDB('/search/multi', { query });
      if (!data || !data.results || data.results.length === 0) {
        searchGrid.innerHTML = `<div class="empty-state">No movies or TV shows found matching "${this.escapeHtml(query)}". Try another term.</div>`;
        countText.textContent = '0 titles found';
        return;
      }

      // Filter to movies and tv shows with posters
      const filtered = data.results.filter(
        (r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path
      );

      countText.textContent = `${filtered.length} titles found`;
      searchGrid.innerHTML = '';

      filtered.forEach((item) => {
        this.cacheItem(item);
        const card = this.createCardElement(item);
        searchGrid.appendChild(card);
      });

      // Scroll to results smoothly
      searchSection.scrollIntoView({ behavior: 'smooth' });
    }

    clearSearch() {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) clearBtn.style.display = 'none';

      document.getElementById('searchResultsSection').style.display = 'none';
      this.toggleHomeSections(true);
    }

    toggleHomeSections(show) {
      const sections = [
        'secTrendingMovies',
        'secTrendingTV',
        'secTopRated',
        'secAction',
        'secSciFi'
      ];
      sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? 'block' : 'none';
      });
      const hero = document.getElementById('heroSection');
      if (hero) hero.style.display = show ? 'flex' : 'none';
    }

    // --- Filter by Type (Movies / TV Series) ---
    async filterType(type) {
      this.activeTypeFilter = type;
      this.updateNavButtons(type === 'movie' ? 'navMovies' : 'navTV');

      const searchSection = document.getElementById('searchResultsSection');
      const searchGrid = document.getElementById('searchGrid');
      const queryText = document.getElementById('searchQueryText');
      const countText = document.getElementById('searchResultCount');

      queryText.textContent = type === 'movie' ? 'All Popular Movies' : 'All Popular TV Series';
      searchSection.style.display = 'block';
      this.toggleHomeSections(false);
      searchGrid.innerHTML = `<div class="loading-state">Loading ${type === 'movie' ? 'movies' : 'TV shows'}...</div>`;

      const endpoint = type === 'movie' ? '/movie/popular' : '/tv/popular';
      const data = await this.fetchTMDB(endpoint);

      if (!data || !data.results) {
        searchGrid.innerHTML = `<div class="empty-state">Unable to load titles.</div>`;
        return;
      }

      countText.textContent = `${data.results.length} titles loaded`;
      searchGrid.innerHTML = '';
      data.results.forEach((item) => {
        item.media_type = type;
        this.cacheItem(item);
        searchGrid.appendChild(this.createCardElement(item));
      });

      searchSection.scrollIntoView({ behavior: 'smooth' });
    }

    async filterCategory(cat) {
      this.updateNavButtons('navTop');
      const searchSection = document.getElementById('searchResultsSection');
      const searchGrid = document.getElementById('searchGrid');
      const queryText = document.getElementById('searchQueryText');
      const countText = document.getElementById('searchResultCount');

      queryText.textContent = 'All-Time Highest Rated Masterpieces';
      searchSection.style.display = 'block';
      this.toggleHomeSections(false);
      searchGrid.innerHTML = `<div class="loading-state">Loading ranked masterpieces...</div>`;

      const data = await this.fetchTMDB('/movie/top_rated');
      if (!data || !data.results) {
        searchGrid.innerHTML = `<div class="empty-state">Unable to load titles.</div>`;
        return;
      }

      countText.textContent = `${data.results.length} titles ranked`;
      searchGrid.innerHTML = '';
      data.results.forEach((item) => {
        item.media_type = 'movie';
        this.cacheItem(item);
        searchGrid.appendChild(this.createCardElement(item));
      });

      searchSection.scrollIntoView({ behavior: 'smooth' });
    }

    async selectGenre(genreId) {
      const pills = document.querySelectorAll('.genre-pill');
      pills.forEach((p) => p.classList.remove('active'));
      const activePill = Array.from(pills).find((p) =>
        genreId === 'all'
          ? p.textContent.trim().toLowerCase() === 'all'
          : p.getAttribute('onclick')?.includes(String(genreId))
      );
      if (activePill) activePill.classList.add('active');

      if (genreId === 'all') {
        this.showHome();
        return;
      }

      const searchSection = document.getElementById('searchResultsSection');
      const searchGrid = document.getElementById('searchGrid');
      const queryText = document.getElementById('searchQueryText');
      const countText = document.getElementById('searchResultCount');

      const genreNames = {
        28: 'Action',
        878: 'Sci-Fi',
        53: 'Thriller',
        35: 'Comedy',
        18: 'Drama',
        27: 'Horror',
        16: 'Animation'
      };

      queryText.textContent = `Genre: ${genreNames[genreId] || 'Selected'}`;
      searchSection.style.display = 'block';
      this.toggleHomeSections(false);
      searchGrid.innerHTML = `<div class="loading-state">Filtering by genre...</div>`;

      const data = await this.fetchTMDB('/discover/movie', {
        with_genres: genreId,
        sort_by: 'popularity.desc'
      });

      if (!data || !data.results) {
        searchGrid.innerHTML = `<div class="empty-state">No titles found for this genre.</div>`;
        return;
      }

      countText.textContent = `${data.results.length} titles`;
      searchGrid.innerHTML = '';
      data.results.forEach((item) => {
        item.media_type = 'movie';
        this.cacheItem(item);
        searchGrid.appendChild(this.createCardElement(item));
      });

      searchSection.scrollIntoView({ behavior: 'smooth' });
    }

    showHome() {
      this.updateNavButtons('navHome');
      this.clearSearch();
      this.toggleHomeSections(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showWatchlist() {
      this.updateNavButtons('navList');
      const searchSection = document.getElementById('searchResultsSection');
      const searchGrid = document.getElementById('searchGrid');
      const queryText = document.getElementById('searchQueryText');
      const countText = document.getElementById('searchResultCount');

      queryText.textContent = 'My Saved Watchlist';
      searchSection.style.display = 'block';
      this.toggleHomeSections(false);

      if (this.watchlist.length === 0) {
        searchGrid.innerHTML = `
          <div class="empty-state">
            <p>Your watchlist is empty.</p>
            <button class="btn btn-primary" onclick="app.showHome()" style="margin-top: 14px;">Browse Catalog</button>
          </div>
        `;
        countText.textContent = '0 titles';
        return;
      }

      countText.textContent = `${this.watchlist.length} saved titles`;
      searchGrid.innerHTML = '';
      this.watchlist.forEach((item) => {
        this.cacheItem(item);
        searchGrid.appendChild(this.createCardElement(item));
      });

      searchSection.scrollIntoView({ behavior: 'smooth' });
    }

    updateNavButtons(activeId) {
      const btns = ['navHome', 'navMovies', 'navTV', 'navTop', 'navList'];
      btns.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) {
          if (id === activeId) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });
    }

    // --- Detail Modal ---
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
      const overview = item.overview || 'No synopsis available for this title.';
      const bannerUrl = item.backdrop_path
        ? `${IMG_ORIGINAL}${item.backdrop_path}`
        : item.poster_path
        ? `${IMG_W500}${item.poster_path}`
        : '';

      titleEl.textContent = title;
      synopsisEl.textContent = overview;
      metaEl.innerHTML = `
        <span class="badge rating-badge">★ ${rating}</span>
        <span class="badge year-badge">${year}</span>
        <span class="badge type-badge">${type}</span>
        <span class="badge quality-badge">1080P / 4K</span>
      `;

      if (bannerUrl) {
        banner.style.backgroundImage = `url('${bannerUrl}')`;
      } else {
        banner.style.background = '#151926';
      }

      playBtn.onclick = () => {
        this.closeDetailModal();
        this.openPlayer(item);
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

    // --- Unified Video Player Engine ---
    async openPlayer(item, season = 1, episode = 1) {
      this.currentMedia = item;
      this.currentSeason = season;
      this.currentEpisode = episode;

      // Handle Ad-Mode Interceptor Trigger (if active)
      this.handleAdTrigger();

      const modal = document.getElementById('playerModal');
      const badgeEl = document.getElementById('playerBadge');
      const titleEl = document.getElementById('playerTitle');
      const subInfoEl = document.getElementById('playerSubInfo');
      const overviewEl = document.getElementById('playerOverview');
      const tvDrawer = document.getElementById('tvDrawer');

      const isTV = (item.media_type || '').toLowerCase() === 'tv';
      const title = item.title || item.name || 'Untitled';
      const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';

      badgeEl.textContent = isTV ? 'TV SERIES' : 'MOVIE';
      titleEl.textContent = isTV ? `${title} (S${this.currentSeason}:E${this.currentEpisode})` : title;
      subInfoEl.textContent = `${year} • Global Multi-Server Failover Active`;
      overviewEl.textContent = item.overview || 'Streaming via direct embed server.';

      this.updateBookmarkButton('playerBookmarkBtn', item.id);

      // Handle TV Show Seasons & Episode Drawer
      if (isTV) {
        tvDrawer.style.display = 'block';
        await this.setupTVSeasons(item);
      } else {
        tvDrawer.style.display = 'none';
      }

      // Load Stream in Iframe
      this.loadIframeStream();

      // Show Player Modal
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    loadIframeStream() {
      if (!this.currentMedia) return;

      const iframe = document.getElementById('videoIframe');
      const loader = document.getElementById('playerLoader');
      const serverKey = this.currentServer || 'vidlink';
      const server = SERVERS[serverKey] || SERVERS.vidlink;

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
        this.loadIframeStream();
      }
    }

    async setupTVSeasons(tvItem) {
      const seasonSelect = document.getElementById('seasonSelect');
      seasonSelect.innerHTML = '<option value="">Loading seasons...</option>';

      // Fetch TV show details for total seasons
      const details = await this.fetchTMDB(`/tv/${tvItem.id}`);
      if (!details || !details.seasons) {
        seasonSelect.innerHTML = '<option value="1">Season 1</option>';
        await this.loadSeasonEpisodes(1);
        return;
      }

      seasonSelect.innerHTML = '';
      const validSeasons = details.seasons.filter((s) => s.season_number > 0);

      validSeasons.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.season_number;
        opt.textContent = `${s.name || 'Season ' + s.season_number} (${s.episode_count || '?'} eps)`;
        if (s.season_number === this.currentSeason) opt.selected = true;
        seasonSelect.appendChild(opt);
      });

      await this.loadSeasonEpisodes(this.currentSeason);
    }

    async loadSeasonEpisodes(seasonNumber) {
      this.currentSeason = parseInt(seasonNumber, 10) || 1;
      const epGrid = document.getElementById('episodeGrid');
      const epCountText = document.getElementById('epCountText');

      epGrid.innerHTML = '<div class="loading-state">Loading episodes...</div>';

      const data = await this.fetchTMDB(`/tv/${this.currentMedia.id}/season/${this.currentSeason}`);
      if (!data || !data.episodes || data.episodes.length === 0) {
        epGrid.innerHTML = '<div class="ep-empty">No episode details returned.</div>';
        epCountText.textContent = 'Episodes';
        return;
      }

      epCountText.textContent = `${data.episodes.length} Episodes in Season ${this.currentSeason}`;
      epGrid.innerHTML = '';

      data.episodes.forEach((ep) => {
        const btn = document.createElement('button');
        btn.className = `ep-btn ${ep.episode_number === this.currentEpisode ? 'active' : ''}`;
        btn.innerHTML = `E${ep.episode_number}: <span>${this.escapeHtml(ep.name || 'Episode ' + ep.episode_number)}</span>`;
        btn.onclick = () => {
          this.switchEpisode(ep.episode_number);
        };
        epGrid.appendChild(btn);
      });
    }

    switchEpisode(epNum) {
      this.currentEpisode = epNum;
      const titleEl = document.getElementById('playerTitle');
      const title = this.currentMedia.title || this.currentMedia.name || 'TV Series';
      titleEl.textContent = `${title} (S${this.currentSeason}:E${this.currentEpisode})`;

      // Update active button state
      const buttons = document.querySelectorAll('.ep-btn');
      buttons.forEach((b) => {
        if (b.textContent.startsWith(`E${epNum}:`)) b.classList.add('active');
        else b.classList.remove('active');
      });

      this.loadIframeStream();
    }

    closePlayer() {
      const modal = document.getElementById('playerModal');
      const iframe = document.getElementById('videoIframe');
      if (modal) modal.classList.remove('active');
      if (iframe) iframe.src = '';
      document.body.style.overflow = '';
    }

    // --- Watchlist & Bookmarking ---
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
        this.updateBookmarkButton('playerBookmarkBtn', this.currentMedia.id);
      }
    }

    updateBookmarkButton(btnId, mediaId) {
      const btn = document.getElementById(btnId);
      if (!btn) return;

      const isSaved = this.isInWatchlist(mediaId);
      if (btnId === 'heroBookmarkBtn') {
        btn.classList.toggle('active', isSaved);
      } else {
        btn.textContent = isSaved ? '✓ Saved in List' : '+ Bookmark Title';
      }
    }

    updateWatchlistCounter() {
      const countEl = document.getElementById('watchlistCount');
      if (countEl) countEl.textContent = this.watchlist.length;
    }

    // --- Ad Monetization & Pop-Under Interceptor Mode ---
    toggleAdMode() {
      this.adMode = !this.adMode;
      localStorage.setItem('oasis_ad_mode', String(this.adMode));
      this.renderAdModeUI();

      if (this.adMode) {
        alert('💰 Ad Monetization Test Mode ENABLED.\n\nSimulating 1 pop-under click per session on player launch (as specified for Adsterra/Monetag monetization tests).\nClick again anytime to return to 100% clean Ad-Free Personal Mode.');
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
      if (!this.adMode || this.hasPoppedThisSession) return;
      this.hasPoppedThisSession = true;

      console.log('Ad-Mode Interceptor Triggered: 1 pop-under session simulated.');
      // Open a demo ad link in background tab as specified in monetization design
      try {
        const win = window.open('https://oasis-ai.solutions', '_blank');
        if (win) win.blur();
        window.focus();
      } catch (e) {
        console.warn('Pop-under blocker active in browser:', e);
      }
    }

    // --- Helpers ---
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

  // Expose global app instance
  window.app = new OasisApp();

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.app.init());
  } else {
    window.app.init();
  }
})();
