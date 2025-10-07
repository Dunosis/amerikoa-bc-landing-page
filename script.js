// Amerikoa Bakery Creations - Interactive Features

/**
 * Sprinkle Border SVG Generator
 * - Draws sprinkle shapes only inside an "edge band" around the container
 * - Responsive: regenerates on resize (debounced)
 * - Deterministic: pass data-seed on .sprinkle-border to lock layout
 * - Tweakable parameters below
 */

(function () {
  // ====== CONFIG ======
  const CONFIG = {
    borderThickness: 100,       // px thickness of sprinkle band from each edge
    density: 0.00055,           // sprinkles per px^2 in the band (adjust to taste)
    minScale: 1.4,              // size variability
    maxScale: 2.5,
    rotate: true,               // random rotation for shapes
    jitter: 8,                  // small positional jitter (px)
    // Color palette (tweak to match brand)
    colors: [
      "#FF4D6D", "#FF9F1C", "#FFD166", "#70D6FF",
      "#06D6A0", "#B28DFF", "#FF7AC6", "#FFD1DC"
    ],
    // Available shapes: "pill", "star", "heart", "dot"
    shapes: ["pill", "star", "heart", "dot"],
    // Corner keep-out radius for cleaner corners (px)
    cornerClear: 1,
    // Regenerate on resize? (true keeps density visually consistent)
    regenerateOnResize: true
  };

  // ====== UTILITIES ======
  // Deterministic PRNG (Mulberry32)
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  // Hash a string to 32-bit int
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function randBetween(rng, min, max) {
    return min + (max - min) * rng();
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // Corner keep-out check
  function farFromCorners(x, y, w, h, pad) {
    const corners = [
      [0, 0], [w, 0], [0, h], [w, h]
    ];
    for (const [cx, cy] of corners) {
      const dx = x - cx, dy = y - cy;
      if (Math.hypot(dx, dy) < pad) return false;
    }
    return true;
  }

  // ====== SHAPES ======
  function makePill(svg, x, y, w, h, fill, rot) {
    const r = Math.min(w, h) / 2;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${x} ${y}) rotate(${rot})`);
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("x", -w/2);
    rect.setAttribute("y", -h/2);
    rect.setAttribute("rx", r);
    rect.setAttribute("ry", r);
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);
    rect.setAttribute("fill", fill);
    g.appendChild(rect);
    return g;
  }

  function makeDot(svg, x, y, r, fill) {
    const c = document.createElementNS(svg.namespaceURI, "circle");
    c.setAttribute("cx", x);
    c.setAttribute("cy", y);
    c.setAttribute("r", r);
    c.setAttribute("fill", fill);
    return c;
  }

  function makeStar(svg, x, y, size, fill, rot) {
    // 5-point star
    const g = document.createElementNS(svg.namespaceURI, "g");
    g.setAttribute("transform", `translate(${x} ${y}) rotate(${rot})`);
    const p = document.createElementNS(svg.namespaceURI, "path");
    const outer = size, inner = size * 0.45;
    let d = "";
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = (i % 2 === 0) ? outer : inner;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      d += (i === 0 ? "M" : "L") + px + " " + py + " ";
    }
    d += "Z";
    p.setAttribute("d", d);
    p.setAttribute("fill", fill);
    g.appendChild(p);
    return g;
  }

  function makeHeart(svg, x, y, size, fill, rot) {
    const g = document.createElementNS(svg.namespaceURI, "g");
    g.setAttribute("transform", `translate(${x} ${y}) rotate(${rot}) scale(${size/10})`);
    const p = document.createElementNS(svg.namespaceURI, "path");
    // Simple heart path centered at 0,0
    p.setAttribute(
      "d",
      "M0,-6 C-5,-11 -12,-4 -8,2 C-5,6 0,10 0,10 C0,10 5,6 8,2 C12,-4 5,-11 0,-6 Z"
    );
    p.setAttribute("fill", fill);
    g.appendChild(p);
    return g;
  }

  // ====== CORE RENDERER ======
  function renderSprinkles(container, options = {}) {
    const cfg = { ...CONFIG, ...options };

    const svg = container.querySelector(".sprinkle-svg");
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    // Setup SVG viewport
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // RNG seed (deterministic if data-seed is set)
    const seedStr = container.getAttribute("data-seed") || (Date.now() + ":" + Math.random());
    const rng = mulberry32(hashString(seedStr + "|" + width + "x" + height));

    // Band area (top, bottom, left, right)
    const t = cfg.borderThickness;
    const bandArea =
      (width * t) + (width * t) + ((height - 2 * t) * t) + ((height - 2 * t) * t);
    const sprinkleCount = Math.max(16, Math.floor(bandArea * cfg.density));

    // Helper to sample a point in the band uniformly
    function sampleBandPoint() {
      // Choose which band by weighted area
      const areas = [
        { name: "top", a: width * t },
        { name: "bottom", a: width * t },
        { name: "left", a: (height - 2 * t) * t },
        { name: "right", a: (height - 2 * t) * t }
      ];
      const totalA = areas.reduce((s, b) => s + b.a, 0);
      let r = rng() * totalA;
      let band = areas[0];
      for (const b of areas) { r -= b.a; if (r <= 0) { band = b; break; } }

      let x, y;
      switch (band.name) {
        case "top":
          x = randBetween(rng, 0, width);
          y = randBetween(rng, 0, t);
          break;
        case "bottom":
          x = randBetween(rng, 0, width);
          y = randBetween(rng, height - t, height);
          break;
        case "left":
          x = randBetween(rng, 0, t);
          y = randBetween(rng, t, height - t);
          break;
        case "right":
          x = randBetween(rng, width - t, width);
          y = randBetween(rng, t, height - t);
          break;
      }

      // Corner keep-out + jitter
      const jitter = cfg.jitter;
      x = Math.min(width, Math.max(0, x + randBetween(rng, -jitter, jitter)));
      y = Math.min(height, Math.max(0, y + randBetween(rng, -jitter, jitter)));

      if (!farFromCorners(x, y, width, height, cfg.cornerClear)) {
        return sampleBandPoint(); // resample if too close to a corner
      }
      return { x, y };
    }

    // Draw sprinkles
    for (let i = 0; i < sprinkleCount; i++) {
      const { x, y } = sampleBandPoint();
      const scale = randBetween(rng, cfg.minScale, cfg.maxScale);
      const color = pick(rng, cfg.colors);
      const shape = pick(rng, cfg.shapes);
      const rot = cfg.rotate ? Math.floor(randBetween(rng, 0, 360)) : 0;

      let node;
      switch (shape) {
        case "pill": {
          const w = 18 * scale, h = 8 * scale;
          node = makePill(svg, x, y, w, h, color, rot);
          break;
        }
        case "dot": {
          node = makeDot(svg, x, y, 4 * scale, color);
          break;
        }
        case "star": {
          node = makeStar(svg, x, y, 6 * scale, color, rot);
          break;
        }
        case "heart": {
          node = makeHeart(svg, x, y, 10 * scale, color, rot);
          break;
        }
      }
      svg.appendChild(node);
    }
  }

  // ====== BOOTSTRAP ======
  const all = document.querySelectorAll(".sprinkle-border");
  function initAll() { all.forEach(el => renderSprinkles(el)); }
  initAll();

  // Debounced resize regen (keeps density consistent)
  if (CONFIG.regenerateOnResize) {
    let to;
    window.addEventListener("resize", () => {
      clearTimeout(to);
      to = setTimeout(initAll, 150);
    });
  }

  // Optional: expose API for manual refresh/tuning
  window.SprinkleBorder = {
    refresh(container = document.querySelector(".sprinkle-border"), opts = {}) {
      renderSprinkles(container, opts);
    }
  };
})();

document.addEventListener('DOMContentLoaded', function() {
    
    // Smooth scrolling for anchor links
    const smoothScrollLinks = document.querySelectorAll('a[href^="#"]');
    smoothScrollLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });


    // Contact button functionality - now links to contact page
    const contactBtn = document.querySelector('.contact-btn');
    if (contactBtn) {
        // No need for click handler since it's now a direct link
        console.log('Contact button links to Amerikoa contact page');
    }

    // Product card hover effects enhancement
    const productCards = document.querySelectorAll('.product-card');
    productCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });

    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe sections for scroll animations
    const sections = document.querySelectorAll('.products-section, .usa-pride, .certifications, .contact');
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });

    // Lazy loading for images
    const images = document.querySelectorAll('img');
    const imageObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.style.opacity = '1';
                imageObserver.unobserve(img);
            }
        });
    });

    images.forEach(img => {
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.5s ease';
        imageObserver.observe(img);
    });

    // Mobile menu toggle (if needed in future)
    function createMobileMenu() {
        // This can be expanded if a mobile navigation menu is added
        console.log('Mobile menu functionality ready');
    }

    // Performance optimization: Preload critical images
    function preloadImages() {
        const criticalImages = [
            'http://localhost:3845/assets/1dd6bc2bb24465340c50ca0eedc2b02c6f983cea.png', // Logo
            'http://localhost:3845/assets/d4ec5b62302d185c4d3b2b5b4a52ee76f210edd9.png', // First product
        ];
        
        criticalImages.forEach(src => {
            const img = new Image();
            img.src = src;
        });
    }

    // Initialize performance optimizations
    preloadImages();

    // Add loading states
    function addLoadingStates() {
        const buttons = document.querySelectorAll('button, .contact-btn');
        buttons.forEach(button => {
            button.addEventListener('click', function() {
                this.style.opacity = '0.7';
                this.style.pointerEvents = 'none';
                
                setTimeout(() => {
                    this.style.opacity = '1';
                    this.style.pointerEvents = 'auto';
                }, 1000);
            });
        });
    }

    addLoadingStates();

    // Accessibility improvements
    function enhanceAccessibility() {
        // Add keyboard navigation for product cards
        productCards.forEach(card => {
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', 'View product details');
            
            card.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.click();
                }
            });
        });

        // Add focus indicators
        const focusableElements = document.querySelectorAll('button, a, [tabindex]');
        focusableElements.forEach(element => {
            element.addEventListener('focus', function() {
                this.style.outline = '3px solid #0b44aa';
                this.style.outlineOffset = '2px';
            });
            
            element.addEventListener('blur', function() {
                this.style.outline = 'none';
            });
        });
    }

    enhanceAccessibility();

    // Error handling for images
    function handleImageErrors() {
        images.forEach(img => {
            img.addEventListener('error', function() {
                this.style.display = 'none';
                console.warn('Failed to load image:', this.src);
            });
        });
    }

    handleImageErrors();

    // Console welcome message
    console.log('%c🍰 Amerikoa Bakery Creations', 'color: #0b44aa; font-size: 20px; font-weight: bold;');
    console.log('%cWebsite loaded successfully!', 'color: #fe3030; font-size: 14px;');
});

// Service Worker registration for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Uncomment when service worker is implemented
        // navigator.serviceWorker.register('/sw.js');
    });
}
