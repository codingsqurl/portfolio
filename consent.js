// Cookie consent + Google Analytics 4.
//
// How it works:
// - The first time someone visits, a small banner asks if they're OK with analytics cookies.
// - Their answer is saved in a cookie called "cookie_consent" for a year, so we only ask once.
// - Google Analytics is only loaded AFTER they click "Accept". If they decline, nothing
//   from Google ever loads and no tracking cookies are set.
// - The "Cookie settings" link in the footer opens the banner again so they can change their mind.

(function () {
  // Your GA4 Measurement ID, from Google Analytics → Admin → Data streams → your site.
  // Until this is changed from the placeholder, GA never loads and the banner stays hidden.
  var GA_ID = "G-XXXXXXXXXX";

  var CONSENT_COOKIE = "cookie_consent";
  var ONE_YEAR = 60 * 60 * 24 * 365;
  var gaConfigured = /^G-[A-Z0-9]+$/.test(GA_ID) && GA_ID !== "G-XXXXXXXXXX";
  var gaLoaded = false;

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value, maxAge) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = name + "=" + encodeURIComponent(value) +
      "; Max-Age=" + maxAge + "; Path=/; SameSite=Lax" + secure;
  }

  // Google's cookies all start with "_ga". They may be set on this exact host or on the
  // parent domain, so try both when removing them.
  function removeGoogleCookies() {
    var host = location.hostname;
    var parent = host.split(".").slice(-2).join(".");
    document.cookie.split("; ").forEach(function (pair) {
      var name = pair.split("=")[0];
      if (name.indexOf("_ga") !== 0) return;
      [null, host, "." + host, "." + parent].forEach(function (domain) {
        document.cookie = name + "=; Max-Age=0; Path=/" + (domain ? "; Domain=" + domain : "");
      });
    });
  }

  function loadAnalytics() {
    if (!gaConfigured || gaLoaded) return;
    gaLoaded = true;
    window["ga-disable-" + GA_ID] = false;

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
  }

  function stopAnalytics() {
    if (gaConfigured) window["ga-disable-" + GA_ID] = true;
    removeGoogleCookies();
  }

  // ----- The banner -----

  var banner = null;

  function buildBanner() {
    banner = document.createElement("div");
    banner.className = "cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML =
      '<p class="cookie-text">I use Google Analytics cookies to see how many people visit and ' +
      'which pages they look at. Nothing is sold or used for ads. OK with that?</p>' +
      '<div class="cookie-actions">' +
      '<button type="button" class="button cookie-decline">Decline</button>' +
      '<button type="button" class="button cookie-accept">Accept</button>' +
      "</div>";

    banner.querySelector(".cookie-accept").addEventListener("click", function () {
      choose("granted");
    });
    banner.querySelector(".cookie-decline").addEventListener("click", function () {
      choose("denied");
    });
    document.body.appendChild(banner);
  }

  // moveFocus is only true when someone asked for the banner (Cookie settings link),
  // so it doesn't grab keyboard focus on every page load.
  function showBanner(moveFocus) {
    if (!banner) buildBanner();
    banner.hidden = false;
    if (moveFocus) banner.querySelector(".cookie-accept").focus({ preventScroll: true });
    // If the animation library is on the page, slide the banner up into place.
    // (It's checked when the banner shows, because GSAP loads after this file.)
    var gsap = window.gsap;
    if (gsap) {
      gsap.fromTo(banner, { y: lessMotion() ? 0 : 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, delay: moveFocus ? 0 : 0.6, ease: "expo.out", overwrite: true });
    }
  }

  function hideBanner() {
    if (!banner) return;
    var gsap = window.gsap;
    if (!gsap) {
      banner.hidden = true;
      return;
    }
    // Leaving is quicker than arriving.
    gsap.to(banner, {
      y: lessMotion() ? 0 : 16, opacity: 0, duration: 0.25, ease: "power2.in", overwrite: true,
      onComplete: function () { banner.hidden = true; }
    });
  }

  function lessMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function choose(choice) {
    writeCookie(CONSENT_COOKIE, choice, ONE_YEAR);
    hideBanner();
    if (choice === "granted") loadAnalytics();
    else stopAnalytics();
  }

  function start() {
    // No real Measurement ID yet means no analytics and no cookies, so there's nothing to
    // ask about: keep the banner and the Cookie settings link hidden.
    if (!gaConfigured) return;

    var saved = readCookie(CONSENT_COOKIE);
    if (saved === "granted") loadAnalytics();
    else if (saved !== "denied") showBanner(false);

    // Any element with data-cookie-settings reopens the banner.
    document.querySelectorAll("[data-cookie-settings]").forEach(function (el) {
      el.hidden = false;
      el.addEventListener("click", function (event) {
        event.preventDefault();
        showBanner(true);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
