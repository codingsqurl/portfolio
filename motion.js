// Animations, made with GSAP (gsap.min.js and ScrollTrigger.min.js, served from this site).
//
// The rules this file follows:
// - Everything is visible without it. If this script fails, the page still works and
//   looks right; it just doesn't move.
// - Hardly any text moves. The motion is on the UI: buttons, panels, the graph, the nav.
// - People who've asked their device for less motion get no sliding or bouncing. They
//   still get the scroll progress line and the nav highlight, which show where they are.
// - Pointer effects (buttons leaning toward the cursor, the light on the panels) only
//   run on computers with a mouse, since phones have no cursor to follow.

(function () {
  if (!window.gsap) return;

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  // A confident arrival: fast at first, then settles gently.
  var ARRIVE = "expo.out";
  var MOTION_OK = "(prefers-reduced-motion: no-preference)";
  var LESS_MOTION = "(prefers-reduced-motion: reduce)";
  var MOUSE = "(hover: hover) and (pointer: fine)";

  var $ = function (selector, scope) { return (scope || document).querySelector(selector); };
  var $$ = function (selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  };

  // Runs fn once, the first time el comes into view (or straight away if the page was
  // loaded already scrolled past it). clamp() keeps the trigger point within how far the
  // page can actually scroll, so the last section still plays on very tall screens.
  function onFirstView(el, fn, start) {
    if (!el || !ScrollTrigger) return;
    var done = false;
    function run() {
      if (done) return;
      done = true;
      fn();
    }
    ScrollTrigger.create({
      trigger: el, start: "clamp(" + (start || "top 85%") + ")", onEnter: run, onLeave: run
    });
    if (el.getBoundingClientRect().top < window.innerHeight) run();
  }

  var mm = gsap.matchMedia();
  var isHome = !!$(".hero");
  var isTerminal = document.body.classList.contains("term-page");

  // ===== Everyone: show where you are on the page =====

  if (isHome && ScrollTrigger) {
    var nav = $(".site-nav");

    // A thin rasta-coloured line along the bottom of the nav that fills as you scroll.
    var progress = document.createElement("div");
    progress.className = "scroll-progress";
    progress.setAttribute("aria-hidden", "true");
    nav.appendChild(progress);
    gsap.fromTo(progress, { scaleX: 0 }, {
      scaleX: 1,
      ease: "none",
      scrollTrigger: { start: 0, end: "max", scrub: 0.3 }
    });

    // A glass pill that slides under the nav link for the section you're reading.
    var links = $(".nav-links");
    var pill = document.createElement("span");
    pill.className = "nav-pill";
    pill.setAttribute("aria-hidden", "true");
    links.appendChild(pill);

    var current = null;
    var reduce = window.matchMedia(LESS_MOTION).matches;

    function highlight(link) {
      if (link === current) return;
      if (current) current.removeAttribute("aria-current");
      current = link;
      if (!link) {
        gsap.to(pill, { autoAlpha: 0, duration: 0.2, overwrite: true });
        return;
      }
      link.setAttribute("aria-current", "location");
      var wasHidden = Number(gsap.getProperty(pill, "opacity")) === 0;
      var place = { x: link.offsetLeft - 10, width: link.offsetWidth + 20 };
      // The first time it appears, it fades in where it is; after that it slides.
      if (wasHidden || reduce) gsap.set(pill, place);
      gsap.to(pill, {
        x: place.x,
        width: place.width,
        autoAlpha: 1,
        duration: reduce ? 0 : 0.45,
        ease: ARRIVE,
        overwrite: true
      });
    }

    gsap.set(pill, { autoAlpha: 0 });
    $$('.nav-links a[href^="#"]').forEach(function (link) {
      var section = $(link.getAttribute("href"));
      if (!section) return;
      ScrollTrigger.create({
        trigger: section,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: function (self) {
          if (self.isActive) highlight(link);
          else if (current === link) highlight(null);
        }
      });
    });

    // Fonts and resizing move the links, so put the pill back under the right one.
    ScrollTrigger.addEventListener("refresh", function () {
      if (!current) return;
      gsap.set(pill, { x: current.offsetLeft - 10, width: current.offsetWidth + 20 });
    });
  }

  // ===== Full motion =====

  mm.add(MOTION_OK, function () {
    document.documentElement.classList.add("gsap-motion");

    if (isHome) {
      // Hero: the badge and buttons settle into place. The headline stays put.
      gsap.timeline({ defaults: { ease: ARRIVE } })
        .from(".hero .eyebrow", { y: 12, scale: 0.94, opacity: 0, duration: 0.7 }, 0.1)
        .from(".hero-actions > *", { y: 18, opacity: 0, duration: 0.8, stagger: 0.08 }, 0.25);

      // Projects come in one after another, sharpening as they arrive.
      var cards = $$(".card-grid .card");
      gsap.set(cards, { y: 32, opacity: 0, filter: "blur(6px)" });
      onFirstView($(".card-grid"), function () {
        gsap.to(cards, {
          y: 0, opacity: 1, filter: "blur(0px)",
          duration: 0.8, ease: ARRIVE, stagger: 0.09, clearProps: "filter"
        });
      });

      // The four strengths slide in from the left, in order.
      var strengths = $$(".strengths-banner .strength");
      gsap.set(strengths, { x: -24, opacity: 0 });
      onFirstView($(".strengths-banner"), function () {
        gsap.to(strengths, { x: 0, opacity: 1, duration: 0.7, ease: ARRIVE, stagger: 0.08 });
      });

      // The year replays: the contribution squares fill in week by week, January first.
      // Only their size animates, so the CSS twinkle (which uses opacity) carries on.
      var graph = $(".github-panel .contrib:not(.overview):not(.activity) svg");
      if (graph) {
        var days = $$("rect", graph);
        var xs = days.map(function (d) { return parseFloat(d.getAttribute("x")) || 0; });
        var minX = Math.min.apply(null, xs);
        var spanX = Math.max.apply(null, xs) - minX || 1;
        gsap.set(days, { scale: 0, transformOrigin: "50% 50%" });
        onFirstView(graph, function () {
          gsap.to(days, {
            scale: 1,
            duration: 0.45,
            ease: "back.out(2.2)",
            delay: function (i) { return ((xs[i] - minX) / spanX) * 1.3 + (i % 7) * 0.012; }
          });
        }, "top 80%");
      }

      // Tool chips drop in as a group, then hop when you point at one.
      var chips = $$(".chips li");
      gsap.set(chips, { y: -14, opacity: 0 });
      onFirstView($(".chips"), function () {
        gsap.to(chips, {
          y: 0, opacity: 1, duration: 0.6, ease: "back.out(1.8)",
          stagger: { each: 0.03, from: "center" }
        });
      });
      chips.forEach(function (chip) {
        chip.addEventListener("pointerenter", function () {
          gsap.fromTo(chip, { y: 0 }, {
            y: -6, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1, overwrite: true
          });
        });
      });

      // The 31-day activity line draws itself left to right, the shading under it fades
      // up behind, and each day's dot pops as the line reaches it.
      var activity = $(".contrib.activity svg");
      if (activity) {
        var line = $(".activity-line", activity);
        var area = $(".activity-area", activity);
        var dots = $$(".activity-dot", activity);
        var length = line ? line.getTotalLength() : 0;
        if (line) gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
        if (area) gsap.set(area, { opacity: 0 });
        gsap.set(dots, { scale: 0, transformOrigin: "50% 50%" });
        onFirstView(activity, function () {
          var draw = 1.4;
          var tl = gsap.timeline();
          if (line) tl.to(line, { strokeDashoffset: 0, duration: draw, ease: "power2.inOut" }, 0);
          if (area) tl.to(area, { opacity: 1, duration: 0.8, ease: "power1.out" }, draw * 0.5);
          dots.forEach(function (dot, i) {
            tl.to(dot, { scale: 1, duration: 0.35, ease: "back.out(3)" },
              (i / Math.max(dots.length - 1, 1)) * draw * 0.9);
          });
          tl.add(function () { if (line) gsap.set(line, { clearProps: "strokeDasharray,strokeDashoffset" }); });
        }, "top 80%");
      }

      // Activity overview: the cross grows out from the middle, then the shape and its
      // dots spring out to their values.
      var overview = $(".contrib.overview svg");
      if (overview) {
        var arms = $$(".overview-arm", overview);
        var shape = $(".overview-shape", overview);
        var points = $$(".overview-dot", overview);
        gsap.set(arms, { scale: 0, svgOrigin: "180 125" });
        if (shape) gsap.set(shape, { scale: 0, svgOrigin: "180 125" });
        gsap.set(points, { scale: 0, transformOrigin: "50% 50%" });
        onFirstView(overview, function () {
          gsap.timeline()
            .to(arms, { scale: 1, duration: 0.6, ease: ARRIVE, stagger: 0.06 })
            .to(shape, { scale: 1, duration: 0.7, ease: "back.out(1.6)" }, 0.3)
            .to(points, { scale: 1, duration: 0.4, ease: "back.out(3)", stagger: 0.06 }, 0.6);
        }, "top 80%");
      }

      // The About answers lift in one by one.
      var answers = $$(".qa .qa-item");
      gsap.set(answers, { y: 20, opacity: 0 });
      onFirstView($(".qa"), function () {
        gsap.to(answers, { y: 0, opacity: 1, duration: 0.7, ease: ARRIVE, stagger: 0.08 });
      });
    }

    // The rasta glow behind the page drifts as you scroll, each colour at its own depth,
    // so the background feels alive instead of painted on.
    var glow = makeGlow();
    if (glow && ScrollTrigger) {
      glow.blobs.forEach(function (blob, i) {
        gsap.to(blob, {
          yPercent: [-14, 10, -8][i],
          xPercent: [4, -6, 3][i],
          ease: "none",
          scrollTrigger: { start: 0, end: "max", scrub: 1 }
        });
      });
    }

    if (isTerminal) {
      // The window opens like an app: it grows up from below and comes into focus.
      gsap.from(".term-window", {
        y: 40, scale: 0.92, opacity: 0, filter: "blur(8px)",
        duration: 0.6, ease: ARRIVE, transformOrigin: "50% 100%", clearProps: "filter"
      });
      terminalDots();
    }

    return function () {
      document.documentElement.classList.remove("gsap-motion");
      if (glow) glow.remove();
    };
  });

  // ===== Mouse only: things that react to the cursor =====

  mm.add(MOTION_OK + " and " + MOUSE, function () {
    // Buttons lean a little toward the cursor, and squish when pressed.
    $$(".button").forEach(function (button) {
      var toX = gsap.quickTo(button, "x", { duration: 0.4, ease: "power3.out" });
      var toY = gsap.quickTo(button, "y", { duration: 0.4, ease: "power3.out" });

      button.addEventListener("pointermove", function (e) {
        var r = button.getBoundingClientRect();
        toX((e.clientX - (r.left + r.width / 2)) * 0.2);
        toY((e.clientY - (r.top + r.height / 2)) * 0.3 - 1);
      });
      button.addEventListener("pointerleave", function () {
        toX(0);
        toY(0);
        gsap.to(button, { scale: 1, duration: 0.3, ease: "power3.out" });
      });
      button.addEventListener("pointerdown", function () {
        gsap.to(button, { scale: 0.94, duration: 0.1, ease: "power2.out" });
      });
      button.addEventListener("pointerup", function () {
        gsap.to(button, { scale: 1, duration: 0.45, ease: "back.out(3)" });
      });
    });

    // The glow behind the page leans gently toward the cursor.
    var glowLayer = $(".glow-layer");
    if (glowLayer) {
      var depth = [26, 18, 34];
      var movers = $$(".glow-layer span").map(function (blob, i) {
        return {
          x: gsap.quickTo(blob, "x", { duration: 1.6, ease: "power3.out" }),
          y: gsap.quickTo(blob, "y", { duration: 1.6, ease: "power3.out" }),
          d: depth[i]
        };
      });
      window.addEventListener("pointermove", function (e) {
        var nx = e.clientX / window.innerWidth - 0.5;
        var ny = e.clientY / window.innerHeight - 0.5;
        movers.forEach(function (m) { m.x(nx * m.d); m.y(ny * m.d); });
      }, { passive: true });
    }

    // Contribution squares pop when you point at them.
    var squares = $(".github-panel .contrib:not(.overview):not(.activity) svg");
    if (squares) {
      squares.addEventListener("pointerover", function (e) {
        if (e.target.tagName.toLowerCase() !== "rect") return;
        gsap.fromTo(e.target, { scale: 1 }, {
          scale: 1.7, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1,
          transformOrigin: "50% 50%", overwrite: true
        });
      });
    }

    // The footer logos tilt and grow a little when you point at their button.
    $$(".icon-button").forEach(function (button) {
      var logo = $("svg", button);
      if (!logo) return;
      button.addEventListener("pointerenter", function () {
        gsap.to(logo, { rotation: -12, scale: 1.15, duration: 0.35, ease: "back.out(3)" });
      });
      button.addEventListener("pointerleave", function () {
        gsap.to(logo, { rotation: 0, scale: 1, duration: 0.3, ease: "power2.out" });
      });
    });

    // A soft light follows the cursor across the dark panels.
    $$(".card-grid, .strengths-banner, .github-panel, .qa").forEach(function (panel) {
      panel.classList.add("spotlight");
      panel.addEventListener("pointermove", function (e) {
        var r = panel.getBoundingClientRect();
        gsap.to(panel, {
          "--mx": (e.clientX - r.left) + "px",
          "--my": (e.clientY - r.top) + "px",
          "--spot": 1,
          duration: 0.35,
          ease: "power3.out",
          overwrite: "auto"
        });
      });
      panel.addEventListener("pointerleave", function () {
        gsap.to(panel, { "--spot": 0, duration: 0.5, ease: "power2.out" });
      });
    });

    return function () {
      $$(".spotlight").forEach(function (panel) { panel.classList.remove("spotlight"); });
    };
  });

  // ===== The background glow =====
  // The page's glow is normally painted by body::before in style.css. For it to move, it
  // has to be real elements, so this swaps in a layer with the same three colour blobs.
  function makeGlow() {
    var layer = document.createElement("div");
    layer.className = "glow-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<span class="glow-green"></span><span class="glow-red"></span><span class="glow-gold"></span>';
    document.body.insertBefore(layer, document.body.firstChild);
    document.documentElement.classList.add("glow-live");
    return {
      blobs: $$("span", layer),
      remove: function () {
        document.documentElement.classList.remove("glow-live");
        layer.remove();
      }
    };
  }

  // ===== Terminal page: the three window dots do something =====

  function terminalDots() {
    var win = $(".term-window");
    var title = $(".term-title");
    var original = title ? title.textContent : "";
    var busy = false;

    function once(fn) {
      return function () {
        if (busy) return;
        busy = true;
        fn(function () { busy = false; });
      };
    }

    // Red (close): the window refuses to close.
    $(".term-dot-red").addEventListener("click", once(function (done) {
      if (title) title.textContent = "nice try. I live here.";
      gsap.timeline({ onComplete: function () {
        gsap.delayedCall(1.2, function () { if (title) title.textContent = original; done(); });
      } })
        .to(win, { keyframes: { x: [0, -10, 9, -7, 5, -2, 0] }, duration: 0.5, ease: "none" });
    }));

    // Gold (minimise): it ducks down to the dock and pops straight back.
    $(".term-dot-gold").addEventListener("click", once(function (done) {
      gsap.timeline({ onComplete: done })
        .to(win, { scaleX: 0.2, scaleY: 0.05, y: "45vh", opacity: 0,
                   duration: 0.4, ease: "power3.in", transformOrigin: "50% 100%" })
        .to(win, { scaleX: 1, scaleY: 1, y: 0, opacity: 1,
                   duration: 0.55, ease: "back.out(1.4)" }, "+=0.35");
    }));

    // Green (zoom): a quick zoom in and back.
    $(".term-dot-green").addEventListener("click", once(function (done) {
      gsap.timeline({ onComplete: done })
        .to(win, { scale: 1.04, duration: 0.2, ease: "power2.out", transformOrigin: "50% 50%" })
        .to(win, { scale: 1, duration: 0.5, ease: "back.out(2)" });
    }));
  }
})();
