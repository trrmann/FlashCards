/**
 * Navigation Tracking Utility
 * Tracks page visits and updates last visited page in the database
 * Browser-side code - window and document are global objects
 */

/* eslint-disable no-undef */

class NavigationTracker {
  constructor() {
    this.debounceTimer = null;
    this.debounceDelay = 1000; // Wait 1 second before sending tracking event
    // Pages that should NOT be saved as last visited
    this.excludedPages = ['/logout', '/login', '/register'];
    this.init();
  }

  init() {
    // Track page on load
    this.trackCurrentPage();

    // Listen for navigation changes
    window.addEventListener('popstate', () => this.trackCurrentPage());

    // Track when user navigates away
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (link && !link.target && link.href) {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('http')) {
          this.trackPage(href);
        }
      }
    });
  }

  /**
   * Track the current page
   */
  trackCurrentPage() {
    const currentPath = window.location.pathname;
    this.trackPage(currentPath);
  }

  /**
   * Track a page visit (debounced)
   * @param {string} page - Page path to track
   */
  trackPage(page) {
    // Skip tracking excluded pages (logout, login, register, etc.)
    if (this.excludedPages.includes(page)) {
      return;
    }

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce tracking to avoid too many requests
    this.debounceTimer = setTimeout(() => {
      this.sendTrackingEvent(page);
    }, this.debounceDelay);
  }

  /**
   * Send tracking event to server
   * @param {string} page - Page path to track
   */
  async sendTrackingEvent(page) {
    try {
      const response = await fetch('/api/navigation/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ page }),
      });

      if (!response.ok) {
        console.warn('Failed to track page visit:', response.statusText);
      }
    } catch (error) {
      // Silently fail - don't disrupt user experience
      console.debug('Navigation tracking error:', error);
    }
  }
}

// Initialize tracker when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new NavigationTracker();
  });
} else {
  new NavigationTracker();
}
