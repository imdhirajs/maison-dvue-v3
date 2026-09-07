(() => {
  const hero = document.getElementById('slide-elixir');
  const sticky = document.getElementById('heroSticky');
  const video = document.getElementById('heroVideo');
  const loader = document.getElementById('hero-loader');
  const fill = document.getElementById('hero-loader-fill');
  const percentEl = document.getElementById('hero-loader-percent');
  const statusEl = document.getElementById('hero-loader-status');
  const poster = document.getElementById('heroStaticPoster');
  const endPoster = document.getElementById('heroEndPoster');
  if (!hero || !sticky || !video) return;

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  let lenis = null;
  if (typeof Lenis !== 'undefined') {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5
    });
    lenis.stop();
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    lenis.on('scroll', schedule);
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const scrubber = new MdvVideoScrubber(video, { fps: 24 });

  let raf = 0;
  let isLoaded = false;
  let currentProgress = 0;

  const storyMilestones = [
    { at: 0, text: 'Beverly Hills · the ritual begins' },
    { at: 24, text: 'Ame de Vue — our signature scent, sealed in' },
    { at: 50, text: 'A single dropper, warmed between palms' },
    { at: 75, text: 'Drawn through hair, strand by strand' },
    { at: 94, text: 'The Hair Elixir · ready' }
  ];
  let activeMilestoneText = '';

  function setLoaderProgress(pct, customText) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (fill) fill.style.width = `${clamped}%`;
    if (percentEl) percentEl.textContent = `${clamped}%`;

    let targetText = customText;
    if (!targetText) {
      for (let i = storyMilestones.length - 1; i >= 0; i--) {
        if (clamped >= storyMilestones[i].at) {
          targetText = storyMilestones[i].text;
          break;
        }
      }
    }

    if (statusEl && targetText && targetText !== activeMilestoneText) {
      activeMilestoneText = targetText;
      statusEl.style.opacity = '0';
      setTimeout(() => {
        statusEl.textContent = targetText;
        statusEl.style.opacity = '1';
      }, 160);
    }
  }

  function syncScene() {
    document.querySelectorAll('.dv-hero-beat').forEach((el) => {
      const start = parseFloat(el.dataset.start);
      const end = parseFloat(el.dataset.end);
      el.classList.toggle('is-active', currentProgress >= start && currentProgress <= end);
    });

    if (endPoster) {
      if (currentProgress >= 0.98) {
        endPoster.style.opacity = '1';
      } else if (currentProgress < 0.96) {
        endPoster.style.opacity = '0';
      }
    }
  }

  function finishLoading() {
    if (isLoaded) return;
    isLoaded = true;

    setLoaderProgress(100, 'The Hair Elixir · ready');
    video.style.opacity = '1';
    syncScene();

    setTimeout(() => {
      loader?.classList.add('loaded');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      lenis?.start();
      update();
    }, 280);
  }

  function update() {
    raf = 0;
    const rect = hero.getBoundingClientRect();
    const scrollRange = Math.max(1, rect.height - innerHeight);
    const progress = Math.max(0, Math.min(1, -rect.top / scrollRange));
    currentProgress = progress;

    const visible = rect.bottom > 0 && rect.top < innerHeight && !document.hidden;
    scrubber.setProgress(reduced.matches ? 0 : progress, visible);

    syncScene();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(update);
  }

  function preloadVideo(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';

      xhr.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const pct = (e.loaded / e.total) * 92;
          setLoaderProgress(pct);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          try {
            const blobUrl = URL.createObjectURL(xhr.response);
            resolve(blobUrl);
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(`Failed to load video: HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error loading video'));
      xhr.send();
    });
  }

  async function init() {
    const videoUrl = video.getAttribute('data-src') || video.src || 'assets/hero-scrub/hero-scrub.mp4';

    if (poster && !poster.complete) {
      poster.decode?.().catch(() => {});
    }
    if (endPoster && !endPoster.complete) {
      endPoster.decode?.().catch(() => {});
    }

    try {
      setLoaderProgress(4);
      const blobUrl = await preloadVideo(videoUrl);

      setLoaderProgress(96);
      video.src = blobUrl;
      video.load();

      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('loadeddata', onCanPlay);
        try { video.currentTime = 0.001; } catch {}
        finishLoading();
      };

      if (video.readyState >= 2) {
        onCanPlay();
      } else {
        video.addEventListener('canplay', onCanPlay, { once: true });
        video.addEventListener('loadeddata', onCanPlay, { once: true });
        setTimeout(finishLoading, 4000);
      }
    } catch (err) {
      console.warn('Preload via blob failed, falling back to direct video stream:', err);
      setLoaderProgress(80);
      video.src = videoUrl;
      video.load();
      video.addEventListener('loadeddata', finishLoading, { once: true });
      setTimeout(finishLoading, 3000);
    }
  }

  video.addEventListener('seeked', syncScene);
  video.addEventListener('error', () => {
    video.style.opacity = '0';
    finishLoading();
  });

  ['scroll', 'resize', 'pageshow'].forEach(event => window.addEventListener(event, schedule, { passive: true }));
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);

  if (reduced.matches) {
    hero.style.height = '100vh';
  }

  init();
})();
