(() => {
  /* ═════════════════════════════════════════════════════════════════
     MAISON D'VUE — ULTRA-FLUID 60FPS HERO CANVAS ENGINE
     Directly ported from Shubham's TPL Clinic Architecture
     ═════════════════════════════════════════════════════════════════ */
  const MDV_HERO_TOTAL_FRAMES = 524;
  const MDV_HERO_POSTER_SRC = "assets/hero-poster/hero-poster.webp?v=3";
  const MDV_HERO_MOBILE_VIDEO_SRC = "assets/hero-fallback/hero-mobile.mp4?v=2";
  const MDV_HERO_FRAME_PATH = (n) => "assets/hero-frames-webp/frame-" + String(n).padStart(4, "0") + ".webp?v=3";

  class MdvHeroCanvasEngine {
    constructor() {
      this.hero = document.getElementById('slide-elixir');
      this.sticky = document.getElementById('heroSticky');
      this.canvas = document.getElementById('heroCanvas');
      this.video = document.getElementById('heroMobileVideo');
      this.poster = document.getElementById('heroStaticPoster');
      this.loader = document.getElementById('hero-loader');
      this.fill = document.getElementById('hero-loader-fill');
      this.percentEl = document.getElementById('hero-loader-percent');
      this.statusEl = document.getElementById('hero-loader-status');
      this.beatEls = Array.from(document.querySelectorAll('.dv-hero-beat'));

      this.ctx = this.canvas ? this.canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
      this.images = new Array(MDV_HERO_TOTAL_FRAMES + 1);
      this.TOTAL_FRAMES = MDV_HERO_TOTAL_FRAMES;

      this.currentFrame = 1;
      this.targetFrame = 1;
      this.lastDrawnFrame = -1;
      this.scrollDir = 1;
      this.ticking = false;
      this.isScrolling = false;
      this.scrollTimeout = null;
      this.destroyed = false;
      this.loaderDismissed = false;
      this.lenis = null;
      this.heroVisible = true;
      this.heroObserver = null;

      const ua = navigator.userAgent || '';
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const narrow = window.innerWidth <= 820;
      this.isMobile = /Android|iPhone|iPod|Mobile/i.test(ua) || (isTouch && narrow);
      this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.markScrolling = this.markScrolling.bind(this);
      this.renderTick = this.renderTick.bind(this);
    }

    init() {
      if (this.isReducedMotion) {
        this.showStaticPoster();
        this.dismissLoadingScreen();
        return;
      }

      if (this.isMobile) {
        this.showMobileVideo();
        return;
      }

      // Desktop & Laptop: Ultra-Smooth Interactive Canvas Engine
      this.mountCanvas();
      this.initScrollEngine();
      this.initLenis();
      this.preloadRunwayAndStream();
    }

    showStaticPoster() {
      if (this.canvas) this.canvas.style.display = 'none';
      if (this.video) this.video.style.display = 'none';
      if (this.poster) this.poster.style.display = 'block';
    }

    showMobileVideo() {
      if (this.canvas) this.canvas.style.display = 'none';
      if (this.poster) this.poster.style.display = 'none';
      if (!this.video) {
        this.dismissLoadingScreen();
        return;
      }

      this.video.src = MDV_HERO_MOBILE_VIDEO_SRC;
      this.video.style.display = 'block';

      const safety = setTimeout(() => this.dismissLoadingScreen(), 800);
      const onReady = () => {
        clearTimeout(safety);
        this.video.play().catch(() => {});
        this.dismissLoadingScreen();
      };

      if (this.video.readyState >= 2) onReady();
      else {
        this.video.addEventListener('loadeddata', onReady, { once: true });
        this.video.addEventListener('canplay', onReady, { once: true });
        this.video.addEventListener('error', onReady, { once: true });
      }

      window.addEventListener('scroll', () => {
        if (!this.hero) return;
        const rect = this.hero.getBoundingClientRect();
        const scrollable = Math.max(1, rect.height - window.innerHeight);
        const p = Math.max(0, Math.min(1, -rect.top / scrollable));
        this.syncBeats(p);
      }, { passive: true });
    }

    mountCanvas() {
      if (!this.canvas) return;
      this.canvas.style.willChange = 'transform';
      this.canvas.style.transform = 'translateZ(0)';
      this.canvas.style.backfaceVisibility = 'hidden';
      this.updateCanvasDimensions();
      window.addEventListener('resize', () => this.updateCanvasDimensions(), { passive: true });
    }

    updateCanvasDimensions() {
      if (!this.canvas) return;
      const cssWidth = window.innerWidth;
      const cssHeight = window.innerHeight;
      if (cssWidth <= 0 || cssHeight <= 0) return;

      // Clamp DPR to max 1.5 and width to max 1920 to keep GPU fill-rate ultra fast (120fps) on Retina displays
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const maxW = 1920;
      let targetW = Math.round(cssWidth * dpr);
      let targetH = Math.round(cssHeight * dpr);
      if (targetW > maxW) {
        targetH = Math.round(targetH * (maxW / targetW));
        targetW = maxW;
      }

      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
      this.targetW = targetW;
      this.targetH = targetH;
      this.canvasAspect = targetW / targetH;

      // 16:9 source aspect (1600x900)
      const imgAspect = 16 / 9;
      if (this.canvasAspect > imgAspect) {
        this.drawW = targetW;
        this.drawH = Math.round(targetW / imgAspect);
        this.offsetX = 0;
        this.offsetY = Math.round((targetH - this.drawH) / 2);
      } else {
        this.drawH = targetH;
        this.drawW = Math.round(targetH * imgAspect);
        this.offsetX = Math.round((targetW - this.drawW) / 2);
        this.offsetY = 0;
      }

      if (this.ctx) {
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'medium';
      }

      if (this.lastDrawnFrame > 0) {
        this.drawSingleFrame(this.lastDrawnFrame);
      }
    }

    dismissLoadingScreen() {
      if (this.loaderDismissed) return;
      this.loaderDismissed = true;
      if (this.fill) this.fill.style.width = '100%';
      if (this.percentEl) this.percentEl.textContent = '100%';
      if (this.statusEl) this.statusEl.textContent = 'Beverly Hills · the ritual begins';
      if (this.loader) {
        this.loader.classList.add('loaded');
      }
      document.documentElement.style.removeProperty('overflow');
      document.body.style.removeProperty('overflow');
      if (this.lenis) this.lenis.start();
    }

    preloadRunwayAndStream() {
      let ready = false;
      const releaseScroll = () => {
        if (ready || this.destroyed) return;
        ready = true;
        this.dismissLoadingScreen();
        if (typeof this.renderTick === 'function') this.renderTick();

        // Controlled, prioritized window streaming:
        // Prefetches frames in a calm sliding window (+/- 25 frames) around current position
        let streamTimer = null;
        const streamAhead = () => {
          if (this.destroyed || !this.heroVisible) return;
          const center = Math.round(this.currentFrame || 1);
          const ahead = Math.min(this.TOTAL_FRAMES, center + 35);
          for (let f = center; f <= ahead; f++) {
            if (!this.images[f]) {
              this.loadFrame(f, 'low');
              break;
            }
          }
          if (this.heroVisible && !this.destroyed) {
            streamTimer = setTimeout(streamAhead, 50);
          }
        };
        setTimeout(streamAhead, 250);
      };

      // Strict safety timeout (never leave user stranded)
      const gateSafety = setTimeout(releaseScroll, 800);

      // 1. Pristine Master Poster on millisecond 0
      this.posterImg = new Image();
      if ('fetchPriority' in this.posterImg) this.posterImg.fetchPriority = 'high';
      this.posterImg.onload = () => {
        if (this.lastDrawnFrame <= 2) {
          this.drawPoster();
        }
      };
      this.posterImg.src = MDV_HERO_POSTER_SRC;

      const loadFrame = (idx, priority = 'low') => {
        if (this.destroyed || this.images[idx]) return Promise.resolve(this.images[idx]);
        return new Promise((resolve) => {
          const img = new Image();
          if (priority === 'high' && 'fetchPriority' in img) img.fetchPriority = 'high';
          img.onload = () => {
            this.images[idx] = img;
            if (idx === 1 && this.lastDrawnFrame <= 2) {
              this.drawSingleFrame(1);
            }
            resolve(img);
          };
          img.onerror = () => resolve(null);
          img.src = MDV_HERO_FRAME_PATH(idx);
        });
      };
      this.loadFrame = loadFrame;

      try {
        // Lock scroll during brief runway gate
        if (this.lenis) this.lenis.stop();
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Fast 15-frame runway: Unlocks in <150ms
        const RUNWAY = 15;
        let loadedCount = 0;
        for (let i = 1; i <= RUNWAY; i++) {
          loadFrame(i, 'high').then(() => {
            loadedCount++;
            const pct = Math.round((loadedCount / RUNWAY) * 100);
            if (this.fill) this.fill.style.width = pct + '%';
            if (this.percentEl) this.percentEl.textContent = pct + '%';
            if (loadedCount >= RUNWAY && !ready) {
              clearTimeout(gateSafety);
              releaseScroll();
            }
          });
        }
      } catch (e) {
        console.warn('Hero preloader caught error, releasing gate:', e);
        releaseScroll();
      }
    }

    fetchUrgentFrameChunk(targetFrame) {
      if (this.destroyed || !this.loadFrame) return;
      const dir = this.scrollDir || 1;
      const lo = dir > 0 ? targetFrame - 6 : targetFrame - 16;
      const hi = dir > 0 ? targetFrame + 16 : targetFrame + 6;
      for (let f = Math.max(1, lo); f <= Math.min(this.TOTAL_FRAMES, hi); f++) {
        if (!this.images[f]) {
          this.loadFrame(f, 'high');
        }
      }
    }

    posterReady() {
      return !!(this.posterImg && this.posterImg.complete && (this.posterImg.naturalWidth || this.posterImg.width));
    }

    drawPoster() {
      if (!this.ctx || !this.posterReady()) return;
      const pw = this.posterImg.naturalWidth || this.posterImg.width;
      const ph = this.posterImg.naturalHeight || this.posterImg.height;
      this.ctx.drawImage(this.posterImg, 0, 0, pw, ph, this.offsetX, this.offsetY, this.drawW, this.drawH);
    }

    drawSingleFrame(frameNum) {
      if (!this.ctx || !this.targetW) return;

      if (frameNum <= 2 && this.posterReady()) {
        this.drawPoster();
        this.lastDrawnFrame = frameNum;
        return;
      }

      const idx = Math.max(1, Math.min(this.TOTAL_FRAMES, frameNum));
      const img = this.images ? this.images[idx] : null;

      if (!img || !img.complete || !img.naturalWidth) {
        // Monotonic zero-flicker fallback: find nearest loaded frame within +/- 18
        if (this.images) {
          for (let delta = 1; delta <= 18; delta++) {
            const fPrev = idx - delta;
            if (fPrev >= 1 && this.images[fPrev] && this.images[fPrev].complete && this.images[fPrev].naturalWidth) {
              this.ctx.drawImage(this.images[fPrev], this.offsetX, this.offsetY, this.drawW, this.drawH);
              return;
            }
            const fNext = idx + delta;
            if (fNext <= this.TOTAL_FRAMES && this.images[fNext] && this.images[fNext].complete && this.images[fNext].naturalWidth) {
              this.ctx.drawImage(this.images[fNext], this.offsetX, this.offsetY, this.drawW, this.drawH);
              return;
            }
          }
        }
        if (this.posterReady()) this.drawPoster();
        return;
      }

      try {
        this.ctx.drawImage(img, this.offsetX, this.offsetY, this.drawW, this.drawH);
        this.lastDrawnFrame = frameNum;
      } catch (e) {
        if (this.posterReady()) this.drawPoster();
      }
    }

    markScrolling() {
      this.isScrolling = true;
      if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => {
        this.isScrolling = false;
      }, 150);
    }

    renderTick(y) {
      if (y !== undefined && y !== null) this.scrollY = y;
      else this.scrollY = window.scrollY;
      if (!this.heroVisible) return; // Completely pause canvas work when hero is off-screen
      if (!this.ticking) {
        this.ticking = true;
        requestAnimationFrame(this._performRender || (() => {}));
      }
    }

    initLenis() {
      if (typeof Lenis === 'undefined') return;
      this.lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 0.88,
        touchMultiplier: 1.0,
        infinite: false
      });

      const raf = (time) => {
        if (this.destroyed) return;
        this.lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);

      const self = this;
      this.lenis.on('scroll', (e) => {
        if (typeof self.markScrolling === 'function') self.markScrolling();
        if (typeof self.renderTick === 'function') self.renderTick(e ? e.scroll : window.scrollY);
      });
    }

    initScrollEngine() {
      this.measureLayout = () => {
        const vh = window.innerHeight;
        const heroH = this.hero ? this.hero.offsetHeight : 0;
        const heroTop = this.hero ? (this.hero.getBoundingClientRect().top + window.scrollY) : 0;
        this.m = {
          vh,
          heroTop,
          heroH,
          heroScrollable: heroH - vh
        };
      };
      this.measureLayout();
      window.addEventListener('resize', this.measureLayout, { passive: true });
      [300, 1000, 2500].forEach(ms => setTimeout(this.measureLayout, ms));

      if ('IntersectionObserver' in window && this.hero) {
        this.heroObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            this.heroVisible = entry.isIntersecting;
            if (this.heroVisible) {
              this.renderTick();
            }
          });
        }, { rootMargin: '100px 0px' });
        this.heroObserver.observe(this.hero);
      }

      this.getScrollProgress = () => {
        const m = this.m;
        if (!m || m.heroScrollable <= 0) return 0;
        const curY = (this.scrollY !== undefined && this.scrollY !== null) ? this.scrollY : window.scrollY;
        const raw = (curY - m.heroTop) / m.heroScrollable;
        return Math.max(0, Math.min(1, raw || 0));
      };

      this._performRender = () => {
        this.ticking = false;
        if (!this.heroVisible) return;

        const p = this.getScrollProgress();
        const targetFrame = Math.max(1, Math.min(this.TOTAL_FRAMES, Math.round(p * (this.TOTAL_FRAMES - 1)) + 1));
        this.scrollDir = targetFrame >= this.currentFrame ? 1 : -1;
        this.currentFrame = targetFrame;

        this.fetchUrgentFrameChunk(this.currentFrame);
        this.drawSingleFrame(this.currentFrame);
        this.syncBeats(p);
      };

      window.addEventListener('scroll', () => {
        if (this.lenis) return;
        this.markScrolling();
        this.renderTick(window.scrollY);
      }, { passive: true });
    }

    syncBeats(p) {
      if (!this.beatEls.length) return;
      this.beatEls.forEach((el) => {
        const start = parseFloat(el.dataset.start);
        const end = parseFloat(el.dataset.end);
        el.classList.toggle('is-active', p >= start && p <= end);
      });
    }

    destroy() {
      this.destroyed = true;
      if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
      this.heroObserver?.disconnect();
      this.lenis?.destroy();
    }
  }

  function startHeroEngine() {
    if (window.heroCanvasEngine) return;
    var heroCanvasEngine = new MdvHeroCanvasEngine();
    window.heroCanvasEngine = heroCanvasEngine;
    heroCanvasEngine.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", startHeroEngine);
  } else {
    startHeroEngine();
  }
})();
