/**
 * Slideshow VH Height Stabilizer
 * Ensures stable viewport height behavior on mobile devices, especially iOS Safari
 */

class SlideshowVHStabilizer {
  constructor() {
    this.init();
  }

  init() {
    // Only run if custom VH is enabled
    const slideshowsWithVH = document.querySelectorAll('[style*="--slideshow-custom-height"]');
    if (slideshowsWithVH.length === 0) return;

    this.updateVHValues();
    this.bindEvents();
  }

  updateVHValues() {
    // Calculate actual viewport height
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh-actual', `${vh}px`);

    // Update slideshow custom heights to use actual VH
    const slideshowsWithVH = document.querySelectorAll('[style*="--slideshow-custom-height"]');
    slideshowsWithVH.forEach(slideshow => {
      const style = slideshow.getAttribute('style');
      if (style) {
        const vhMatch = style.match(/--slideshow-custom-height:\s*(\d+)vh/);
        if (vhMatch && vhMatch[1]) {
          const vhValue = parseInt(vhMatch[1], 10);
          const actualHeight = `calc(${vhValue} * var(--vh-actual))`;
          if (slideshow instanceof HTMLElement) {
            slideshow.style.setProperty('--slideshow-custom-height-actual', actualHeight);
          }
        }
      }
    });
  }

  bindEvents() {
    // Throttled resize handler
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        this.updateVHValues();
      }, 100);
    });

    // Handle orientation change on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.updateVHValues();
      }, 500); // Delay to ensure viewport has stabilized
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SlideshowVHStabilizer();
  });
} else {
  new SlideshowVHStabilizer();
}

// Re-initialize on theme section loads (for Shopify theme editor)
document.addEventListener('shopify:section:load', () => {
  new SlideshowVHStabilizer();
});