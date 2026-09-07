/* Never interrupt an in-flight media seek; coalesce scroll updates to the latest position with watchdog and Safari clamp. */
class MdvVideoScrubber {
  constructor(video, { schedule = callback => (typeof window !== 'undefined' ? window.requestAnimationFrame(callback) : setTimeout(callback, 16)), cancel = id => (typeof window !== 'undefined' ? window.cancelAnimationFrame(id) : clearTimeout(id)), fps = 24 } = {}) {
    this.video = video;
    this.schedule = schedule;
    this.cancel = cancel;
    this.fps = fps;
    this.target = 0;
    this.active = true;
    this.raf = null;
    this.pendingSeek = false;
    this.seekWatchdog = null;
    this.seekingSince = 0;

    this.onReady = () => {
      this.pendingSeek = false;
      this.clearWatchdog();
      this.queue();
    };

    this.onSeeked = () => {
      this.pendingSeek = false;
      this.seekingSince = 0;
      this.clearWatchdog();
      this.queue();
    };

    video.addEventListener('loadedmetadata', this.onReady);
    video.addEventListener('loadeddata', this.onReady);
    video.addEventListener('seeked', this.onSeeked);
  }

  clearWatchdog() {
    if (this.seekWatchdog !== null) {
      clearTimeout(this.seekWatchdog);
      this.seekWatchdog = null;
    }
  }

  setProgress(progress, active = true) {
    const wasInactive = !this.active && active;
    this.target = Math.max(0, Math.min(1, progress));
    this.active = active;
    if (wasInactive) {
      this.pendingSeek = false;
      this.clearWatchdog();
    }
    if (active) {
      this.queue();
    } else if (this.raf !== null) {
      this.cancel(this.raf);
      this.raf = null;
    }
  }

  queue() {
    if (this.active && this.raf === null) {
      this.raf = this.schedule(() => {
        this.raf = null;
        this.flush();
      });
    }
  }

  flush() {
    const v = this.video;
    if (!this.active || !Number.isFinite(v.duration) || v.readyState < 1) return;

    if (this.pendingSeek || v.seeking) {
      if (!this.seekingSince) {
        this.seekingSince = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        return;
      }
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - this.seekingSince < 90) {
        return;
      }
      this.pendingSeek = false;
      this.seekingSince = 0;
      this.clearWatchdog();
    }

    const frame = 1 / this.fps;
    const maxTime = Math.max(0, v.duration - Math.max(0.08, 2 * frame));
    let time = this.target <= 0 ? 0 : Math.min(maxTime, Math.round(this.target * maxTime / frame) * frame);

    if (Math.abs(v.currentTime - time) < frame * 0.5) return;

    this.pendingSeek = true;
    this.seekingSince = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    this.clearWatchdog();
    this.seekWatchdog = setTimeout(() => {
      if (this.pendingSeek) {
        this.pendingSeek = false;
        this.seekingSince = 0;
        this.queue();
      }
    }, 100);

    try {
      v.currentTime = time;
    } catch {
      this.pendingSeek = false;
      this.seekingSince = 0;
      this.clearWatchdog();
    }
  }

  destroy() {
    if (this.raf !== null) this.cancel(this.raf);
    this.clearWatchdog();
    this.video.removeEventListener('loadedmetadata', this.onReady);
    this.video.removeEventListener('loadeddata', this.onReady);
    this.video.removeEventListener('seeked', this.onSeeked);
  }
}

if (typeof module !== 'undefined') module.exports = MdvVideoScrubber;
else window.MdvVideoScrubber = MdvVideoScrubber;
