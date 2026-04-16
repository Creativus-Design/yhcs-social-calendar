/* ============================================================
   Social Media Calendar — app.js
   ============================================================ */

'use strict';

// ─── CONFIGURATION ──────────────────────────────────────────
const CONFIG = {
  password:    'YourHealthcareSpace2025',   // ← change this
  dataFile:    'data.json',
  storageKeys: {
    auth:  'smc_auth',
    cols:  'smc_cols',
  },
};

// ─── HELPERS ────────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function monthKey(post) {
  // "14-June-2025" → "june-2025"
  const parts = post['Publishing Date'].split('-');
  if (parts.length < 3) return 'undated';
  return `${parts[1].toLowerCase()}-${parts[2]}`;
}

function monthLabel(key) {
  if (key === 'undated') return 'Undated';
  const [m, y] = key.split('-');
  const date = new Date(`${m} 1, ${y}`);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function sortedMonthKey(key) {
  if (key === 'undated') return '9999-99';
  const [m, y] = key.split('-');
  const monthIndex = new Date(`${m} 1, 2000`).getMonth() + 1;
  return `${y}-${String(monthIndex).padStart(2,'0')}`;
}

function isVideo(url = '') {
  return /\.(mp4|webm|ogg|mov|avi)(\?|$)/i.test(url);
}

/** Extract YouTube video ID from any YouTube URL format */
function youTubeId(url = '') {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function isYouTube(url = '') { return !!youTubeId(url); }

/** Insert Cloudinary transformation params before the version/asset segment */
function cloudinaryThumb(url, transform = 'w_600,h_600,c_fill,q_auto:good,f_auto') {
  if (!url) return url;
  // Match: .../image/upload/{optional_existing_transforms}/{rest}
  const match = url.match(/^(https:\/\/res\.cloudinary\.com\/.+?\/image\/upload\/)(.+)$/);
  if (!match) return url; // not a Cloudinary image URL — return as-is
  // If there are already transforms present (contains a comma or 'w_'/'h_' etc), skip
  const rest = match[2];
  if (/^[a-z_]+:[^/]+/.test(rest)) {
    // Already has transforms — replace the first transform group
    return url.replace(/(\/image\/upload\/)([^/]+,)*[^/]+(\/v)/, `$1${transform}$3`);
  }
  return `${match[1]}${transform}/${rest}`;
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function decodeHtml(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

function getUrlMonth() {
  const p = new URLSearchParams(location.search);
  return p.get('month') || null;
}

function setUrlMonth(key) {
  const url = new URL(location.href);
  if (key) url.searchParams.set('month', key);
  else      url.searchParams.delete('month');
  history.replaceState(null, '', url.toString());
}

// ─── MAIN APP ───────────────────────────────────────────────
class SocialCalendarApp {
  constructor() {
    this.posts        = [];
    this.grouped      = {};   // monthKey → [posts]
    this.monthOrder   = [];   // sorted array of monthKeys
    this.currentMonth = null; // active month key

    this.shareModal   = null;
    this.activePost   = null;
  }

  // ── INIT ──────────────────────────────────────────────────
  async init() {
    this.setupPasswordScreen();
    if (this.isAuthenticated()) {
      await this.launchApp();
    }
  }

  // ── AUTH ──────────────────────────────────────────────────
  isAuthenticated() {
    return sessionStorage.getItem(CONFIG.storageKeys.auth) === '1';
  }

  setupPasswordScreen() {
    const screen   = $('#password-screen');
    const form     = $('#login-form');
    const input    = $('#pw-input');
    const errMsg   = $('#login-error');
    const toggleBtn= $('#toggle-pw');

    toggleBtn?.addEventListener('click', () => {
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      toggleBtn.textContent = isText ? '👁' : '🙈';
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (input.value === CONFIG.password) {
        sessionStorage.setItem(CONFIG.storageKeys.auth, '1');
        screen.style.transition = 'opacity 0.4s';
        screen.style.opacity    = '0';
        setTimeout(() => { screen.remove(); }, 400);
        await this.launchApp();
      } else {
        errMsg.textContent = '⚠️ Incorrect password. Please try again.';
        input.value = '';
        input.focus();
        input.style.borderColor = '#f87171';
        setTimeout(() => {
          errMsg.textContent = '';
          input.style.borderColor = '';
        }, 3000);
      }
    });

    // If already authenticated, hide screen immediately
    if (this.isAuthenticated()) {
      screen.style.display = 'none';
    }
    // ↓ Remove this line to disable the password hint easter egg
    this.setupPasswordHint();
  }

  // ── PASSWORD HINT (triple-click logo to reveal) ───────────
  // To disable: comment out the `this.setupPasswordHint()` call above.
  setupPasswordHint() {
    const logo  = $('.login-logo');
    const input = $('#pw-input');
    if (!logo || !input) return;

    let clickCount = 0;
    let clickTimer = null;

    logo.style.cursor = 'default'; // no visual tell

    logo.addEventListener('click', () => {
      clickCount++;
      clearTimeout(clickTimer);

      if (clickCount >= 3) {
        clickCount = 0;
        // Fill the password and briefly flash the logo
        input.type  = 'text';
        input.value = CONFIG.password;
        input.focus();
        logo.style.transform = 'scale(1.15)';
        logo.style.transition = 'transform 0.15s';
        setTimeout(() => {
          logo.style.transform = '';
          // Auto-hide after 4 seconds for security
          setTimeout(() => {
            if (input.type === 'text') {
              input.type  = 'password';
              input.value = '';
            }
          }, 4000);
        }, 150);
        return;
      }

      // Reset the counter if clicks are too slow (>500ms apart)
      clickTimer = setTimeout(() => { clickCount = 0; }, 500);
    });
  }

  // ── LAUNCH APP ────────────────────────────────────────────
  async launchApp() {
    const app = $('#app');
    app.style.display = 'block';

    // Fade in
    app.style.opacity = '0';
    app.style.transition = 'opacity 0.4s';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { app.style.opacity = '1'; });
    });

    await this.loadData();
    this.groupByMonth();
    this.buildMonthNav();
    this.renderAll();
    this.setupGridToggle();
    this.setupShareModal();
    this.setupLogout();
    this.setupScrollTop();
    this.handleUrlParam();
  }

  // ── DATA ──────────────────────────────────────────────────
  async loadData() {
    try {
      const res = await fetch(CONFIG.dataFile);
      this.posts = await res.json();
    } catch(e) {
      console.error('Failed to load data.json', e);
      this.posts = [];
    }
  }

  groupByMonth() {
    this.grouped = {};
    for (const post of this.posts) {
      const key = monthKey(post);
      if (!this.grouped[key]) this.grouped[key] = [];
      this.grouped[key].push(post);
    }
    this.monthOrder = Object.keys(this.grouped)
      .sort((a, b) => sortedMonthKey(a).localeCompare(sortedMonthKey(b)));
  }

  // ── MONTH NAV ─────────────────────────────────────────────
  buildMonthNav() {
    const sel = $('#month-select');
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled>Jump to month…</option>';
    for (const key of this.monthOrder) {
      const opt = document.createElement('option');
      opt.value       = key;
      opt.textContent = monthLabel(key);
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      if (sel.value) this.jumpToMonth(sel.value, true);
    });
  }

  setActiveNavPill(key) {
    const sel = $('#month-select');
    if (sel && sel.value !== key) sel.value = key;
  }

  // ── RENDER ────────────────────────────────────────────────
  renderAll() {
    const container = $('#calendar-container');
    if (!container) return;
    container.innerHTML = '';

    for (const key of this.monthOrder) {
      const posts   = this.grouped[key];
      const section = this.buildSection(key, posts);
      container.appendChild(section);
    }

    this.buildBottomNav();
    this.initFancybox();
  }

  buildSection(key, posts) {
    const section = document.createElement('section');
    section.className   = 'month-section';
    section.id          = `month-${key}`;
    section.dataset.month = key;

    // Heading
    const heading = document.createElement('div');
    heading.className = 'month-heading';
    heading.innerHTML = `
      <h2 class="month-heading-text">${monthLabel(key)}</h2>
      <div class="month-heading-line"></div>
      <span class="month-heading-count">${posts.length} post${posts.length !== 1 ? 's' : ''}</span>
    `;
    section.appendChild(heading);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    for (const post of posts) {
      grid.appendChild(this.buildCard(post));
    }
    section.appendChild(grid);
    return section;
  }

  buildCard(post) {
    const card  = document.createElement('article');
    card.className = 'post-card';

    const designUrl = (post['Design'] || '').trim();
    const isVid     = isVideo(designUrl);
    const hasMedia  = !!designUrl;

    // ── Card Header ──────────────────────────
    const header = document.createElement('div');
    header.className = 'card-header';

    const dateParts = (post['Publishing Date'] || 'No date').split('-');
    const dateStr   = post['Publishing Date']
      ? `${dateParts[0]} ${dateParts[1] || ''} ${dateParts[2] || ''}`.trim()
      : 'No date';

    header.innerHTML = `
      <div class="date-badge">
        <iconify-icon icon="mdi:calendar-outline" width="12" height="12"></iconify-icon>
        ${dateStr}
      </div>
      <div class="card-actions">
        <button class="action-btn share-btn" title="View social text">
          <iconify-icon icon="tabler:share" width="16" height="16"></iconify-icon>
        </button>
        <button class="action-btn copy-btn" title="Copy text to clipboard">
          <iconify-icon icon="tabler:copy" width="16" height="16"></iconify-icon>
        </button>
        ${hasMedia ? `
        <button class="action-btn download-btn" title="Download ${isVid ? 'video' : 'image'}">
          <iconify-icon icon="tabler:download" width="16" height="16"></iconify-icon>
        </button>` : ''}
      </div>
    `;

    // ── Media ─────────────────────────────────
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'card-media';

    if (hasMedia) {
      const typeBadge = `<span class="media-type-badge ${isVid ? 'video' : 'photo'}">${isVid ? '▶ Video' : '📷 Photo'}</span>`;

      // Thumbnail URL: optimized for card display; original kept for lightbox/download
      const ytId    = isYouTube(designUrl);
      const thumbUrl = ytId
        ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
        : isVid ? designUrl : cloudinaryThumb(designUrl);

      if (ytId) {
        // YouTube — open in new tab (embedding blocked from file:// origin)
        mediaWrap.innerHTML = `
          <img src="${thumbUrl}" alt="${post['Design Content'] || 'Video thumbnail'}" loading="lazy">
          <div class="media-overlay">
            <div class="media-play-icon yt-play">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          </div>
          <span class="media-type-badge video">▶ YouTube</span>
        `;
        mediaWrap.style.cursor = 'pointer';
        mediaWrap.addEventListener('click', () => window.open(designUrl, '_blank', 'noopener'));
      } else if (isVid) {
        mediaWrap.innerHTML = `
          <video src="${thumbUrl}" muted loop playsinline preload="none" poster=""></video>
          <div class="media-overlay">
            <div class="media-play-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          </div>
          ${typeBadge}
        `;
        // Fancybox data attrs
        mediaWrap.dataset.fancybox  = 'gallery';
        mediaWrap.dataset.src       = designUrl;   // original full-res
        mediaWrap.dataset.type      = 'video';
        mediaWrap.dataset.caption   = post['Design Content'] || '';
      } else {
        mediaWrap.innerHTML = `
          <img src="${thumbUrl}" alt="${post['Design Content'] || 'Post image'}" loading="lazy"
               onerror="this.parentElement.innerHTML='<div class=\\'media-placeholder\\'><span>🖼️</span><p>Image unavailable</p></div>'">
          <div class="media-overlay">
            <div class="media-play-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          </div>
          ${typeBadge}
        `;
        // Fancybox data attrs — always original full-res for lightbox
        mediaWrap.dataset.fancybox  = 'gallery';
        mediaWrap.dataset.src       = designUrl;   // original full-res
        mediaWrap.dataset.caption   = post['Design Content'] || '';
      }
    } else {
      mediaWrap.innerHTML = `
        <div class="media-placeholder">
          <span>📅</span>
          <p>No media</p>
        </div>
      `;
    }

    // ── Card Body ────────────────────────────
    const body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = `
      <div>
        <p class="card-design-label">Design Content</p>
        <p class="card-design-title">${post['Design Content'] || '—'}</p>
      </div>
      <div>
        <p class="card-text-label">Text Content</p>
        <p class="card-text-content">${post['Text Content'] || '—'}</p>
      </div>
      ${post['Hashtags'] ? `<p class="card-hashtags">${post['Hashtags']}</p>` : ''}
    `;

    card.appendChild(header);
    card.appendChild(mediaWrap);
    card.appendChild(body);

    // ── Event listeners ──────────────────────
    const shareBtn    = card.querySelector('.share-btn');
    const copyBtn     = card.querySelector('.copy-btn');
    const downloadBtn = card.querySelector('.download-btn');

    shareBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.openShareModal(post); });
    copyBtn?.addEventListener('click',  (e) => { e.stopPropagation(); this.copyText(post, copyBtn); });
    downloadBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.downloadMedia(designUrl, post['Design Content'] || 'media');
    });

    return card;
  }

  // ── BOTTOM NAV ────────────────────────────────────────────
  buildBottomNav() {
    const nav = $('#bottom-nav');
    if (!nav) return;
    nav.innerHTML = '';

    const idx  = this.currentMonth ? this.monthOrder.indexOf(this.currentMonth) : 0;
    const cur  = this.currentMonth || this.monthOrder[0];
    const curIdx = this.monthOrder.indexOf(cur);
    const prevKey = curIdx > 0 ? this.monthOrder[curIdx - 1] : null;
    const nextKey = curIdx < this.monthOrder.length - 1 ? this.monthOrder[curIdx + 1] : null;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'nav-month-btn prev';
    prevBtn.disabled  = !prevKey;
    prevBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      <div class="nav-month-btn-inner">
        <div class="nav-label">Previous</div>
        <div class="nav-name">${prevKey ? monthLabel(prevKey) : '—'}</div>
      </div>
    `;
    if (prevKey) prevBtn.addEventListener('click', () => this.jumpToMonth(prevKey, true));

    const nextBtn = document.createElement('button');
    nextBtn.className = 'nav-month-btn next';
    nextBtn.disabled  = !nextKey;
    nextBtn.innerHTML = `
      <div class="nav-month-btn-inner">
        <div class="nav-label">Next</div>
        <div class="nav-name">${nextKey ? monthLabel(nextKey) : '—'}</div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    `;
    if (nextKey) nextBtn.addEventListener('click', () => this.jumpToMonth(nextKey, true));

    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
  }

  jumpToMonth(key, updateNav = false) {
    this.currentMonth = key;
    setUrlMonth(key);
    if (updateNav) this.buildBottomNav();
    this.setActiveNavPill(key);

    const section = document.getElementById(`month-${key}`);
    if (section) {
      const headerH = $('.site-header')?.offsetHeight || 80;
      const top = section.getBoundingClientRect().top + window.scrollY - headerH - 20;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  handleUrlParam() {
    const key = getUrlMonth();
    if (key && this.monthOrder.includes(key)) {
      // Small delay to let layout render
      setTimeout(() => this.jumpToMonth(key), 200);
    } else {
      // Set first month as default active
      if (this.monthOrder.length) {
        this.currentMonth = this.monthOrder[0];
        this.setActiveNavPill(this.monthOrder[0]);
      }
    }

    // Intersection observer to update active nav as user scrolls
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const mk = entry.target.dataset.month;
          if (mk) {
            this.currentMonth = mk;
            setUrlMonth(mk);
            this.setActiveNavPill(mk);
            this.buildBottomNav();
          }
        }
      }
    }, { rootMargin: '-40% 0px -55% 0px' });

    $$('.month-section').forEach(s => observer.observe(s));
  }

  // ── GRID TOGGLE ───────────────────────────────────────────
  setupGridToggle() {
    const saved = parseInt(localStorage.getItem(CONFIG.storageKeys.cols)) || 3;
    this.setCols(saved);

    $$('.col-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setCols(parseInt(btn.dataset.cols));
      });
    });

    // Re-clamp on resize (e.g. rotating phone)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const pref = parseInt(localStorage.getItem(CONFIG.storageKeys.cols)) || 3;
        this.setCols(pref);
      }, 150);
    });
  }

  setCols(n) {
    // Respect viewport breakpoints — don't exceed what CSS would show
    const w = window.innerWidth;
    const maxCols = w <= 640 ? 1 : w <= 1024 ? 2 : 4;
    const clamped = Math.min(n, maxCols);
    document.documentElement.style.setProperty('--cols', clamped);
    localStorage.setItem(CONFIG.storageKeys.cols, n); // save original preference
    $$('.col-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.cols) === n));
  }

  // ── SHARE MODAL ───────────────────────────────────────────
  setupShareModal() {
    this.shareModal = $('#share-modal');
    const closeBtn  = $('#modal-close-btn');
    const cancelBtn = $('#modal-cancel-btn');
    const copyBtn   = $('#modal-copy-btn');

    const close = () => this.shareModal.classList.remove('open');
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    this.shareModal?.addEventListener('click', (e) => { if (e.target === this.shareModal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    copyBtn?.addEventListener('click', () => {
      if (this.activePost) {
        this.copyText(this.activePost, copyBtn);
      }
    });
  }

  openShareModal(post) {
    this.activePost = post;
    const socialHtml = decodeHtml(post['Text to publish on social media'] || '<p>No text available.</p>');
    const body = $('#modal-social-body');
    if (body) body.innerHTML = `<div class="social-text">${socialHtml}</div>`;
    const title = $('#modal-title-text');
    if (title) title.textContent = post['Design Content'] || 'Social Media Text';
    this.shareModal?.classList.add('open');
  }

  // ── COPY TEXT ─────────────────────────────────────────────
  async copyText(post, btn) {
    const socialHtml = decodeHtml(post['Text to publish on social media'] || '');
    const plain = stripHtml(socialHtml).trim();
    try {
      await navigator.clipboard.writeText(plain);
      const orig = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML = `<iconify-icon icon="tabler:check" width="16" height="16"></iconify-icon>`;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = orig;
      }, 2200);
    } catch(e) {
      alert('Copy failed. Please copy manually.');
    }
  }

  // ── DOWNLOAD ──────────────────────────────────────────────
  async downloadMedia(url, filename) {
    if (!url) return;
    try {
      const resp = await fetch(url, { mode: 'cors' });
      const blob = await resp.blob();
      const ext  = url.split('.').pop().split('?')[0] || 'jpg';
      const safe = filename.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50);
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `${safe}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch(e) {
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  }

  // ── FANCYBOX ──────────────────────────────────────────────
  initFancybox() {
    if (typeof Fancybox === 'undefined') return;
    Fancybox.bind('[data-fancybox]', {
      animated:  true,
      showClass: 'fancybox-zoomIn',
      hideClass: 'fancybox-fadeOut',
      Toolbar: {
        display: {
          left:   ['infobar'],
          middle: [],
          right:  ['download', 'close'],
        },
      },
      Html: {
        videoTpl:
          '<video class="fancybox__html5video" playsinline controls controlsList="nodownload" src="{{src}}"></video>',
      },
      Iframe: {
        css: { width: '90vw', height: '80vh' },
        attr: { allowfullscreen: true, allow: 'autoplay; fullscreen' },
      },
      caption: (fancybox, slide) => slide.el?.dataset?.caption || '',
    });
  }

  // ── LOGOUT ────────────────────────────────────────────────
  setupLogout() {
    $('#logout-btn')?.addEventListener('click', () => {
      sessionStorage.removeItem(CONFIG.storageKeys.auth);
      location.reload();
    });
  }

  // ── SCROLL TO TOP ─────────────────────────────────────────
  setupScrollTop() {
    const btn = $('#scroll-top-btn');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 400);
    });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
}

// ─── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  new SocialCalendarApp().init();
});
