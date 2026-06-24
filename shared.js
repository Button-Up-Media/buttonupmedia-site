// ─── Initialize Lucide Icons ───
if (window.lucide && typeof lucide.createIcons === "function") {
  lucide.createIcons();
}

// ─── Cookie / Ads Consent ───
(() => {
  const storageKey = "bum-cookie-consent-v1";
  const rejectSessionKey = "bum-cookie-reject-session-v1";
  const bannerId = "bum-consent-banner";
  const hasGlobalPrivacyControl = typeof navigator !== "undefined" && navigator.globalPrivacyControl === true;

  const readPersistedState = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        analytics: !!parsed.analytics,
        marketing: !!parsed.marketing,
      };
    } catch (error) {
      return null;
    }
  };

  const readSessionReject = () => {
    try {
      return sessionStorage.getItem(rejectSessionKey) === "1";
    } catch (error) {
      return false;
    }
  };

  const readDecision = () => {
    const persisted = readPersistedState();
    if (persisted) {
      return {
        mode: "accept",
        state: {
          analytics: !!persisted.analytics,
          marketing: hasGlobalPrivacyControl ? false : !!persisted.marketing,
        },
      };
    }

    if (readSessionReject()) {
      return {
        mode: "reject",
        state: { analytics: false, marketing: false },
      };
    }

    return null;
  };

  const stateToConsent = (state) => ({
    ad_storage: state.marketing ? "granted" : "denied",
    ad_user_data: state.marketing ? "granted" : "denied",
    ad_personalization: state.marketing ? "granted" : "denied",
    analytics_storage: state.analytics ? "granted" : "denied",
    functionality_storage: "granted",
    personalization_storage: state.marketing ? "granted" : "denied",
    security_storage: "granted",
    wait_for_update: 500,
  });

  const pushConsent = (state) => {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "update", stateToConsent(state));
    window.dataLayer.push({
      event: "bum_consent_update",
      analytics_consent: state.analytics ? "granted" : "denied",
      marketing_consent: state.marketing ? "granted" : "denied",
    });
  };

  const saveDecision = (mode) => {
    const acceptedState = {
      analytics: true,
      marketing: hasGlobalPrivacyControl ? false : true,
    };
    const rejectedState = {
      analytics: false,
      marketing: false,
    };
    const nextState = mode === "accept" ? acceptedState : rejectedState;

    try {
      if (mode === "accept") {
        localStorage.setItem(storageKey, JSON.stringify({
          analytics: true,
          marketing: !hasGlobalPrivacyControl,
        }));
        sessionStorage.removeItem(rejectSessionKey);
      } else {
        localStorage.removeItem(storageKey);
        sessionStorage.setItem(rejectSessionKey, "1");
      }
    } catch (error) {
      // Storage can be unavailable in hardened browsers; consent still updates in-session.
    }

    pushConsent(nextState);
    window.dispatchEvent(new CustomEvent("bum:consent-choice", { detail: { mode, state: nextState } }));
    window.location.reload();
  };

  const renderBanner = () => {
    if (document.getElementById(bannerId)) return;

    const banner = document.createElement("div");
    banner.id = bannerId;
    banner.className = "bum-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-labelledby", "bum-consent-title");
    banner.setAttribute("aria-describedby", "bum-consent-copy");

    // Locale-aware copy: pages set <html lang>. Spanish pages (lang="es")
    // get translated strings; every other page keeps the original English.
    const isEs = (document.documentElement.lang || "").toLowerCase().indexOf("es") === 0;
    const t = isEs
      ? {
          close: "Cerrar el aviso de cookies",
          title: "Tu privacidad nos importa",
          copy: 'Usamos cookies para mejorar tu experiencia de navegación, mostrar anuncios personalizados y analizar nuestro tráfico. Al seguir navegando, aceptas el uso de cookies. Elige "Rechazar" para desactivarlas.',
          actions: "Acciones de consentimiento de cookies",
          policy: "Política de Privacidad",
          reject: "Rechazar",
          accept: "Entendido",
        }
      : {
          close: "Close cookie banner",
          title: "We value your privacy",
          copy: 'We use cookies to enhance your browsing experience, serve personalized ads, and analyze our traffic. By continuing to browse, you consent to the use of cookies. Choose "Opt out" to disable them.',
          actions: "Cookie consent actions",
          policy: "Privacy Policy",
          reject: "Opt out",
          accept: "Got it",
        };

    banner.innerHTML = `
      <div class="bum-consent__sheet" id="bum-consent-panel">
        <button type="button" class="bum-consent__close" data-bum-consent-action="accept" aria-label="${t.close}">
          <i data-lucide="x" aria-hidden="true"></i>
        </button>
        <div class="bum-consent__sheet-copy">
          <h2 class="bum-consent__title" id="bum-consent-title">${t.title}</h2>
          <p class="bum-consent__copy" id="bum-consent-copy">
            ${t.copy}
          </p>
        </div>
        <div class="bum-consent__actions" aria-label="${t.actions}">
          <div class="bum-consent__actions-group">
            <a href="/privacy" class="bum-consent__policy">${t.policy}</a>
            <button type="button" class="bum-consent__link" data-bum-consent-action="reject">${t.reject}</button>
          </div>
          <button type="button" class="bum-consent__button --primary" data-bum-consent-action="accept">${t.accept}</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);
    if (window.lucide && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }

    banner.addEventListener("click", (event) => {
      const button = event.target.closest("[data-bum-consent-action]");
      if (!button) return;

      const action = button.getAttribute("data-bum-consent-action");
      if (action === "accept") {
        saveDecision("accept");
        return;
      }
      if (action === "reject") {
        saveDecision("reject");
      }
    });
  };

  const initConsent = () => {
    const decision = readDecision();
    // Implied-consent (opt-out) default: a first-time visitor is tracked on
    // arrival. The banner still appears so they can opt out. Global Privacy
    // Control still forces marketing off.
    const defaultState = {
      analytics: true,
      marketing: !hasGlobalPrivacyControl,
    };
    if (decision) {
      pushConsent(decision.state);
      return;
    }
    pushConsent(defaultState);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
    } else {
      renderBanner();
    }
  };

  initConsent();
})();

// ─── Mobile nav: tap outside to close ───
(() => {
  const navDropdowns = document.querySelectorAll(".lib-nav-dropdown");
  if (!navDropdowns.length) return;

  const isMobileNav = window.matchMedia("(max-width: 700px)");

  const closeDropdown = dropdown => {
    dropdown.removeAttribute("open");
    dropdown.querySelectorAll("details[open]").forEach(childDropdown => {
      childDropdown.removeAttribute("open");
    });
  };

  navDropdowns.forEach(dropdown => {
    const trigger = dropdown.querySelector(".lib-nav-dropdown-trigger");

    if (trigger && !dropdown.dataset.enhanced) {
      dropdown.dataset.enhanced = "1";
      trigger.addEventListener("click", event => {
        event.preventDefault();
        const shouldOpen = !dropdown.hasAttribute("open");

        navDropdowns.forEach(openDropdown => {
          if (openDropdown !== dropdown) closeDropdown(openDropdown);
        });

        if (shouldOpen) {
          dropdown.setAttribute("open", "");
        } else {
          closeDropdown(dropdown);
        }
      });
    }
  });

  const closeOnOutsideInteraction = event => {
    if (!isMobileNav.matches) return;
    navDropdowns.forEach(dropdown => {
      if (dropdown.hasAttribute("open") && !dropdown.contains(event.target)) {
        closeDropdown(dropdown);
      }
    });
  };

  document.addEventListener("pointerdown", closeOnOutsideInteraction, { passive: true });
  document.addEventListener("click", closeOnOutsideInteraction, { passive: true });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    navDropdowns.forEach(closeDropdown);
  });
})();

// ─── GSAP Animations ───
const hasGsap = window.gsap && window.ScrollTrigger;

if (hasGsap) {
  gsap.registerPlugin(ScrollTrigger);

  // Respect reduced motion
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isSharedMotionDisabled = (el) => !!el?.closest?.('[data-shared-animations="off"]');

  if (!prefersReducedMotion) {

  // ── Section entrance: fade up with stagger ──
  document.querySelectorAll(".lib-section").forEach((section) => {
    if (section.matches('[data-shared-animations="off"]')) return;
    const heading = section.querySelector(".lib-section-title, .display-lg, .display-xl");
    const sub = section.querySelector(".lib-section-sub, .body-text");
    const children = section.querySelectorAll(
      ".stat-card, .feature-card, .testimonial-card, .team-card, .service-card, .pain-item, .faq-item, .note, .process-step, .gallery-cell, .swatch-grid > div"
    );

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top 55%",
        end: "top 20%",
        toggleActions: "play none none none",
      },
    });

    if (heading) {
      tl.fromTo(heading,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" },
        0
      );
    }

    if (sub) {
      tl.fromTo(sub,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" },
        0.1
      );
    }

    if (children.length) {
      tl.fromTo(children,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: "power3.out", stagger: 0.08 },
        0.2
      );
    }
  });

  // ── Lucide line icon SVG draw-on animation (scroll triggered) ──
  document.querySelectorAll("svg.lucide").forEach((svg) => {
    const paths = svg.querySelectorAll("path, circle, line, polyline, rect, ellipse");
    if (!paths.length) return;
    paths.forEach((p) => {
      const len = p.getTotalLength ? p.getTotalLength() : 100;
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    });
    gsap.to(paths, {
      strokeDashoffset: 0,
      duration: 1,
      ease: "power2.out",
      stagger: 0.1,
      scrollTrigger: {
        trigger: svg,
        start: "top 85%",
        toggleActions: "play none none none",
      },
    });
  });

  // ── Stat number counter animation ──
  document.querySelectorAll(".stat-card .num").forEach((el) => {
    const text = el.textContent.trim();
    const match = text.match(/([\d.]+)/);
    if (!match) return;

    const target = parseFloat(match[1]);
    const prefix = text.slice(0, text.indexOf(match[1]));
    const suffix = text.slice(text.indexOf(match[1]) + match[1].length);
    const isDecimal = match[1].includes(".");

    const counter = { val: 0 };
    gsap.to(counter, {
      val: target,
      duration: 1.8,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 50%",
        toggleActions: "play none none none",
      },
      onUpdate: () => {
        el.textContent = prefix + (isDecimal ? counter.val.toFixed(1) : Math.round(counter.val)) + suffix;
      },
    });
  });

  // ── Stat mini counter (hero) ──
  document.querySelectorAll(".stat-mini strong").forEach((el) => {
    const text = el.textContent.trim();
    const match = text.match(/([\d.]+)/);
    if (!match) return;

    const target = parseFloat(match[1]);
    const prefix = text.slice(0, text.indexOf(match[1]));
    const suffix = text.slice(text.indexOf(match[1]) + match[1].length);
    const isDecimal = match[1].includes(".");

    const counter = { val: 0 };
    gsap.to(counter, {
      val: target,
      duration: 1.4,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 50%",
        toggleActions: "play none none none",
      },
      onUpdate: () => {
        el.textContent = prefix + (isDecimal ? counter.val.toFixed(1) : Math.round(counter.val)) + suffix;
      },
    });
  });

  // ── Case study cards: staggered entrance ──
  gsap.fromTo(".case-card",
    { y: 60, opacity: 0, scale: 0.96 },
    {
      y: 0,
      opacity: 1,
      scale: 1,
      duration: 0.7,
      ease: "power3.out",
      stagger: 0.12,
      scrollTrigger: {
        trigger: ".case-scroll",
        start: "top 50%",
        toggleActions: "play none none none",
      },
    }
  );

  // ── Hero demo parallax gradient ──
  const heroDemoEl = document.querySelector(".hero-demo");
  if (heroDemoEl) {
    gsap.to(heroDemoEl, {
      "--parallax-y": "-30px",
      ease: "none",
      scrollTrigger: {
        trigger: heroDemoEl,
        start: "top bottom",
        end: "bottom top",
        scrub: 1.5,
      },
    });

    // Hero content entrance
    const heroInner = heroDemoEl.querySelector(".hero-demo-inner");
    if (heroInner) {
      gsap.fromTo(heroInner,
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: heroDemoEl,
            start: "top 50%",
            toggleActions: "play none none none",
          },
        }
      );
    }
  }

  // ── Process steps stagger ──
  gsap.fromTo(".process-step",
    { y: 40, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 0.6,
      ease: "power3.out",
      stagger: 0.15,
      scrollTrigger: {
        trigger: ".process-demo",
        start: "top 50%",
        toggleActions: "play none none none",
      },
    }
  );

  // ── Process icon SVG draw-on + breathe animation ──
  document.querySelectorAll(".process-icon").forEach((icon, i) => {
    const paths = icon.querySelectorAll("path, circle, line, polyline, rect");
    paths.forEach((el) => {
      const len = el.getTotalLength ? el.getTotalLength() : 200;
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
    });
    gsap.to(paths, {
      strokeDashoffset: 0,
      duration: 1.4,
      ease: "power2.out",
      stagger: 0.15,
      delay: i * 0.2,
      scrollTrigger: {
        trigger: ".process-demo",
        start: "top 50%",
        toggleActions: "play none none none",
      },
      onComplete: () => {
        // Gentle float/breathe loop after draw completes
        gsap.to(icon, {
          y: -4,
          scale: 1.06,
          duration: 2.2 + i * 0.3,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
      },
    });
  });

  // ── Card overlay sections — layered stacking with overtake/recede ──
  const overlays = document.querySelectorAll(".card-overlay");
  overlays.forEach((section, i) => {
    if (section.matches('[data-shared-animations="off"]')) return;
    // Each section gets a higher z-index so it stacks above the previous
    section.style.zIndex = 10 + i;

    // Alternate behavior: even = overtake (rises up), odd = recede (gets covered)
    const isOvertake = i % 2 === 0;

    if (isOvertake) {
      // OVERTAKE — this section slides UP dramatically over the previous
      gsap.fromTo(section,
        { boxShadow: "0 -5px 20px rgba(0,0,0,0.1)", y: 80 },
        {
          boxShadow: "0 -40px 100px rgba(0,0,0,0.7), 0 -8px 30px rgba(0,0,0,0.4)",
          y: 0,
          ease: "none",
          scrollTrigger: { trigger: section, start: "top 110%", end: "top 55%", scrub: 1 },
        }
      );
    } else {
      // RECEDE — this section stays put while the NEXT one covers it
      // Give it a subtle scale-down as the next section approaches
      gsap.fromTo(section,
        { boxShadow: "0 -5px 20px rgba(0,0,0,0.1)", y: 40 },
        {
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
          y: 0,
          ease: "none",
          scrollTrigger: { trigger: section, start: "top 110%", end: "top 60%", scrub: 1 },
        }
      );
      // Scale down slightly as the next section overtakes
      if (overlays[i + 1]) {
        gsap.to(section, {
          scale: 0.985,
          ease: "none",
          scrollTrigger: {
            trigger: overlays[i + 1],
            start: "top 100%",
            end: "top 40%",
            scrub: 1,
          },
        });
      }
    }
  });

  // ── Logo bar fade in ──
  gsap.fromTo(".logo-placeholder",
    { y: 10, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 0.4,
      stagger: 0.06,
      ease: "power2.out",
      scrollTrigger: {
        trigger: ".logo-bar",
        start: "top 50%",
        toggleActions: "play none none none",
      },
    }
  );

  // ── Nav slide down ──
  // Pages can opt out (data-shared-animations="off" on the nav) to paint the
  // nav via CSS instead, so GSAP does not fight the stylesheet over opacity.
  const navEl = document.querySelector(".lib-nav");
  if (navEl && !navEl.matches('[data-shared-animations="off"]')) {
    gsap.fromTo(navEl,
      { y: -20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, ease: "power3.out", delay: 0.2 }
    );
  }

  // ── Overview entrance ──
  const overviewSection = document.querySelector(".lib-section");
  if (overviewSection && !overviewSection.matches('[data-shared-animations="off"]')) {
    gsap.fromTo(overviewSection.children,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.1, delay: 0.4 }
    );
  }

  // ── HORIZONTAL SCROLL STORYTELLING ──
  const hscrollPin = document.querySelector(".hscroll-pin");
  const hscrollTrack = document.querySelector(".hscroll-track");
  const hscrollPanels = gsap.utils.toArray(".hscroll-panel");
  const hscrollDots = gsap.utils.toArray(".hscroll-dot");
  const hscrollFill = document.querySelector(".hscroll-progress-fill");

  if (hscrollPin && hscrollTrack && hscrollPanels.length > 1) {
    const totalPanels = hscrollPanels.length;
    const getScrollDistance = () => (totalPanels - 1) * window.innerWidth;

    // Main horizontal scroll: pin + translate with buffer-aware calculations
    const hscrollTL = gsap.to(hscrollTrack, {
      x: () => -getScrollDistance(),
      ease: "none",
      scrollTrigger: {
        trigger: hscrollPin,
        pin: true,
        anticipatePin: 1,
        scrub: 1.5,
        end: () => "+=" + getScrollDistance(),
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          if (hscrollFill) {
            gsap.set(hscrollFill, { width: (self.progress * 100) + "%" });
          }
          // Update dots
          const activeIndex = Math.round(self.progress * (totalPanels - 1));
          hscrollDots.forEach((dot, i) => {
            dot.classList.toggle("--active", i === activeIndex);
          });
        },
      },
    });

    // Per-panel animations: parallax on elements as they enter
    hscrollPanels.forEach((panel, i) => {
      const copy = panel.querySelector(".hscroll-copy");
      const visual = panel.querySelector(".hscroll-visual");
      const visualInner = panel.querySelector(".hscroll-visual-inner");
      const num = panel.querySelector(".hscroll-num");
      // Copy parallax: enters from right, slightly delayed
      if (copy) {
        if (i === 0) {
          gsap.set(copy, { x: 0, opacity: 1 });
        } else {
          gsap.fromTo(copy,
            { x: 80, opacity: 0 },
            {
              x: 0,
              opacity: 1,
              ease: "power3.out",
              immediateRender: false,
              scrollTrigger: {
                trigger: panel,
                containerAnimation: hscrollTL,
                start: "left 80%",
                end: "left 30%",
                scrub: 1,
              },
            }
          );
        }

        // Copy exit: fade out to the left
        gsap.fromTo(copy,
          { x: 0, opacity: 1 },
          {
            x: -60,
            opacity: 0,
            ease: "power2.in",
            immediateRender: false,
            scrollTrigger: {
              trigger: panel,
              containerAnimation: hscrollTL,
              start: "right 60%",
              end: "right 20%",
              scrub: 1,
            },
          }
        );
      }

      // Visual: scale in with slight delay
      if (visual) {
        if (i === 0) {
          gsap.set(visual, { scale: 1, opacity: 1 });
        } else {
          gsap.fromTo(visual,
            { scale: 0.88, opacity: 0 },
            {
              scale: 1,
              opacity: 1,
              ease: "power3.out",
              immediateRender: false,
              scrollTrigger: {
                trigger: panel,
                containerAnimation: hscrollTL,
                start: "left 75%",
                end: "left 25%",
                scrub: 1,
              },
            }
          );
        }
      }

      // Inner visual parallax: moves slower than container
      if (visualInner) {
        gsap.fromTo(visualInner,
          { x: 40 },
          {
            x: -40,
            ease: "none",
            immediateRender: false,
            scrollTrigger: {
              trigger: panel,
              containerAnimation: hscrollTL,
              start: "left right",
              end: "right left",
              scrub: 1,
            },
          }
        );
      }

      // Big number parallax: moves faster (opposite direction)
      if (num) {
        if (i === 0) {
          gsap.set(num, { x: 0, opacity: 1 });
        }
        gsap.fromTo(num,
          { x: -60, opacity: i === 0 ? 1 : 0 },
          {
            x: 60,
            opacity: 1,
            ease: "none",
            immediateRender: false,
            scrollTrigger: {
              trigger: panel,
              containerAnimation: hscrollTL,
              start: "left right",
              end: "right left",
              scrub: 1,
            },
          }
        );
      }

    });

    // ── Floating icons: drift across panel transitions ──
    const floatIcons = gsap.utils.toArray(".hscroll-float-icon");
    floatIcons.forEach((icon) => {
      const parentPanel = icon.closest(".hscroll-panel");
      if (!parentPanel) return;

      gsap.fromTo(icon,
        { x: 50, opacity: 0, scale: 0.6, rotation: -15 },
        {
          x: -50,
          opacity: 0.55,
          scale: 1,
          rotation: 15,
          ease: "none",
          scrollTrigger: {
            trigger: parentPanel,
            containerAnimation: hscrollTL,
            start: "left 70%",
            end: "right 30%",
            scrub: 1.5,
          },
        }
      );
    });

    // ── Interstitial elements: pulse + drift ──
    gsap.utils.toArray(".hscroll-interstitial").forEach((el) => {
      const parentPanel = el.closest(".hscroll-panel");
      if (!parentPanel) return;

      gsap.fromTo(el,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: -20,
          ease: "none",
          scrollTrigger: {
            trigger: parentPanel,
            containerAnimation: hscrollTL,
            start: "right 55%",
            end: "right 10%",
            scrub: 1,
          },
        }
      );
    });

    // ── Interstitial rings: slow rotation ──
    gsap.utils.toArray(".hscroll-interstitial-ring").forEach((ring) => {
      const parentPanel = ring.closest(".hscroll-panel");
      if (!parentPanel) return;

      gsap.fromTo(ring,
        { rotation: 0, scale: 0.7 },
        {
          rotation: 180,
          scale: 1.1,
          ease: "none",
          scrollTrigger: {
            trigger: parentPanel,
            containerAnimation: hscrollTL,
            start: "left right",
            end: "right left",
            scrub: 2,
          },
        }
      );
    });

    // First & last panel handoff polish so the section enters and releases cleanly.
    const firstPanel = hscrollPanels[0];
    const lastPanel = hscrollPanels[hscrollPanels.length - 1];

    if (firstPanel) {
      gsap.fromTo(firstPanel,
        { opacity: 0.72, scale: 0.985 },
        {
          opacity: 1,
          scale: 1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: firstPanel,
            containerAnimation: hscrollTL,
            start: "left left",
            end: "left 40%",
            scrub: 1,
          },
        }
      );
    }

    if (lastPanel) {
      gsap.fromTo(lastPanel,
        { opacity: 1, scale: 1 },
        {
          opacity: 0.84,
          scale: 0.99,
          ease: "power2.out",
          scrollTrigger: {
            trigger: lastPanel,
            containerAnimation: hscrollTL,
            start: "right 55%",
            end: "right left",
            scrub: 1,
          },
        }
      );
    }

    // Intro text entrance
    const hscrollIntro = document.querySelector(".hscroll-intro");
    if (hscrollIntro) {
      gsap.fromTo(hscrollIntro.children,
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.1,
          scrollTrigger: { trigger: hscrollIntro, start: "top 50%", toggleActions: "play none none none" },
        }
      );
    }
  }

  // ── CINEMATIC MEDIA: scroll-driven expand + zoom out ──
  document.querySelectorAll(".cinema-frame").forEach((frame) => {
    const inner = frame.querySelector("video, img, .cinema-frame-placeholder");
    const copy = frame.querySelector(".cinema-copy");
    const progress = frame.querySelector(".cinema-progress");

    // Main timeline: frame expands from 62% → 100vw, corners flatten, media zooms out
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: frame,
        start: "top 50%",
        end: "top 10%",
        scrub: 1.2,
        onUpdate: (self) => {
          // Animate progress bar width with scroll
          if (progress) {
            gsap.set(progress, { width: (self.progress * 100) + "%" });
          }
        },
      },
    });

    // Frame: expand width + flatten corners
    tl.fromTo(frame,
      {
        width: "62%",
        borderRadius: "28px",
        borderColor: "rgba(255,248,235,0.06)",
      },
      {
        width: "100%",
        borderRadius: "0px",
        borderColor: "rgba(255,248,235,0.0)",
        ease: "power2.inOut",
        duration: 1,
      },
      0
    );

    // Inner media: zoom out from 1.18 → 1.0
    if (inner) {
      tl.fromTo(inner,
        { scale: 1.18 },
        { scale: 1.0, ease: "power2.out", duration: 1 },
        0
      );
    }

    // Copy: parallax — text rises faster than the frame scrolls
    if (copy) {
      tl.fromTo(copy,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, ease: "power2.out", duration: 0.6 },
        0.3
      );
    }

    // Secondary parallax: copy drifts up as you continue scrolling past
    if (copy) {
      gsap.to(copy, {
        y: -40,
        ease: "none",
        scrollTrigger: {
          trigger: frame,
          start: "top 10%",
          end: "bottom -20%",
          scrub: 1.5,
        },
      });
    }

    // Subtle border glow at peak expansion
    gsap.fromTo(frame,
      { boxShadow: "0 0 0px rgba(226,168,77,0)" },
      {
        boxShadow: "0 0 80px rgba(226,168,77,0.12)",
        ease: "power2.inOut",
        scrollTrigger: {
          trigger: frame,
          start: "top 40%",
          end: "top 10%",
          scrub: 1,
        },
      }
    );
  });

  // ── Cinema header entrance ──
  const cinemaHeader = document.querySelector(".cinema-header");
  if (cinemaHeader) {
    gsap.fromTo(cinemaHeader.children,
      { y: 30, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: {
          trigger: cinemaHeader,
          start: "top 50%",
          toggleActions: "play none none none",
        },
      }
    );
  }

  // ── Mesh gradient orbs — Stripe-inspired ambient animation ──
  const meshOrbs = document.querySelectorAll(".mesh-orb");

  // ═══ CINEMATIC PAGE LOAD: Golden Supernova ═══
  try {
  const entranceTl = gsap.timeline({
    defaults: { ease: "power3.out" },
    onComplete: () => {
      // Refresh ScrollTrigger now that page is visible and in final position
      // Refresh twice — once now, once after a frame for pinned sections
      ScrollTrigger.refresh();
      requestAnimationFrame(() => ScrollTrigger.refresh());
      // After entrance, start ambient loops — smooth organism
      meshOrbs.forEach((orb, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        const alt = i % 3 === 0 ? -1 : 1;
        const seed = i * 137.5;

        // Drift — single combined x/y tween, no conflicts
        gsap.to(orb, {
          x: `+=${dir * (100 + (seed % 120))}`,
          y: `+=${alt * (80 + (seed % 100))}`,
          duration: 8 + (seed % 5),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });

        // Scale breathing
        gsap.to(orb, {
          scale: 1.18 + (seed % 18) / 100,
          duration: 6 + (seed % 4),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: (seed % 3) * 0.5,
        });

        // Opacity pulse
        gsap.to(orb, {
          opacity: 0.25 + (seed % 20) / 100,
          duration: 5 + (seed % 4),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: (seed % 4) * 0.4,
        });
      });
    }
  });

  // Store each orb's natural position, then collapse to center
  meshOrbs.forEach((orb, i) => {
    const rect = orb.getBoundingClientRect();
    const centerX = window.innerWidth / 2 - rect.left - rect.width / 2;
    const centerY = window.innerHeight / 2 - rect.top - rect.height / 2;

    // Set initial state: collapsed at center, tiny, white-hot
    gsap.set(orb, {
      x: centerX,
      y: centerY,
      scale: 0.15,
      opacity: 0,
      filter: "blur(120px) brightness(2.5)",
    });
  });

  // Golden flash overlay — fires with the initial pulse
  const flash = document.querySelector(".load-flash");
  entranceTl.to(flash, {
    opacity: 1,
    duration: 0.3,
    ease: "power2.in",
  }, 0);
  entranceTl.to(flash, {
    opacity: 0,
    duration: 1.6,
    ease: "power3.out",
  }, 0.3);

  // Phase 1: Flash — a single bright pulse at center (0 → 0.4s)
  entranceTl.to(meshOrbs, {
    opacity: 1,
    filter: "blur(100px) brightness(2)",
    scale: 0.3,
    duration: 0.4,
    stagger: 0.03,
    ease: "power2.in",
  });

  // Phase 2: Expand — orbs bloom outward to positions (0.4 → 2.2s)
  entranceTl.to(meshOrbs, {
    x: 0,
    y: 0,
    scale: 1,
    filter: "blur(80px) brightness(1)",
    opacity: 0.75,
    duration: 1.8,
    stagger: {
      each: 0.08,
      from: "center",
    },
    ease: "power2.out",
  }, "+=0");

  // Phase 3: Settle — gentle overshoot correction
  entranceTl.to(meshOrbs, {
    filter: "blur(90px)",
    scale: 1,
    opacity: 0.4,
    duration: 0.8,
    ease: "sine.out",
  }, "-=0.6");

  } catch(e) { console.warn("Entrance animation error:", e); }

  // Hide mesh canvas during hscroll section to prevent glitches
  const hscrollSection = document.querySelector(".hscroll-section");
  if (hscrollSection) {
    ScrollTrigger.create({
      trigger: hscrollSection,
      start: "top bottom",
      end: "bottom top",
      onEnter: () => gsap.to(".depth-canvas", { opacity: 0, duration: 0.5 }),
      onLeave: () => gsap.to(".depth-canvas", { opacity: 1, duration: 0.5 }),
      onEnterBack: () => gsap.to(".depth-canvas", { opacity: 0, duration: 0.5 }),
      onLeaveBack: () => gsap.to(".depth-canvas", { opacity: 1, duration: 0.5 }),
    });
  }

  // ── IMMERSIVE IMAGE: scroll-zoom from 72% → true 100vw ──
  document.querySelectorAll(".immersive-img").forEach((block) => {
    const img = block.querySelector("img");
    const copy = block.querySelector(".immersive-img-copy");

    // Compute the negative margin needed to break out of .page container
    const computeBreakout = () => {
      const pageEl = block.closest(".page");
      if (!pageEl) return 0;
      const pageRect = pageEl.getBoundingClientRect();
      return pageRect.left;
    };

    // Phase 1: expand from 72% centered → true 100vw edge-to-edge
    const expandTl = gsap.timeline({
      scrollTrigger: {
        trigger: block,
        start: "top 65%",
        end: "top 5%",
        scrub: 1.2,
        onUpdate: (self) => {
          // Dynamically compute breakout margin during scroll
          const progress = self.progress;
          const breakout = computeBreakout();
          const currentMarginLeft = -breakout * progress;
          const currentWidth = block.offsetWidth + (window.innerWidth - block.offsetWidth) * progress;
          block.style.width = currentWidth + "px";
          block.style.marginLeft = currentMarginLeft + "px";
          block.style.borderRadius = (28 * (1 - progress)) + "px";
        },
      },
    });

    // Image: zoom-out as container expands
    if (img) {
      gsap.fromTo(img,
        { scale: 1.18 },
        {
          scale: 1.0,
          ease: "none",
          scrollTrigger: {
            trigger: block,
            start: "top 65%",
            end: "top 5%",
            scrub: 1.2,
          },
        }
      );
    }

    // Copy: fades in and rises to center position
    if (copy) {
      gsap.fromTo(copy,
        { opacity: 0, yPercent: -50, y: 40 },
        {
          opacity: 1,
          yPercent: -50,
          y: 0,
          ease: "power2.out",
          scrollTrigger: {
            trigger: block,
            start: "top 30%",
            end: "top 5%",
            scrub: 1,
          },
        }
      );
    }

    // Phase 2: parallax — image drifts up slowly while in view
    if (img) {
      gsap.to(img, {
        y: -60,
        ease: "none",
        scrollTrigger: {
          trigger: block,
          start: "top top",
          end: "bottom top",
          scrub: 1.5,
        },
      });
    }

    // Phase 3: contract back as it leaves
    ScrollTrigger.create({
      trigger: block,
      start: "bottom 65%",
      end: "bottom 25%",
      scrub: 1.2,
      onUpdate: (self) => {
        const progress = self.progress;
        const breakout = computeBreakout();
        const fullWidth = window.innerWidth;
        const restWidth = block.closest(".page") ? block.closest(".page").offsetWidth * 0.72 : fullWidth * 0.72;
        const currentWidth = fullWidth - (fullWidth - restWidth) * progress;
        const fullMargin = -breakout;
        const currentMargin = fullMargin * (1 - progress);
        block.style.width = currentWidth + "px";
        block.style.marginLeft = currentMargin + "px";
        block.style.borderRadius = (28 * progress) + "px";
      },
    });
  });

  // ── ADVANCED PAGE-WIDE REVEAL ANIMATIONS ──

  // Images: clip-reveal + subtle zoom
  document.querySelectorAll(".card-overlay img, .lib-section img").forEach((img) => {
    if (isSharedMotionDisabled(img)) return;
    gsap.set(img, { scale: 1.08, opacity: 0 });
    gsap.to(img, {
      scale: 1,
      opacity: 1,
      duration: 1.2,
      ease: "power2.out",
      scrollTrigger: {
        trigger: img,
        start: "top 85%",
        toggleActions: "play none none none",
      },
    });
    // Subtle parallax drift on images
    gsap.to(img, {
      y: -30,
      ease: "none",
      scrollTrigger: {
        trigger: img,
        start: "top bottom",
        end: "bottom top",
        scrub: 1.5,
      },
    });
  });

  // Grid children: staggered fade-up (for grid-2, grid-3, grid-4 layouts)
  document.querySelectorAll(".grid-2, .grid-3, .grid-4").forEach((grid) => {
    if (isSharedMotionDisabled(grid)) return;
    gsap.fromTo(grid.children,
      { y: 50, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: {
          trigger: grid,
          start: "top 75%",
          toggleActions: "play none none none",
        },
      }
    );
  });

  // Section labels: slide in from left with gold line
  document.querySelectorAll(".lib-section-label").forEach((label) => {
    if (isSharedMotionDisabled(label)) return;
    gsap.fromTo(label,
      { x: -30, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.6,
        ease: "power3.out",
        scrollTrigger: {
          trigger: label,
          start: "top 85%",
          toggleActions: "play none none none",
        },
      }
    );
  });

  // Body text paragraphs: soft fade up
  document.querySelectorAll(".card-overlay .body-text, .card-overlay .lib-section-sub").forEach((p) => {
    if (isSharedMotionDisabled(p)) return;
    gsap.fromTo(p,
      { y: 20, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: p,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      }
    );
  });

  // Buttons & CTAs: fade up with slight scale
  document.querySelectorAll(".cta-banner").forEach((cta) => {
    if (isSharedMotionDisabled(cta)) return;
    gsap.fromTo(cta,
      { y: 40, opacity: 0, scale: 0.97 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: cta,
          start: "top 80%",
          toggleActions: "play none none none",
        },
      }
    );
  });

  // Contact form: slide in from right
  document.querySelectorAll(".contact-form").forEach((form) => {
    gsap.fromTo(form,
      { x: 60, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: form,
          start: "top 80%",
          toggleActions: "play none none none",
        },
      }
    );
  });

  // Case detail cards: staggered reveal
  document.querySelectorAll(".case-detail").forEach((card, i) => {
    gsap.fromTo(card,
      { y: 60, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: "power3.out",
        delay: i * 0.05,
        scrollTrigger: {
          trigger: card,
          start: "top 80%",
          toggleActions: "play none none none",
        },
      }
    );
  });

  // Case detail metrics: counter-style number reveal
  document.querySelectorAll(".case-detail-metric strong").forEach((el) => {
    const text = el.textContent.trim();
    const match = text.match(/([\d.]+)/);
    if (!match) return;
    const target = parseFloat(match[1]);
    const prefix = text.slice(0, text.indexOf(match[1]));
    const suffix = text.slice(text.indexOf(match[1]) + match[1].length);
    const isDecimal = match[1].includes(".");
    const counter = { val: 0 };
    gsap.to(counter, {
      val: target,
      duration: 1.6,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none none",
      },
      onUpdate: () => {
        el.textContent = prefix + (isDecimal ? counter.val.toFixed(1) : Math.round(counter.val)) + suffix;
      },
    });
  });

  // Hero badge: pop in
  document.querySelectorAll(".hero-badge").forEach((badge) => {
    gsap.fromTo(badge,
      { y: -15, opacity: 0, scale: 0.9 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: "back.out(1.7)",
        delay: 0.6,
      }
    );
  });

  // Chips: staggered pop-in
  document.querySelectorAll(".flex-row .chip").forEach((chip, i) => {
    gsap.fromTo(chip,
      { y: 10, opacity: 0, scale: 0.85 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.4,
        ease: "back.out(1.5)",
        delay: 0.8 + i * 0.08,
      }
    );
  });

  // Filter buttons: stagger in
  document.querySelectorAll(".filter-btn").forEach((btn, i) => {
    gsap.fromTo(btn,
      { y: 15, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.4,
        ease: "power2.out",
        scrollTrigger: {
          trigger: btn.parentElement,
          start: "top 80%",
          toggleActions: "play none none none",
        },
        delay: i * 0.06,
      }
    );
  });

  // Smooth scroll parallax on depth-canvas mesh orbs based on scroll position
  gsap.to(".depth-canvas", {
    y: -100,
    ease: "none",
    scrollTrigger: {
      trigger: "body",
      start: "top top",
      end: "bottom bottom",
      scrub: 2,
    },
  });

  // ── Two-tone section background crossfade ──
  // Even sections get a subtle parallax-fade entrance on their bg
  document.querySelectorAll(".lib-section:nth-child(even)").forEach((section) => {
    if (section.matches('[data-shared-animations="off"]')) return;
    gsap.fromTo(section,
      { "--bg-fade": 0 },
      {
        "--bg-fade": 1,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top 95%",
          end: "top 60%",
          scrub: 0.8,
        },
      }
    );

    // Also add a subtle top/bottom gradient edge to blend sections
    const edge = document.createElement("div");
    edge.style.cssText = `
      position: absolute;
      top: -1px;
      left: 0;
      right: 0;
      height: 80px;
      background: linear-gradient(to bottom, var(--bg-0), transparent);
      pointer-events: none;
      z-index: 0;
    `;
    section.style.position = "relative";
    section.prepend(edge);

    const bottomEdge = document.createElement("div");
    bottomEdge.style.cssText = `
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 80px;
      background: linear-gradient(to top, var(--bg-0), transparent);
      pointer-events: none;
      z-index: 0;
    `;
    section.append(bottomEdge);
  });
  }
}

// ══════════════════════════════════════════
// ── MATERIAL ICON TOGGLE (CSS layered icons) ──
// ══════════════════════════════════════════
document.querySelectorAll("[data-mat-toggle]").forEach((cell) => {
  // Auto-demo: activate after staggered delay on scroll-in
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const siblings = [...document.querySelectorAll("[data-mat-toggle]")];
        const idx = siblings.indexOf(cell);
        setTimeout(() => {
          cell.classList.add("--touched", "--active");
        }, 300 + idx * 200);
        setTimeout(() => {
          cell.classList.remove("--active");
        }, 2800 + idx * 200);
        observer.disconnect();
      }
    });
  }, { threshold: 0.5 });
  observer.observe(cell);

  // Click toggle
  cell.addEventListener("click", () => {
    cell.classList.add("--touched");
    cell.classList.toggle("--active");
  });
});

// ══════════════════════════════════════════
// ── LINE ICON ENGINE (GSAP stroke-draw) ──
// ══════════════════════════════════════════

// Utility: measure and set stroke dash for draw-on
function prepDraw(el) {
  if (!el) return 0;
  const len = el.getTotalLength ? el.getTotalLength() : 100;
  gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
  return len;
}

// ── GROWTH: bars fill + line draws ──
document.querySelectorAll('[data-icon-anim="growth"]').forEach((cell) => {
  const bars = cell.querySelectorAll(".ia-bar");
  const line = cell.querySelector(".ia-line");
  const dot = cell.querySelector(".ia-dot");
  const lineLen = prepDraw(line);

  gsap.set(bars, { scaleY: 0, transformOrigin: "bottom center" });
  gsap.set(dot, { scale: 0 });

  const tl = gsap.timeline({ paused: true });
  tl.to(bars, { scaleY: 1, duration: 0.5, stagger: 0.1, ease: "back.out(1.4)" })
    .to(line, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, 0.2)
    .to(dot, { scale: 1, duration: 0.3, ease: "back.out(3)" }, 0.7);

  cell.addEventListener("mouseenter", () => tl.restart());
  cell.addEventListener("mouseleave", () => tl.reverse());
});

// ── PULSE: rings radiate outward ──
document.querySelectorAll('[data-icon-anim="pulse"]').forEach((cell) => {
  const rings = cell.querySelectorAll(".ia-ring");
  const center = cell.querySelector(".ia-center");

  gsap.set(rings, { scale: 0.3, opacity: 0, transformOrigin: "center" });
  gsap.set(center, { scale: 0.8 });

  const tl = gsap.timeline({ paused: true });
  tl.to(center, { scale: 1.15, duration: 0.25, ease: "power2.out", yoyo: true, repeat: 1 })
    .to(rings, { scale: 1, opacity: 1, duration: 0.6, stagger: 0.12, ease: "power2.out" }, 0)
    .to(rings, { opacity: 0, scale: 1.25, duration: 0.4, stagger: 0.12, ease: "power1.in" }, 0.45);

  // Loop on hover
  let loopInterval;
  cell.addEventListener("mouseenter", () => {
    tl.restart();
    loopInterval = setInterval(() => tl.restart(), 1600);
  });
  cell.addEventListener("mouseleave", () => {
    clearInterval(loopInterval);
    gsap.set(rings, { scale: 0.3, opacity: 0 });
    gsap.set(center, { scale: 0.8 });
  });
});

// ── UTENSILS: draw on + cross ──
document.querySelectorAll('[data-icon-anim="utensils"]').forEach((cell) => {
  const fork = cell.querySelector(".ia-fork");
  const knife = cell.querySelector(".ia-knife");
  const forkLines = fork.querySelectorAll("line, path");
  const knifeLines = knife.querySelectorAll("line, path");

  [...forkLines, ...knifeLines].forEach(prepDraw);

  const tl = gsap.timeline({ paused: true });
  tl.to([...forkLines], { strokeDashoffset: 0, duration: 0.5, stagger: 0.06, ease: "power2.out" })
    .to([...knifeLines], { strokeDashoffset: 0, duration: 0.5, stagger: 0.06, ease: "power2.out" }, 0.15)
    .to(fork, { rotation: 12, x: 4, transformOrigin: "50% 100%", duration: 0.35, ease: "power2.inOut" }, 0.55)
    .to(knife, { rotation: -12, x: -4, transformOrigin: "50% 100%", duration: 0.35, ease: "power2.inOut" }, 0.55);

  cell.addEventListener("mouseenter", () => tl.restart());
  cell.addEventListener("mouseleave", () => tl.reverse());
});

// ── TARGET: rings draw inward then arrow strikes ──
document.querySelectorAll('[data-icon-anim="target"]').forEach((cell) => {
  const rings = [
    cell.querySelector(".ia-target-r3"),
    cell.querySelector(".ia-target-r2"),
    cell.querySelector(".ia-target-r1"),
  ];
  const shaft = cell.querySelector(".ia-arrow-shaft");
  const head = cell.querySelector(".ia-arrow-head");

  rings.forEach(prepDraw);
  prepDraw(shaft);
  prepDraw(head);

  const tl = gsap.timeline({ paused: true });
  tl.to(rings, { strokeDashoffset: 0, duration: 0.45, stagger: 0.1, ease: "power2.out" })
    .to(shaft, { strokeDashoffset: 0, duration: 0.3, ease: "power3.in" }, 0.4)
    .to(head, { strokeDashoffset: 0, duration: 0.2, ease: "power2.out" }, 0.55)
    .to(rings[2], { scale: 1.15, transformOrigin: "center", duration: 0.15, ease: "power2.out", yoyo: true, repeat: 1 }, 0.65);

  cell.addEventListener("mouseenter", () => tl.restart());
  cell.addEventListener("mouseleave", () => tl.reverse());
});

// ── FLAME: draws on then inner flame flickers ──
document.querySelectorAll('[data-icon-anim="flame"]').forEach((cell) => {
  const outer = cell.querySelector(".ia-flame-outer");
  const inner = cell.querySelector(".ia-flame-inner");

  prepDraw(outer);
  prepDraw(inner);

  const tl = gsap.timeline({ paused: true });
  tl.to(outer, { strokeDashoffset: 0, duration: 0.55, ease: "power2.out" })
    .to(inner, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, 0.2)
    .to(inner, { scaleY: 0.9, scaleX: 1.05, y: 1, transformOrigin: "50% 100%", duration: 0.2, ease: "sine.inOut", yoyo: true, repeat: 3 }, 0.6)
    .to(outer, { scaleY: 1.04, scaleX: 0.97, transformOrigin: "50% 100%", duration: 0.25, ease: "sine.inOut", yoyo: true, repeat: 3 }, 0.6);

  cell.addEventListener("mouseenter", () => tl.restart());
  cell.addEventListener("mouseleave", () => tl.reverse());
});

// ── PIN: drops and bounces ──
document.querySelectorAll('[data-icon-anim="pin"]').forEach((cell) => {
  const group = cell.querySelector(".ia-pin-group");
  const shadow = cell.querySelector(".ia-pin-shadow");

  gsap.set(group, { y: -30, opacity: 0 });
  gsap.set(shadow, { scaleX: 0.3, opacity: 0 });

  const tl = gsap.timeline({ paused: true });
  tl.to(group, { y: 0, opacity: 1, duration: 0.4, ease: "bounce.out" })
    .to(shadow, { scaleX: 1, opacity: 0.15, duration: 0.4, ease: "bounce.out" }, 0)
    .to(group, { y: -6, duration: 0.2, ease: "power2.out", yoyo: true, repeat: 1 }, 0.5);

  cell.addEventListener("click", () => tl.restart());
  // Also trigger on hover for discoverability
  cell.addEventListener("mouseenter", () => tl.restart());
});

// ── MEGAPHONE: body draws, waves emit sequentially ──
document.querySelectorAll('[data-icon-anim="megaphone"]').forEach((cell) => {
  const mega = cell.querySelector(".ia-mega");
  const waves = cell.querySelectorAll(".ia-wave");

  prepDraw(mega);
  waves.forEach(prepDraw);
  gsap.set(waves, { opacity: 0 });

  const tl = gsap.timeline({ paused: true });
  tl.to(mega, { strokeDashoffset: 0, duration: 0.45, ease: "power2.out" })
    .to(waves, { strokeDashoffset: 0, opacity: 1, duration: 0.35, stagger: 0.1, ease: "power2.out" }, 0.3)
    .to(waves, { x: 4, opacity: 0, duration: 0.3, stagger: 0.08, ease: "power1.in" }, 0.75);

  cell.addEventListener("mouseenter", () => tl.restart());
  cell.addEventListener("mouseleave", () => tl.reverse());
});

// ── CAMERA: draws on, iris blinks on click ──
document.querySelectorAll('[data-icon-anim="camera"]').forEach((cell) => {
  const body = cell.querySelector(".ia-cam-body");
  const top = cell.querySelector(".ia-cam-top");
  const lens = cell.querySelector(".ia-cam-lens");
  const iris = cell.querySelector(".ia-cam-iris");

  [body, top, lens, iris].forEach(prepDraw);

  const drawTl = gsap.timeline({ paused: true });
  drawTl.to(body, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" })
    .to(top, { strokeDashoffset: 0, duration: 0.3, ease: "power2.out" }, 0.15)
    .to(lens, { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" }, 0.25)
    .to(iris, { strokeDashoffset: 0, duration: 0.25, ease: "power2.out" }, 0.4);

  // Click: shutter flash effect
  const flashTl = gsap.timeline({ paused: true });
  flashTl.to(iris, { scale: 0, transformOrigin: "center", duration: 0.1, ease: "power3.in" })
    .to(cell, { backgroundColor: "rgba(226,168,77,0.06)", duration: 0.05 }, 0)
    .to(cell, { backgroundColor: "rgba(255,255,255,0.015)", duration: 0.3 }, 0.05)
    .to(iris, { scale: 1, transformOrigin: "center", duration: 0.25, ease: "back.out(2)" }, 0.1);

  cell.addEventListener("mouseenter", () => drawTl.restart());
  cell.addEventListener("mouseleave", () => drawTl.reverse());
  cell.addEventListener("click", () => flashTl.restart());
});

// ── STAR: draws then sparkles radiate ──
document.querySelectorAll('[data-icon-anim="star"]').forEach((cell) => {
  const star = cell.querySelector(".ia-star");
  const sparkles = cell.querySelectorAll(".ia-sparkle");

  prepDraw(star);
  sparkles.forEach(prepDraw);
  gsap.set(sparkles, { opacity: 0 });

  const tl = gsap.timeline({ paused: true });
  tl.to(star, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" })
    .to(star, { fill: "rgba(226,168,77,0.12)", duration: 0.3, ease: "power1.in" }, 0.45)
    .to(sparkles, { strokeDashoffset: 0, opacity: 1, duration: 0.2, stagger: 0.06, ease: "power2.out" }, 0.55)
    .to(sparkles, { opacity: 0, scale: 1.3, transformOrigin: "center", duration: 0.3, stagger: 0.06, ease: "power1.in" }, 0.8);

  cell.addEventListener("mouseenter", () => tl.restart());
  cell.addEventListener("mouseleave", () => {
    tl.reverse();
    gsap.to(star, { fill: "none", duration: 0.3 });
  });
});

// ── CHART: line draws with trailing dots ──
document.querySelectorAll('[data-icon-anim="chart"]').forEach((cell) => {
  const axes = cell.querySelectorAll(".ia-axis");
  const line = cell.querySelector(".ia-chart-line");
  const dots = cell.querySelectorAll(".ia-chart-dot");

  axes.forEach(prepDraw);
  prepDraw(line);
  gsap.set(dots, { scale: 0 });

  const tl = gsap.timeline({ paused: true });
  tl.to(axes, { strokeDashoffset: 0, duration: 0.3, stagger: 0.1, ease: "power2.out" })
    .to(line, { strokeDashoffset: 0, duration: 0.7, ease: "power2.out" }, 0.2)
    .to(dots, { scale: 1, duration: 0.25, stagger: 0.12, ease: "back.out(3)" }, 0.45);

  cell.addEventListener("mouseenter", () => tl.restart());
  cell.addEventListener("mouseleave", () => tl.reverse());
});

// ── HEART: draws then beats on click ──
document.querySelectorAll('[data-icon-anim="heart"]').forEach((cell) => {
  const heart = cell.querySelector(".ia-heart");
  prepDraw(heart);

  const drawTl = gsap.timeline({ paused: true });
  drawTl.to(heart, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" })
    .to(heart, { fill: "rgba(226,168,77,0.15)", duration: 0.3 }, 0.4);

  const beatTl = gsap.timeline({ paused: true });
  beatTl.to(heart, { scale: 1.2, transformOrigin: "center", duration: 0.15, ease: "power2.out" })
    .to(heart, { scale: 0.95, duration: 0.1, ease: "power2.in" })
    .to(heart, { scale: 1.1, duration: 0.12, ease: "power2.out" })
    .to(heart, { scale: 1, duration: 0.15, ease: "power2.inOut" })
    .to(heart, { fill: "rgba(226,168,77,0.25)", duration: 0.1 }, 0);

  cell.addEventListener("mouseenter", () => drawTl.restart());
  cell.addEventListener("mouseleave", () => {
    drawTl.reverse();
    gsap.to(heart, { fill: "none", duration: 0.3 });
  });
  cell.addEventListener("click", () => beatTl.restart());
});

// ── Hover-to-autoplay videos ──
const VIDEO_CDN_BASE = window.location.hostname === "www.buttonupmedia.com"
  ? "https://buttonupmedia.b-cdn.net/"
  : "";

const isRemoteAsset = (value) => /^(?:https?:)?\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:");

const resolveVideoAsset = (value, useCdn = true) => {
  if (!value || isRemoteAsset(value)) return value;
  const cleanValue = value.replace(/^\/+/, "");
  if (useCdn && VIDEO_CDN_BASE) {
    return `${VIDEO_CDN_BASE}${cleanValue}`;
  }
  return cleanValue;
};

const isAudioManagedVideo = (video) => !!video?.closest?.("[data-audio-managed='true']");

const prepareLazyVideo = (video) => {
  if (!video || video.dataset.lazyPrepared) return;

  const directSrc = video.getAttribute("src");
  if (directSrc) {
    if (!video.dataset.videoSrc) video.dataset.videoSrc = directSrc;
    video.removeAttribute("src");
  }

  Array.from(video.querySelectorAll("source")).forEach((source) => {
    const sourceSrc = source.getAttribute("src");
    if (sourceSrc) {
      if (!source.dataset.src) source.dataset.src = sourceSrc;
      source.removeAttribute("src");
    }
  });

  video.setAttribute("preload", "none");
  video.dataset.lazyPrepared = "true";
};

const ensureLazyVideoSource = (video, useCdn = true) => {
  if (!video) return;
  if (!video.dataset.lazyPrepared) prepareLazyVideo(video);

  const dataSrc = video.dataset.videoSrc || video.dataset.src;
  if (dataSrc && !video.getAttribute("src")) {
    video.src = resolveVideoAsset(dataSrc, useCdn);
    video.load();
    return;
  }

  const sources = Array.from(video.querySelectorAll("source"));
  if (sources.length) {
    let anySource = false;
    sources.forEach((source) => {
      const src = source.dataset.src || source.getAttribute("data-src");
      if (src && !source.getAttribute("src")) {
        source.src = resolveVideoAsset(src, useCdn);
        anySource = true;
      }
    });
    if (anySource) video.load();
  }
};

window.ensureLazyVideoSource = ensureLazyVideoSource;

const playLazyVideoWithAudio = async (video, volume = 0.8) => {
  if (!video) return false;
  ensureLazyVideoSource(video);
  video.defaultMuted = false;
  video.removeAttribute("muted");
  video.volume = volume;
  video.muted = false;

  try {
    await video.play();
    video.muted = false;
    return true;
  } catch (error) {
    try {
      video.muted = true;
      const unmute = () => {
        video.defaultMuted = false;
        video.removeAttribute("muted");
        video.muted = false;
      };
      video.addEventListener("playing", unmute, { once: true });
      await video.play();
      return true;
    } catch (fallbackError) {
      return false;
    }
  }
};

window.playLazyVideoWithAudio = playLazyVideoWithAudio;

const fallbackLazyVideoToLocal = (video) => {
  if (!video || video.dataset.videoFallbackLocal === "true") return;
  const hasCdn = !!VIDEO_CDN_BASE;
  const currentSrc = video.currentSrc || video.getAttribute("src") || "";
  if (!hasCdn || !currentSrc.startsWith(VIDEO_CDN_BASE)) return;

  video.dataset.videoFallbackLocal = "true";
  ensureLazyVideoSource(video, false);
};

document.querySelectorAll("[data-autoplay-hover]").forEach((container) => {
  if (container.matches("[data-audio-managed='true']")) return;
  const video = container.querySelector("video");
  if (!video) return;

  container.addEventListener("mouseenter", () => {
    ensureLazyVideoSource(video);
    video.play().catch(() => {});
  });

  container.addEventListener("mouseleave", () => {
    video.pause();
    video.currentTime = 0;
  });
});

// ── Audio-managed videos: preload only, no autoplay ──
(() => {
  const audioManagedVideos = Array.from(document.querySelectorAll("video")).filter(isAudioManagedVideo);
  if (!audioManagedVideos.length) return;

  const warmVideo = (video) => {
    ensureLazyVideoSource(video);
  };

  if (!("IntersectionObserver" in window)) {
    audioManagedVideos.forEach(warmVideo);
    return;
  }

  const warmObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      warmVideo(entry.target);
      observer.unobserve(entry.target);
    });
  }, {
    root: null,
    rootMargin: "180px 0px",
    threshold: 0.01,
  });

  audioManagedVideos.forEach((video) => warmObserver.observe(video));
})();

// ── Testimonial cards: explicit click-to-play, one audio source at a time ──
(() => {
  const cards = Array.from(document.querySelectorAll(".hp2-vid-card"));
  if (!cards.length) return;

  const stopCard = (card) => {
    const video = card.querySelector("video");
    if (!video) return;
    video.pause();
    try { video.currentTime = 0; } catch (err) {}
    card.classList.remove("--playing");
  };

  const stopOtherCards = (activeCard) => {
    cards.forEach((card) => {
      if (card !== activeCard) stopCard(card);
    });
  };

  const playCard = (card) => {
    const video = card.querySelector("video");
    if (!video) return;
    stopOtherCards(card);
    playLazyVideoWithAudio(video, 0.85)
      .then((played) => {
        if (played) card.classList.add("--playing");
        else stopCard(card);
      });
  };

  cards.forEach((card) => {
    const video = card.querySelector("video");
    if (!video) return;

    // Reset to the play-button state when the clip finishes.
    video.addEventListener("ended", () => stopCard(card));

    card.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (card.classList.contains("--playing")) {
        stopCard(card);
      } else {
        playCard(card);
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (cards.some((card) => card.contains(event.target))) return;
    cards.forEach(stopCard);
  });
})();

// ── Viewport-managed autoplay videos ──
(() => {
  // On mobile the hero background video is handled by the deferred loader
  // below (poster-first, loaded after the page settles) so it never competes
  // with LCP. Exclude it here so the IntersectionObserver doesn't pull it
  // eagerly at the top of the page. Desktop keeps the in-view behavior.
  const isMobileViewport = window.matchMedia("(max-width: 900px)").matches;
  const managedVideos = Array.from(document.querySelectorAll("video")).filter((video) => {
    if (isAudioManagedVideo(video)) return false;
    if (isMobileViewport && video.classList.contains("hp2-hero-bg-video")) return false;
    return true;
  });
  if (!managedVideos.length) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inViewThreshold = 0.2;

  const startVideo = (video) => {
    if (prefersReducedMotion) return;
    const hscrollPanel = video.closest(".hp2-hscroll-panel");
    const isCompactHscroll = hscrollPanel && window.matchMedia("(max-width: 700px)").matches;
    if (hscrollPanel && !isCompactHscroll && !hscrollPanel.classList.contains("--active")) {
      stopVideo(video);
      return;
    }
    ensureLazyVideoSource(video);
    if (video.readyState >= 2) {
      video.play().catch(() => {});
    } else {
      const onReady = () => video.play().catch(() => {});
      video.addEventListener("loadeddata", onReady, { once: true });
    }
  };

  const stopVideo = (video) => {
    if (!video.paused) video.pause();
    try { video.currentTime = 0; } catch (err) {}
    const vidCard = video.closest(".hp2-vid-card");
    if (vidCard) vidCard.classList.remove("--playing");
  };

  if (!("IntersectionObserver" in window)) {
    managedVideos.forEach(startVideo);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= inViewThreshold) {
        startVideo(video);
        if (video.classList.contains("hp2-hero-bg-video")) {
          video.classList.add("is-loaded");
          const heroMedia = video.closest(".hp2-hero-media");
          if (heroMedia) heroMedia.classList.add("is-video-loaded");
        }
      } else {
        stopVideo(video);
      }
    });
  }, {
    root: null,
    rootMargin: "120px 0px",
    threshold: [0, inViewThreshold],
  });

  managedVideos.forEach((video) => {
    prepareLazyVideo(video);
    video.addEventListener("error", () => fallbackLazyVideoToLocal(video));
    if (video.classList.contains("hp2-hero-bg-video")) {
      video.addEventListener("loadeddata", () => {
        video.classList.add("is-loaded");
        const heroMedia = video.closest(".hp2-hero-media");
        if (heroMedia) heroMedia.classList.add("is-video-loaded");
      }, { once: true });
    }
    observer.observe(video);
  });
})();

// ── Deferred mobile hero video (poster-first, load after LCP) ──
(() => {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const video = document.querySelector("video.hp2-hero-bg-video");
  if (!video) return;

  // Stay on the poster image for data-saver users and very slow connections.
  const conn = navigator.connection || navigator.webkitConnection;
  if (conn && (conn.saveData || /^(slow-2g|2g)$/.test(conn.effectiveType || ""))) return;

  // Use the lighter mobile rendition instead of the desktop encode.
  video.dataset.videoSrc = "videos/compilation-best-shots.mobile.mp4";

  const markLoaded = () => {
    video.classList.add("is-loaded");
    const heroMedia = video.closest(".hp2-hero-media");
    if (heroMedia) heroMedia.classList.add("is-video-loaded");
  };

  const start = () => {
    prepareLazyVideo(video);
    video.addEventListener("error", () => fallbackLazyVideoToLocal(video), { once: true });
    video.addEventListener("canplay", markLoaded, { once: true });
    ensureLazyVideoSource(video);
    const tryPlay = () => video.play().catch(() => {});
    if (video.readyState >= 2) tryPlay();
    else video.addEventListener("loadeddata", tryPlay, { once: true });
  };

  const defer = () => {
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2500 });
    else setTimeout(start, 1200);
  };

  if (document.readyState === "complete") defer();
  else window.addEventListener("load", defer, { once: true });
})();

// Re-init Lucide for dynamically referenced icons
if (window.lucide && typeof lucide.createIcons === "function") {
  lucide.createIcons();
}

// Restrict pixel-canvas auto-play to hover only (prevents scroll-triggered auto-fire on CTA)
const initCtaPixelCanvasHoverGuard = () => {
  const ctaScene = document.querySelector('.hp2-cta-scene');
  if (!ctaScene) return;
  const canvas = ctaScene.querySelector('pixel-canvas');
  if (!canvas) return;
  if (canvas.dataset.hoverGuardReady === "1" || typeof canvas.handleAnimation !== "function") return;
  canvas.dataset.hoverGuardReady = "1";
  let hovered = false;
  ctaScene.addEventListener('mouseenter', () => { hovered = true; }, true);
  ctaScene.addEventListener('mouseleave', () => { hovered = false; }, true);
  const orig = canvas.handleAnimation.bind(canvas);
  canvas.handleAnimation = (state) => {
    if (state === 'appear' && !hovered) return;
    orig(state);
  };
};

const bindCtaPixelCanvasHoverGuard = () => {
  if (window.customElements && typeof window.customElements.whenDefined === "function") {
    window.customElements.whenDefined("pixel-canvas").then(initCtaPixelCanvasHoverGuard).catch(() => {});
    return;
  }
  initCtaPixelCanvasHoverGuard();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindCtaPixelCanvasHoverGuard, { once: true });
} else {
  bindCtaPixelCanvasHoverGuard();
}

/* ── Language switcher ───────────────────────────────────────────────────────
   Pages that declare an alternate-language version via <link rel="alternate"
   hreflang> get an EN/ES toggle injected into the nav: a full-text link in
   .lib-nav-links on desktop, plus a compact pill (globe + ES/EN) shown directly
   beside the hamburger on mobile. Both link to the current page's counterpart
   (from its hreflang href), never the home page. Self-gating: pages with no
   hreflang alternate are left untouched, so the rest of the site is unaffected. */
(function () {
  function buildLangSwitch() {
    var links = document.querySelector(".lib-nav .lib-nav-links");
    if (!links || document.querySelector(".lib-lang-switch")) return;
    var current = (document.documentElement.lang || "en").toLowerCase().slice(0, 2);
    var alts = document.querySelectorAll('link[rel="alternate"][hreflang]');
    var target = null, targetLang = null;
    for (var i = 0; i < alts.length; i++) {
      var hl = (alts[i].getAttribute("hreflang") || "").toLowerCase();
      if (hl === "x-default") continue;
      var lang2 = hl.slice(0, 2);
      if (lang2 && lang2 !== current) { target = alts[i].getAttribute("href"); targetLang = lang2; break; }
    }
    if (!target) return;
    var label = targetLang === "es" ? "Español" : "English";
    var aria = targetLang === "es" ? "Ver esta página en español" : "View this page in English";
    var globe = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;"><circle cx="12" cy="12" r="9"/><path d="M3 12h18" stroke-linecap="round"/><path d="M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18" stroke-linecap="round"/></svg>';

    var desktop = document.createElement("a");
    desktop.className = "lib-lang-switch";
    desktop.href = target;
    desktop.setAttribute("hreflang", targetLang);
    desktop.setAttribute("lang", targetLang);
    desktop.setAttribute("aria-label", aria);
    desktop.innerHTML = globe + label;
    var phone = links.querySelector(".lib-nav-phone");
    if (phone) links.insertBefore(desktop, phone); else links.appendChild(desktop);

    // Compact pill shown beside the hamburger on mobile (hidden on desktop via
    // CSS). Same destination as the desktop link: the current page's counterpart.
    var compact = document.createElement("a");
    compact.className = "lib-lang-switch-mobile";
    compact.href = target;
    compact.setAttribute("hreflang", targetLang);
    compact.setAttribute("lang", targetLang);
    compact.setAttribute("aria-label", aria);
    compact.innerHTML = globe + targetLang.toUpperCase();
    var dropdown = links.querySelector(".lib-nav-dropdown");
    if (dropdown) links.insertBefore(compact, dropdown); else links.insertBefore(compact, links.firstChild);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildLangSwitch, { once: true });
  } else {
    buildLangSwitch();
  }
})();

/* ── Mobile call button ───────────────────────────────────────────────────────
   A compact "Call" pill (phone glyph + label) injected beside the hamburger on
   mobile so visitors can dial in a single tap. Reuses the nav's existing tel:
   number so it stays correct per page, and is localized (Call / Llamar). Hidden
   on desktop, where the full-text Call Us link already shows. Self-gating: a
   page with no tel: link in its nav is left untouched. */
(function () {
  function buildCallButton() {
    var links = document.querySelector(".lib-nav .lib-nav-links");
    if (!links || links.querySelector(".lib-nav-call-mobile")) return;
    var phone = links.querySelector('a[href^="tel:"]') || document.querySelector('.lib-nav a[href^="tel:"]');
    if (!phone) return;
    var isEs = (document.documentElement.lang || "en").toLowerCase().slice(0, 2) === "es";
    var label = isEs ? "Llamar" : "Call";
    var aria = isEs ? "Llámenos" : "Call us";
    var icon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="vertical-align:-2px;margin-right:5px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var btn = document.createElement("a");
    btn.className = "lib-nav-call-mobile";
    btn.href = phone.getAttribute("href");
    btn.setAttribute("aria-label", aria);
    btn.innerHTML = icon + label;

    // Sit to the left of the language pill (or the hamburger when there is none).
    var anchor = links.querySelector(".lib-lang-switch-mobile") || links.querySelector(".lib-nav-dropdown");
    if (anchor) links.insertBefore(btn, anchor); else links.appendChild(btn);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildCallButton, { once: true });
  } else {
    buildCallButton();
  }
})();
