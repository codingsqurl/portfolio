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

  // Types the hero name in letter by letter (see "Full motion"). Each letter keeps its space
  // while hidden, so the centred headline never shifts; the caret is moved to just after
  // the newest letter.
  // With paused, it does the setup (splitting the name into letters) and returns the
  // timeline without playing it, so the cube intro can do that work before the page shows
  // and just press play later, with no hitch mid-animation.
  function heroType(paused) {
    var name = $(".hero-name");
    var caret = name && $(".hero-caret", name);
    if (!name || !caret) return null;

    var text = name.firstChild.nodeValue;
    name.firstChild.remove();
    var letters = text.split("").map(function (ch) {
      var span = document.createElement("span");
      span.textContent = ch;
      name.insertBefore(span, caret);
      return span;
    });
    // Screen readers still get the name as one word, not letter by letter.
    name.setAttribute("aria-label", text);
    letters.forEach(function (span) { span.setAttribute("aria-hidden", "true"); });

    var edge = function (span) { return span.offsetLeft + span.offsetWidth; };
    var STEP = 0.055;
    var start = 0.35;
    var tl = gsap.timeline({ defaults: { ease: ARRIVE }, paused: !!paused });

    gsap.set(letters, { opacity: 0 });
    gsap.set(name, { opacity: 1 });
    gsap.set(caret, { x: 0, opacity: 1 });

    tl.from(".hero-hi", { y: 14, opacity: 0, filter: "blur(6px)", duration: 0.6, clearProps: "filter" }, 0);
    letters.forEach(function (span, i) {
      tl.set(span, { opacity: 1 }, start + i * STEP);
      tl.set(caret, { x: edge(span) + 2 }, start + i * STEP);
    });

    var typed = start + letters.length * STEP;
    tl.to(caret, { opacity: 0, duration: 0.12, ease: "none", repeat: 3, yoyo: true }, typed + 0.15)
      .to(caret, { opacity: 0, duration: 0.2 }, typed + 0.75)
      .from(".hero-sub", { y: 16, opacity: 0, duration: 0.7 }, typed - 0.1)
      .from(".hero-actions > *", { y: 18, opacity: 0, duration: 0.7, stagger: 0.08 }, typed)
      .from(".hero-scroll", { opacity: 0, duration: 0.8 }, typed + 0.6);
    tl.from(".hero-status", { y: 10, opacity: 0, duration: 0.6 }, 0);
    return tl;
  }

  // The hero types in once: straight away, or when the cube intro uncovers it.
  var heroStarted = false;
  var heroReady = null;
  function prepareHero() {
    if (!heroReady) heroReady = heroType(true);
  }
  function startHero() {
    if (heroStarted) return;
    heroStarted = true;
    if (heroReady) heroReady.play();
    else heroType();
  }

  // ===== Full motion, first: the cube intro =====
  // From Uiverse.io by lukepadiachy - https://uiverse.io/lukepadiachy/funny-moose-89
  // MIT License, Copyright (c) lukepadiachy (🅿️adi)
  //
  // The cube (index.html, style.css "Cube intro") is the first thing you see: a real
  // 3x3, scrambled and tumbling. It settles into a three-quarter view and solves itself
  // with real layer turns, turns its green side to face you, then flies into the green
  // centre square on its own while the page fades in behind it.
  //
  // The page doesn't scroll underneath while this plays. Scrolling or pressing a key
  // hurries it along; Tab or Escape skips to the page. It's skipped if you arrive at a
  // #section link, and never runs for less motion.
  var intro = $(".cube-intro");
  var introPlaying = false;
  if (intro) {
    if (window.matchMedia(MOTION_OK).matches && !location.hash) {
      introPlaying = true;
      playIntro(intro);
    } else {
      intro.remove();
    }
  }

  function playIntro(intro) {
    var root = document.documentElement;
    var loader = $(".cube-intro-loader", intro);
    var cube = $(".cube-intro-cube", intro);

    var SPIN = 5; // seconds per turn, the same as the CSS spin
    var IDLE = 1.4; // seconds of scrambled spinning before it starts solving
    var MOVES = 16; // quarter turns in the scramble, so also in the solve
    var TURN = 0.17; // seconds per quarter turn
    var GAP = 0.03; // a breath between turns, like a real hand
    var SETTLE = 1.0; // seconds to settle from the tumble into a three-quarter view
    var MOVES_AT = 0.6; // when the first turn starts, as it settles
    var FACE = 0.8; // seconds to turn the green side to face you at the end
    var SOLVE = MOVES_AT + MOVES * (TURN + GAP) + FACE; // seconds the solve takes
    // The three-quarter view it's solved in: looking down on the top, front and right.
    var POSE = { rx: -28, ry: -38 };
    var SIZE = 200; // the cube's width in px (style.css, .cube-intro-loader)
    var C = SIZE / 3; // one piece
    var INSET = 0.075; // how far each sticker sits in from its piece's edge (style.css)
    // The green centre sticker's size on screen: the 3D perspective draws the front at 1000/900.
    var CENTRE = C * (1 - 2 * INSET) * (1000 / 900);
    var HOLD = 0.35; // seconds it rests, solved, before flying in
    var REVEAL = 2.4; // seconds the fly-in and fade take

    root.classList.add("cube-intro-live", "cube-intro-lock");
    // A reload starts at the top too, with the cube, instead of jumping back down the page.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, behavior: "instant" });

    var solve = gsap.timeline({ paused: true, onComplete: ready });
    var idle = gsap.delayedCall(IDLE, startSolve);
    var solving = false;
    var turn = null; // the whole cube's angles ({ rx, ry }) once motion.js takes over from the CSS
    var reveal = null; // the fly-in, built once it's solved
    var revealing = null; // the tween playing it
    var pace = 1; // how much it's been hurried along
    var done = false;

    // ----- The real cube -----
    // The page's markup holds the original Uiverse cube: six flat faces, spinning in CSS.
    // It stays as the fallback. Here it's swapped for a real one, built like the puzzle:
    // 26 pieces of black plastic, each with a sticker on every side that faces out. The
    // spin carries on through the swap, since it's on the cube element itself.
    //
    // Directions use CSS's axes: x to the right, y DOWN, z towards you.
    var SIDES = [
      { n: [0, 0, 1], colour: "green", place: "" },
      { n: [0, 0, -1], colour: "blue", place: "rotateY(180deg) " },
      { n: [1, 0, 0], colour: "red", place: "rotateY(90deg) " },
      { n: [-1, 0, 0], colour: "orange", place: "rotateY(-90deg) " },
      { n: [0, -1, 0], colour: "white", place: "rotateX(90deg) " },
      { n: [0, 1, 0], colour: "yellow", place: "rotateX(-90deg) " }
    ];

    // 3x3 rotation matrices, stored row by row.
    function rot(axis, deg) {
      var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
      if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
      return [c, -s, 0, s, c, 0, 0, 0, 1];
    }
    function mul(a, b) {
      var m = [];
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          m.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
        }
      }
      return m;
    }
    function apply(m, v) {
      return [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
      ];
    }
    var round = function (list) { return list.map(Math.round); };
    // A piece's CSS transform: turned by R, then moved to its slot p (in pieces from the middle).
    function place(R, p) {
      return "matrix3d(" + [R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0,
        p[0] * C, p[1] * C, p[2] * C, 1].join(",") + ")";
    }

    var pieces = [];
    var stickers = []; // every outward face, for the lighting
    cube.textContent = "";
    cube.classList.add("is-real");
    for (var x = -1; x <= 1; x++) {
      for (var y = -1; y <= 1; y++) {
        for (var z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue; // the hidden core
          var piece = { el: document.createElement("div"), p: [x, y, z], R: rot(0, 0) };
          piece.now = piece.R;
          piece.el.className = "cube-piece";
          SIDES.forEach(function (side) {
            var face = document.createElement("div");
            var out = side.n[0] * piece.p[0] + side.n[1] * piece.p[1] + side.n[2] * piece.p[2] === 1;
            face.className = "cube-facelet " + (out ? "cube-" + side.colour : "is-inner");
            face.style.transform = side.place + "translateZ(" + C / 2 + "px)";
            piece.el.appendChild(face);
            if (out) stickers.push({ el: face, piece: piece, n: side.n, shade: -1 });
          });
          piece.el.style.transform = place(piece.R, piece.p);
          cube.appendChild(piece.el);
          pieces.push(piece);
        }
      }
    }

    // A quarter turn of one outer layer: every piece in it turns about the cube's middle.
    function bake(move) {
      var R = rot(move.axis, 90 * move.dir);
      pieces.forEach(function (pc) {
        if (pc.p[move.axis] !== move.layer) return;
        pc.R = round(mul(R, pc.R));
        pc.now = pc.R;
        pc.p = round(apply(R, pc.p));
        pc.el.style.transform = place(pc.R, pc.p);
      });
    }

    // Scramble it with real turns (never the same axis twice running, so none cancel out).
    var scramble = [];
    for (var i = 0, last = -1; i < MOVES; i++) {
      var axis;
      do { axis = Math.floor(Math.random() * 3); } while (axis === last);
      last = axis;
      scramble.push({ axis: axis, layer: Math.random() < 0.5 ? -1 : 1, dir: Math.random() < 0.5 ? -1 : 1 });
    }
    scramble.forEach(bake);

    // The solve is the scramble played backwards, each turn the other way round.
    scramble.slice().reverse().forEach(function (m, n) {
      var move = { axis: m.axis, layer: m.layer, dir: -m.dir };
      var state = { a: 0 };
      var layer = [];
      solve.to(state, {
        a: 90 * move.dir,
        duration: TURN,
        ease: "power2.inOut",
        onStart: function () {
          layer = pieces.filter(function (pc) { return pc.p[move.axis] === move.layer; });
        },
        onUpdate: function () {
          var R = rot(move.axis, state.a);
          layer.forEach(function (pc) {
            pc.now = mul(R, pc.R);
            pc.el.style.transform = place(pc.now, apply(R, pc.p));
          });
        },
        onComplete: function () { bake(move); }
      }, MOVES_AT + n * (TURN + GAP));
    });

    // ----- Light -----
    // A light above, to the left and in front. Each sticker darkens as it turns away from
    // it, worked out every frame from which way it faces right now.
    var LIGHT = (function (v) {
      var len = Math.hypot(v[0], v[1], v[2]);
      return v.map(function (n) { return n / len; });
    })([-0.35, -0.55, 0.76]);
    function brightness(n) {
      var d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
      return 0.32 + 0.68 * Math.max(0, d);
    }
    // Where the CSS spin is right now (it turns both ways by the same angle).
    function spinAngle() {
      var anims = cube.getAnimations ? cube.getAnimations() : [];
      var ms = anims.length ? Number(anims[0].currentTime) || 0 : 0;
      return ((ms / 1000) % SPIN) / SPIN * 360;
    }
    function light() {
      var rx = turn ? turn.rx : spinAngle();
      var ry = turn ? turn.ry : spinAngle();
      var S = mul(rot(0, rx), rot(1, ry)); // the cube's own turn: rotateX(rx) rotateY(ry)
      stickers.forEach(function (st) {
        var shade = 1 - brightness(apply(S, apply(st.piece.now, st.n)));
        if (Math.abs(shade - st.shade) < 0.01) return; // too small to see: skip the work
        st.shade = shade;
        st.el.style.setProperty("--shade", shade.toFixed(3));
      });
    }
    gsap.ticker.add(light);
    light();

    // A soft shadow on the floor under the cube, so it sits somewhere instead of floating.
    var floor = document.createElement("div");
    floor.className = "cube-intro-floor";
    intro.appendChild(floor);

    function startSolve() {
      if (solving) return;
      solving = true;
      idle.kill();

      // Pick up the CSS spin exactly where it is, so there's no jump.
      var from = spinAngle();
      turn = { rx: from, ry: from };
      var setTurn = function () {
        cube.style.transform = "rotateX(" + turn.rx + "deg) rotateY(" + turn.ry + "deg)";
      };
      setTurn();
      cube.classList.add("is-solving");

      // 1. The tumble carries on into the three-quarter view and settles there, the way
      //    you'd catch a cube to solve it. Each angle goes forward (the way it was already
      //    spinning) by at least half a turn, to the next angle that matches the pose.
      var ahead = function (now, goal) { return goal + Math.ceil((now + 180 - goal) / 360) * 360; };
      var rx = ahead(from, POSE.rx);
      var ry = ahead(from, POSE.ry);
      // An ease that starts at the CSS spin's speed and glides to a stop.
      var catchUp = function (dist) {
        var v = (360 / SPIN) * SETTLE / dist;
        return function (p) { return v * (p * p * p - 2 * p * p + p) + (3 * p * p - 2 * p * p * p); };
      };
      solve.to(turn, { rx: rx, duration: SETTLE, ease: catchUp(rx - from), onUpdate: setTurn }, 0)
        .to(turn, { ry: ry, duration: SETTLE, ease: catchUp(ry - from), onUpdate: setTurn }, 0);

      // 2. The layers turn (added above). 3. Solved: it turns the green side square to you.
      solve.to(turn, {
        rx: Math.round(rx / 360) * 360,
        ry: Math.round(ry / 360) * 360,
        duration: FACE,
        ease: "power2.inOut",
        onUpdate: setTurn
      }, SOLVE - FACE);
      solve.play();
    }

    // Solved: show "Scroll" and get the zoom ready for it.
    function ready() {
      // The cube now sits still with green facing you, so swap the 3D cube for a flat copy
      // of that one side. It looks identical (same pieces, same light), but the zoom is
      // then a plain 2D scale of nine squares instead of 26 pieces in 3D, which is far
      // lighter to draw at 30x.
      gsap.ticker.remove(light);
      var flat = document.createElement("div");
      flat.className = "cube-intro-flat";
      var frontShade = (1 - brightness([0, 0, 1])).toFixed(3);
      for (var k = 0; k < 9; k++) {
        var f = document.createElement("div");
        f.className = "cube-facelet cube-green";
        f.style.setProperty("--shade", frontShade);
        flat.appendChild(f);
      }
      cube.remove();
      loader.appendChild(flat);
      intro.classList.add("is-flat");

      // Big enough that the green centre sticker, rounded corners and all, covers the screen.
      var cover = function () {
        return (Math.max(window.innerWidth, window.innerHeight) / CENTRE) * 1.35;
      };
      // The zoom grows the scale exponentially (each moment multiplies it by the same
      // amount), so it feels like moving forward at a steady speed instead of creeping,
      // then lurching at the end.
      var zoom = { z: 0 };
      var setZoom = function () {
        gsap.set(loader, { scale: Math.pow(cover(), zoom.z) });
      };
      reveal = gsap.timeline({ paused: true })
        .fromTo(floor, { opacity: 1 }, { opacity: 0, duration: 0.2, ease: "none", immediateRender: false }, 0)
        .to(zoom, { z: 1, duration: 0.8, ease: "sine.inOut", onUpdate: setZoom }, 0)
        .to(intro, { opacity: 0, duration: 0.35, ease: "sine.inOut" }, 0.65);

      // Split the hero's name into letters now, while the cube still covers it, so
      // starting the typing later costs nothing.
      prepareHero();
      window.addEventListener("resize", onResize);

      // A short rest, solved, then it flies in by itself.
      revealing = gsap.to(reveal, {
        progress: 1,
        duration: REVEAL,
        delay: HOLD,
        ease: "power1.inOut",
        onUpdate: function () {
          // The hero starts typing while the green still fills the screen, so it's
          // mid-entrance as the page shows through.
          if (reveal.progress() > 0.55) startHero();
        },
        onComplete: finish
      });
      revealing.timeScale(pace);
    }

    function onResize() {
      if (reveal) reveal.invalidate().progress(reveal.progress());
    }

    // Scrolling or a key press hurries it along: the solve and the fly-in speed up
    // smoothly rather than jumping. Tab or Escape hurries it most.
    function hurry(speed) {
      if (done || pace >= speed) return;
      pace = speed;
      startSolve();
      gsap.to(solve, { timeScale: speed, duration: 0.5, ease: "sine.in" });
      if (revealing) gsap.to(revealing, { timeScale: speed, duration: 0.4, ease: "sine.in" });
    }

    function onWheel(e) {
      e.preventDefault();
      if (e.deltaY > 0) hurry(3);
    }

    var lastY = null;
    function onTouchStart(e) { lastY = e.touches[0].clientY; }
    function onTouchMove(e) {
      e.preventDefault();
      var y = e.touches[0].clientY;
      if (lastY !== null && lastY - y > 4) hurry(3);
      lastY = y;
    }

    var KEYS = { ArrowDown: 1, PageDown: 1, " ": 1, End: 1 };
    function onKey(e) {
      if (e.key === "Escape" || e.key === "Tab") {
        hurry(6); // Tab isn't stopped, so it still lands on "Skip to content"
        return;
      }
      if (!(e.key in KEYS)) return;
      e.preventDefault();
      hurry(3);
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);

    // All the way in: the cube goes and the page scrolls normally again.
    function finish() {
      if (done) return;
      done = true;
      startHero();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      gsap.ticker.remove(light);
      intro.remove();
      root.classList.remove("cube-intro-lock");
      if (ScrollTrigger) ScrollTrigger.refresh();
    }
  }

  // ===== Everyone: the tool chips' light wave waits until you see it =====
  // The wave is a CSS loop (style.css, "Skill chips"). It's held back until the chips are
  // a third of the way on screen, then starts from the first chip.
  var chipList = $(".chips");
  if (chipList && "IntersectionObserver" in window) {
    document.documentElement.classList.add("chips-wait");
    var chipWatch = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        chipList.classList.add("lit");
        chipWatch.disconnect();
      }
    }, { threshold: 0.33 });
    chipWatch.observe(chipList);
  }

  // ===== Everyone: the info bar's clock and counter =====
  // A live clock (the visitor's own time) and this year's contribution count, padded with
  // zeros like an odometer. The count is read from the graph's caption, so it's always
  // the same number the graph shows.
  var clock = $(".nav-clock");
  if (clock) {
    var pad = function (n) { return String(n).padStart(2, "0"); };
    var showTime = function () {
      var d = new Date();
      clock.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    };
    showTime();
    setInterval(showTime, 1000);
  }
  var counter = $(".nav-count");
  var caption = $(".contrib figcaption");
  if (counter && caption) {
    var total = caption.textContent.replace(/,/g, "").match(/\d+/);
    if (total) counter.textContent = total[0].padStart(11, "0");
  }

  // ===== Everyone: view toggles ("Projects: List Grid", "Graph: 3D 2D") =====
  // Each remembers its choice in this browser (if it can; it's only a convenience).
  function remembered(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }
  function remember(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private window: fine */ }
  }
  function viewToggle(name, apply, fallback) {
    var box = $('.view-toggle[data-toggle="' + name + '"]');
    if (!box) return;
    var buttons = $$("button", box);
    var choose = function (view, keep) {
      if (!buttons.some(function (b) { return b.dataset.view === view; })) view = fallback;
      buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === view)); });
      apply(view);
      if (keep) remember("view-" + name, view);
      // The page's height changes, so the scroll-linked bits re-measure.
      if (ScrollTrigger) ScrollTrigger.refresh();
    };
    buttons.forEach(function (b) {
      b.addEventListener("click", function () { choose(b.dataset.view, true); });
    });
    box.hidden = false;
    choose(remembered("view-" + name, fallback), false);
  }

  var projectGrid = $("#work .card-grid");
  if (projectGrid) {
    viewToggle("projects", function (view) { projectGrid.classList.toggle("is-list", view === "list"); }, "list");
  }

  var yearFigure = $(".github-panel .contrib:not(.overview):not(.activity)");
  var sky = yearFigure && skyline(yearFigure);
  if (sky) {
    viewToggle("graph", function (view) {
      yearFigure.classList.toggle("is-3d", view === "3d");
      sky.show(view === "3d");
    }, "3d");
  }

  // ===== The contribution graph as a 3D skyline =====
  // Every day of the year is a block, as tall as that day was busy (the counts come from
  // the squares' own tooltips), in GitHub's greens. It's drawn on a canvas with a little
  // perspective, far blocks first so near ones cover them. It's one still picture: the
  // whole year from the front, stretched across the box, with nothing to drag or spin.
  function skyline(figure) {
    var rects = $$("svg rect", figure);
    var scroller = $(".contrib-scroll", figure);
    if (!rects.length || !scroller) return null;
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return null;

    var PITCH = 13; // the 2D squares are 10px with a 3px gap
    var xs = rects.map(function (r) { return Number(r.getAttribute("x")); });
    var ys = rects.map(function (r) { return Number(r.getAttribute("y")); });
    var minX = Math.min.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var days = rects.map(function (r, i) {
      var title = $("title", r);
      var count = title ? Number((title.textContent.match(/^(\d+)/) || [0, 0])[1]) : 0;
      var level = Number(((r.getAttribute("class") || "").match(/contrib-l(\d)/) || [0, 0])[1]);
      return { col: Math.round((xs[i] - minX) / PITCH), row: Math.round((ys[i] - minY) / PITCH), n: count, level: level };
    });
    var cols = 1 + Math.max.apply(null, days.map(function (d) { return d.col; }));
    var rows = 7;
    var most = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.n; })));
    days.forEach(function (d) {
      d.h = d.n ? 0.6 + 5.4 * Math.sqrt(d.n / most) : 0.12; // a thin tile for quiet days
      d.x = d.col - (cols - 1) / 2;
      d.z = d.row - (rows - 1) / 2; // the top row (Sunday) is at the back
    });

    // GitHub's dark-theme greens; the sides are the same colour in shade.
    var TOPS = ["#1b222c", "#0e4a20", "#1f7a35", "#2ea043", "#56d364"];
    var darken = function (hex, f) {
      var n = parseInt(hex.slice(1), 16);
      var c = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v * f); });
      return "rgb(" + c.join(",") + ")";
    };
    var FRONT = TOPS.map(function (c) { return darken(c, 0.62); });
    var SIDE = TOPS.map(function (c) { return darken(c, 0.8); });

    var wrap = document.createElement("div");
    wrap.className = "contrib-3d";
    canvas.setAttribute("aria-hidden", "true");
    wrap.appendChild(canvas);
    scroller.parentNode.insertBefore(wrap, scroller.nextSibling);

    // One fixed view: the year runs left to right, seen from the front and above, turned
    // just enough that the blocks' right sides show. Looking down this steeply, the tall
    // blocks don't hide the ones behind them.
    var YAW = 0.04, PITCH_ANGLE = 1.05, F = 150, PAD = 8;
    var cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH_ANGLE), sp = Math.sin(PITCH_ANGLE);
    var a = 0.4; // half a block, so there's a gap between them

    // Where a point lands at scale 1, centred on 0,0. Every other size is just this times
    // the scale, so the drawing can be fitted to the box exactly.
    function place(x, y, z) {
      var xr = x * cy - z * sy, zr = x * sy + z * cy;
      var yc = y * cp - zr * sp, dc = y * sp + zr * cp;
      var k = F / (F - dc);
      return [xr * k, -yc * k];
    }

    // The outline of every block, so the fit includes the tallest ones.
    var box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    days.forEach(function (d) {
      [d.x - a, d.x + a].forEach(function (x) {
        [d.z - a, d.z + a].forEach(function (z) {
          [0, d.h].forEach(function (y) {
            var pt = place(x, y, z);
            box.x0 = Math.min(box.x0, pt[0]); box.x1 = Math.max(box.x1, pt[0]);
            box.y0 = Math.min(box.y0, pt[1]); box.y1 = Math.max(box.y1, pt[1]);
          });
        });
      });
    });

    // Far blocks first, so near ones cover them.
    var order = days.slice().sort(function (p, q) {
      return ((p.x * sy + p.z * cy) * cp + p.h * 0.5 * sp) - ((q.x * sy + q.z * cy) * cp + q.h * 0.5 * sp);
    });

    var showing = false;

    // Stretch the year across the full width of the box, then make the canvas exactly as
    // tall as that needs, so there's no empty band above or below it.
    function render() {
      var W = canvas.clientWidth;
      if (!W) return;
      var scale = (W - PAD * 2) / (box.x1 - box.x0);
      var H = Math.max(120, Math.round((box.y1 - box.y0) * scale + PAD * 2));
      canvas.style.height = H + "px";
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var ox = PAD - box.x0 * scale;
      var oy = (H - (box.y1 - box.y0) * scale) / 2 - box.y0 * scale;
      var proj = function (x, y, z) {
        var pt = place(x, y, z);
        return [ox + pt[0] * scale, oy + pt[1] * scale];
      };
      var poly = function (pts, colour) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fill();
      };

      order.forEach(function (d) {
        var h = d.h;
        var x0 = d.x - a, x1 = d.x + a, z0 = d.z - a, z1 = d.z + a;
        poly([proj(x0, 0, z1), proj(x1, 0, z1), proj(x1, h, z1), proj(x0, h, z1)], FRONT[d.level]);
        poly([proj(x1, 0, z1), proj(x1, 0, z0), proj(x1, h, z0), proj(x1, h, z1)], SIDE[d.level]);
        poly([proj(x0, h, z0), proj(x1, h, z0), proj(x1, h, z1), proj(x0, h, z1)], TOPS[d.level]);
      });
    }

    window.addEventListener("resize", function () {
      if (showing) render();
    });

    return {
      show: function (on) {
        showing = on;
        if (on) render();
      }
    };
  }

  // ===== Everyone: the looping lights rest while they're off screen =====
  // The graph squares twinkle and the tool chips' light wave runs on a loop (style.css,
  // "Lights"). There are dozens of them, so they pause while you can't see them, which
  // saves phone batteries, and pick up where they left off when you scroll back.
  if ("IntersectionObserver" in window) {
    var restWatch = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        e.target.classList.toggle("is-offscreen", !e.isIntersecting);
      });
    });
    $$(".github-panel .contrib, .chips").forEach(function (el) { restWatch.observe(el); });
  }

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
    var activityCleanup = null;
    var terminalCleanup = null;

    if (isHome) {
      // Hero: the page's one big moment. "Hi, I'm" fades up, then the name types in like a
      // terminal: a gold caret runs ahead of the letters, blinks twice when it's done and
      // goes. Then the line under it, the buttons and the "Open to work" light settle in.
      // With the cube intro, this waits until the zoom uncovers the page.
      if (!introPlaying) startHero();

      // Cards, strengths, chips and About answers no longer fade in on scroll: they sit
      // ready when you get to them (taste-skill pass). The visuals below still play.

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
            // About 3 seconds from January to today, so the sweep is easy to follow.
            duration: 0.7,
            ease: "back.out(2)",
            delay: function (i) { return ((xs[i] - minX) / spanX) * 3 + (i % 7) * 0.03; }
          });
        }, "top 80%");
      }

      // Tool chips hop when you point at one.
      var chips = $$(".chips li");
      chips.forEach(function (chip) {
        chip.addEventListener("pointerenter", function () {
          gsap.fromTo(chip, { y: 0 }, {
            y: -6, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1, overwrite: true
          });
        });
      });

      // The 31-day activity graph plays like a heartbeat monitor. A glowing scanner sweeps
      // left to right over about 3 seconds (matching the contribution graph) and draws the
      // line flat behind it. Each busy day springs up as the scanner reaches it, with a
      // ripple and a "+N" that floats off. When the sweep ends, the shading fills in and
      // today's dot keeps a slow pulse.
      var activity = $(".contrib.activity svg");
      if (activity) activityCleanup = playActivity(activity);

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
      terminalCleanup = playTerminal();
    }

    return function () {
      document.documentElement.classList.remove("gsap-motion");
      if (glow) glow.remove();
      if (activityCleanup) activityCleanup();
      if (terminalCleanup) terminalCleanup();
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
      var original = title ? title.textContent : "";
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
  // ===== Terminal page: the nvim session =====
  //
  // Plays the session live: type `nvim codingsqurl.cpp`, nvim opens, the program is
  // typed in with syntax colours, Esc, :wq, then it's compiled and run. terminal.html
  // holds the finished session for everyone this doesn't run for. The program is real
  // (it compiles with g++ -std=c++17 and prints exactly what's shown); keep it in step
  // with the copy in terminal.html.

  var CPP = [
    "#include <iostream>",
    "",
    "// one squrl, one day",
    "bool eat()   { return true;  }",
    "bool sleep() { return true;  }",
    "bool dead()  { return false; }",
    "",
    "int main() {",
    "    if (eat() && sleep() && !dead()) {",
    "        std::cout << \"coffee && code\\n\";",
    "    } else {",
    "        std::cout << \"brb, rebooting\\n\";",
    "    }",
    "",
    "    // where the good coffee is",
    "    std::cout << \"there's no place like 127.0.0.1\\n\";",
    "    return 0;",
    "}"
  ];

  // Splits a line of C++ into coloured pieces: [{ cls, text }]. Leading spaces come out
  // as their own piece, flagged indent, since nvim's autoindent puts them in at once.
  function cppTokens(line) {
    var out = [];
    var re = /(\/\/.*$)|(#\w+)|(<\w+>)|("(?:\\.|[^"\\])*")|([A-Za-z_]\w*)|(\d+)|(\s+)|(.)/g;
    var m;
    while ((m = re.exec(line))) {
      var cls = m[1] ? "c" : m[2] ? "p" : (m[3] || m[4]) ? "s" : m[6] ? "n" : "";
      if (m[5]) {
        if (/^(bool|int|if|else|return|true|false)$/.test(m[5])) cls = "k";
        else if (m[5] === "std" || m[5] === "cout") cls = "t";
        else if (line.charAt(re.lastIndex) === "(") cls = "f";
      }
      out.push({ cls: cls, text: m[0], indent: !!m[7] && m.index === 0 });
    }
    return out;
  }

  function playTerminal() {
    var screen = $(".term-screen");
    var title = $(".term-title");
    if (!screen) return null;

    var fallback = screen.innerHTML;
    var shellTitle = title ? title.textContent : "";
    var STOP = {};
    var alive = true;
    var stopConfetti = null;

    // Screen readers get the finished session; the animation is hidden from them.
    var sr = document.createElement("div");
    sr.className = "term-sr";
    sr.innerHTML = fallback;
    screen.parentNode.insertBefore(sr, screen);
    screen.setAttribute("aria-hidden", "true");

    function wait(ms) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () { if (alive) resolve(); else reject(STOP); }, ms);
      });
    }
    function make(tag, cls, text, parent) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text != null) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }
    function setTitle(text) { if (title) title.textContent = text; }

    // ---- zsh ----
    var shell = null;
    var cursor = null;
    function showShell() {
      screen.textContent = "";
      shell = make("ol", "term-lines", null, screen);
      setTitle(shellTitle);
    }
    function prompt() {
      var li = make("li", "t-cmd", null, shell);
      make("span", "t-prompt", "~ %", li);
      li.appendChild(document.createTextNode(" "));
      var typed = make("span", null, "", li);
      cursor = make("span", "t-cursor", null, li);
      return typed;
    }
    async function run(cmd) {
      var typed = prompt();
      await wait(600);
      cursor.classList.add("is-typing");
      for (var i = 0; i < cmd.length; i++) {
        typed.textContent += cmd[i];
        await wait(40 + Math.random() * 60);
      }
      cursor.classList.remove("is-typing");
      await wait(380);
      cursor.remove();
    }
    function say(text, cls) { make("li", cls, text, shell); }

    // ---- nvim ----
    async function nvim(file, lines) {
      screen.textContent = "";
      setTitle("squrl@127.0.0.1 — nvim " + file + " — 80×24");
      var nv = make("div", "nv", null, screen);
      var buf = make("div", "nv-buf", null, nv);
      var rows = [];
      for (var r = 0; r < 22; r++) {
        var row = make("div", "nv-row is-empty", null, buf);
        rows.push({ row: row, num: make("span", "nv-num", "~", row), text: make("span", null, "", row) });
      }
      var status = make("div", "nv-status", null, nv);
      var mode = make("span", "nv-mode", "", status);
      make("span", null, file, status);
      var mod = make("span", "nv-mod", "", status);
      var right = make("span", "nv-right", "cpp  utf-8  ", status);
      var pos = make("span", null, "1:1", right);
      var cmd = make("div", "nv-cmd", '"' + file + '" [New]', nv);
      var caret = make("span", "nv-caret");
      var current = null;

      function setMode(name) {
        mode.textContent = name;
        nv.setAttribute("data-mode", name.toLowerCase());
      }
      function openLine(i) {
        var r = rows[i];
        r.row.classList.remove("is-empty");
        r.num.textContent = ("   " + (i + 1)).slice(-3) + " ";
        if (current) current.row.classList.remove("is-current");
        r.row.classList.add("is-current");
        r.text.appendChild(caret);
        current = r;
      }

      setMode("NORMAL");
      openLine(0);
      await wait(1100);

      setMode("INSERT");              // i
      cmd.textContent = "-- INSERT --";
      await wait(450);

      var bytes = 0;
      for (var i = 0; i < lines.length; i++) {
        if (i > 0) { openLine(i); await wait(90 + Math.random() * 90); }
        var col = 0;
        var pieces = cppTokens(lines[i]);
        for (var p = 0; p < pieces.length; p++) {
          var piece = pieces[p];
          var span = make("span", piece.cls ? "sx-" + piece.cls : null, "", rows[i].text);
          rows[i].text.appendChild(caret);
          if (piece.indent) {
            span.textContent = piece.text;
            col += piece.text.length;
            continue;
          }
          for (var c = 0; c < piece.text.length; c++) {
            var ch = piece.text[c];
            span.textContent += ch;
            col++;
            pos.textContent = (i + 1) + ":" + (col + 1);
            mod.textContent = "[+]";
            await wait((/[;{}]/.test(ch) ? 90 : 0) + 16 + Math.random() * 34);
          }
        }
        bytes += lines[i].length + 1;
      }
      await wait(700);

      setMode("NORMAL");              // Esc
      cmd.textContent = "";
      await wait(800);

      setMode("COMMAND");             // :wq
      cmd.textContent = ":";
      await wait(320);
      for (var k = 0; k < 2; k++) {
        cmd.textContent += "wq"[k];
        await wait(170);
      }
      await wait(420);
      setMode("NORMAL");
      mod.textContent = "";
      cmd.textContent = '"' + file + '" [New] ' + lines.length + "L, " + bytes + "B written";
      await wait(800);
    }

    (async function () {
      try {
        showShell();
        await wait(500);              // the window is still opening
        await run("nvim codingsqurl.cpp");
        await wait(350);
        await nvim("codingsqurl.cpp", CPP);

        // nvim closes and the shell is back, as it was.
        showShell();
        var back = make("li", "t-cmd", null, shell);
        make("span", "t-prompt", "~ %", back);
        back.appendChild(document.createTextNode(" nvim codingsqurl.cpp"));

        await run("g++ -std=c++17 -o codingsqurl codingsqurl.cpp");
        await wait(900);              // compiling
        await run("./codingsqurl");
        await wait(250);
        say("coffee && code", "t-ok");
        await wait(600);
        say("there's no place like 127.0.0.1", "t-punchline");
        stopConfetti = confetti();
        await wait(500);
        prompt();                     // waiting for the next command
      } catch (e) {
        if (e !== STOP) throw e;
      }
    })();

    return function () {
      alive = false;
      if (stopConfetti) stopConfetti();
      screen.innerHTML = fallback;
      screen.removeAttribute("aria-hidden");
      if (sr.parentNode) sr.parentNode.removeChild(sr);
      setTitle(shellTitle);
    };
  }

  // Confetti in the rasta colours, fired from the two top corners of the screen to fill
  // the page, then drifting slowly down. It's drawn on a canvas laid over the page
  // that clicks pass straight through, and the canvas is removed once the last piece
  // has fallen away. Returns a function that stops it early.
  function confetti() {
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0;
    var H = 0;
    function size() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size);

    var COLORS = ["#1fb954", "#fcd116", "#e8333c", "#1fb954", "#fcd116", "#e8333c", "#f5f5f7"];
    var pieces = [];
    function fire(x, y, count, angle, spread, speed) {
      for (var i = 0; i < count; i++) {
        var a = (angle + (Math.random() - 0.5) * spread) * Math.PI / 180;
        var v = speed * (0.25 + Math.random() * 0.9);  // a wide mix, so pieces land near and far
        pieces.push({
          x: x, y: y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
          round: Math.random() < 0.25,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          spin: Math.random() * Math.PI * 2, spinV: (Math.random() - 0.5) * 0.3,
          flip: Math.random() * Math.PI * 2, flipV: 0.08 + Math.random() * 0.12,
          sway: Math.random() * Math.PI * 2, swayV: 0.03 + Math.random() * 0.04,
          fall: 1.4 + Math.random() * 1.6,       // top falling speed: light pieces float
          life: 0
        });
      }
    }

    // Eight volleys from each top corner over two seconds, fanned from a little upward to
    // steeply down. Between them they cover the whole page, top to bottom, side to side.
    var volleys = [0, 1, 2, 3, 4, 5, 6, 7].map(function (n) {
      return setTimeout(function () {
        fire(0, 0, 90, 30, 80, 26);
        fire(W, 0, 90, 150, 80, 26);
      }, n * 250);
    });

    var raf = 0;
    var last = performance.now();
    function frame(now) {
      var dt = Math.min((now - last) / 16.67, 3); // in 60fps frames, so speed doesn't depend on the screen
      last = now;
      ctx.clearRect(0, 0, W, H);
      for (var i = pieces.length - 1; i >= 0; i--) {
        var p = pieces[i];
        p.life += dt;
        p.vy += 0.12 * dt;                        // gentle gravity
        p.vx *= Math.pow(0.985, dt);              // air
        if (p.vy > p.fall) p.vy += (p.fall - p.vy) * 0.08 * dt;  // eases to its top falling speed
        p.sway += p.swayV * dt;
        p.x += (p.vx + Math.sin(p.sway) * 1.4) * dt;
        p.y += p.vy * dt;
        p.spin += p.spinV * dt;
        p.flip += p.flipV * dt;
        if (p.y > H + 40 || p.life > 1500) { pieces.splice(i, 1); continue; }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.scale(1, Math.cos(p.flip));          // tumbling: the piece turns edge-on and back
        ctx.globalAlpha = Math.min(1, (1500 - p.life) / 60);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      if (pieces.length || now - start < 2000) raf = requestAnimationFrame(frame);
      else stop();
    }
    var start = performance.now();
    raf = requestAnimationFrame(frame);

    function stop() {
      cancelAnimationFrame(raf);
      volleys.forEach(clearTimeout);
      window.removeEventListener("resize", size);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    return stop;
  }

  // The activity graph's sweep (see "Full motion"). Returns a function that undoes it.
  function playActivity(svg) {
    var NS = "http://www.w3.org/2000/svg";
    var line = $(".activity-line", svg);
    var area = $(".activity-area", svg);
    var dots = $$(".activity-dot", svg);
    if (!line || !dots.length) return null;

    var pts = dots.map(function (dot) {
      var title = dot.querySelector("title");
      return {
        x: parseFloat(dot.getAttribute("cx")),
        y: parseFloat(dot.getAttribute("cy")),
        n: parseInt((title && title.textContent) || "", 10) || 0
      };
    });
    var base = Math.max.apply(null, pts.map(function (p) { return p.y; }));
    var x0 = pts[0].x;
    var x1 = pts[pts.length - 1].x;
    var lineD = line.getAttribute("d");
    var areaD = area && area.getAttribute("d");
    var made = [];
    var tweens = [];

    function el(tag, attrs, parent) {
      var node = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
      (parent || svg).appendChild(node);
      made.push(node);
      return node;
    }

    // Every point starts flat on the baseline; ys holds where each one is right now.
    var ys = pts.map(function () { return base; });
    function redraw() {
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + p.x + " " + ys[i]; }).join(" ");
      line.setAttribute("d", d);
      if (area) area.setAttribute("d", d + " L" + x1 + " " + base + " L" + x0 + " " + base + " Z");
      dots.forEach(function (dot, i) { dot.setAttribute("cy", ys[i]); });
    }
    function yAt(x) {
      for (var i = 1; i < pts.length; i++) {
        if (x <= pts[i].x) {
          var t = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x);
          return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
        }
      }
      return ys[ys.length - 1];
    }

    // Only what the scanner has passed is visible.
    var id = "activity-reveal-" + Math.random().toString(36).slice(2, 8);
    var defs = el("defs", {});
    var clip = el("clipPath", { id: id }, defs);
    var reveal = el("rect", { x: 0, y: 0, width: x0, height: 200 }, clip);
    var grad = el("linearGradient", { id: id + "-scan", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0", "stop-color": "#56d364", "stop-opacity": "0" }, grad);
    el("stop", { offset: "1", "stop-color": "#56d364", "stop-opacity": "0.35" }, grad);
    line.setAttribute("clip-path", "url(#" + id + ")");
    if (area) {
      area.setAttribute("clip-path", "url(#" + id + ")");
      gsap.set(area, { opacity: 0.35 });
    }
    dots.forEach(function (dot) { dot.setAttribute("r", 0); });
    redraw();

    // The scanner: a soft beam down to the baseline and a glowing head riding the line.
    var beam = el("rect", { x: x0 - 1, y: 10, width: 2, height: base - 10, fill: "url(#" + id + "-scan)" });
    var halo = el("circle", { cx: x0, cy: base, r: 11, fill: "#56d364", "fill-opacity": 0.18 });
    var head = el("circle", { cx: x0, cy: base, r: 4.5, fill: "#d2ffd8" });
    [beam, halo, head].forEach(function (n) { n.style.pointerEvents = "none"; });
    gsap.set([beam, halo, head], { opacity: 0 });

    function burst(p) {
      var ring = el("circle", { cx: p.x, cy: p.y, r: 3, fill: "none", stroke: "#56d364", "stroke-width": 2 });
      var label = el("text", {
        x: p.x, y: p.y - 12, "text-anchor": "middle", class: "activity-burst"
      });
      label.textContent = "+" + p.n;
      ring.style.pointerEvents = label.style.pointerEvents = "none";
      var tl = gsap.timeline({ onComplete: function () { ring.remove(); label.remove(); } });
      tl.fromTo(ring, { attr: { r: 3 }, opacity: 0.9 },
                      { attr: { r: 14 + p.n * 3 }, opacity: 0, duration: 0.9, ease: "power2.out" }, 0)
        .fromTo(label, { opacity: 0, attr: { y: p.y - 6 } },
                       { opacity: 1, attr: { y: p.y - 18 }, duration: 0.35, ease: "back.out(2)" }, 0.05)
        .to(label, { opacity: 0, attr: { y: p.y - 30 }, duration: 0.6, ease: "power1.in" }, 0.9);
      tweens.push(tl);
    }

    var sweep = 3;
    var at = function (p) { return ((p.x - x0) / (x1 - x0 || 1)) * sweep; };
    var scan = { x: x0 };
    var tl = gsap.timeline({ paused: true, onUpdate: redraw });
    tweens.push(tl);
    onFirstView(svg, function () { tl.play(); }, "top 80%");

    tl.to([beam, halo, head], { opacity: 1, duration: 0.25 }, 0)
      .to(scan, {
        x: x1, duration: sweep, ease: "none",
        onUpdate: function () {
          var y = yAt(scan.x);
          reveal.setAttribute("width", scan.x + 4);
          beam.setAttribute("x", scan.x - 1);
          halo.setAttribute("cx", scan.x); halo.setAttribute("cy", y);
          head.setAttribute("cx", scan.x); head.setAttribute("cy", y);
        }
      }, 0);

    pts.forEach(function (p, i) {
      var t = at(p);
      var dot = dots[i];
      if (p.n > 0) {
        var proxy = { y: base };
        tl.to(proxy, {
          y: p.y, duration: 1.1, ease: "elastic.out(1, 0.45)",
          onUpdate: function () { ys[i] = proxy.y; }
        }, t)
          .to(dot, { attr: { r: 5 }, duration: 0.3, ease: "back.out(3)" }, t + 0.05)
          .to(dot, { attr: { r: 3 }, duration: 0.5, ease: "power2.out" }, t + 0.4)
          .add(function () { burst(p); }, t + 0.08)
          .fromTo(halo, { attr: { r: 11 } }, { attr: { r: 18 }, duration: 0.15, yoyo: true, repeat: 1 }, t);
      } else {
        tl.to(dot, { attr: { r: 3 }, duration: 0.35, ease: "back.out(3)" }, t);
      }
    });

    // The sweep lands: the scanner fades, the shading fills, and today keeps beating.
    tl.to([beam, halo, head], { opacity: 0, duration: 0.4, ease: "power1.out" }, sweep + 0.05);
    if (area) tl.to(area, { opacity: 1, duration: 1, ease: "power2.out" }, sweep);
    var last = pts[pts.length - 1];
    var pulse = el("circle", { cx: last.x, cy: last.y, r: 3, fill: "none", stroke: "#56d364", "stroke-width": 1.5 });
    pulse.style.pointerEvents = "none";
    gsap.set(pulse, { opacity: 0 });
    tl.add(function () {
      tweens.push(gsap.fromTo(pulse, { attr: { r: 3 }, opacity: 0.8 },
        { attr: { r: 13 }, opacity: 0, duration: 1.8, ease: "power2.out", repeat: -1, repeatDelay: 0.4 }));
    }, sweep + 1.2);
    tl.add(function () {
      line.removeAttribute("clip-path");
      if (area) area.removeAttribute("clip-path");
    });

    return function () {
      tweens.forEach(function (t) { t.kill(); });
      made.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      line.setAttribute("d", lineD);
      line.removeAttribute("clip-path");
      if (area) { area.setAttribute("d", areaD); area.removeAttribute("clip-path"); gsap.set(area, { clearProps: "opacity" }); }
      dots.forEach(function (dot, i) { dot.setAttribute("r", 3); dot.setAttribute("cy", pts[i].y); });
    };
  }

  // ===== The particle field behind the page =====
  // A few thousand points of light drift through a slow noise field in green, gold and
  // red, brightest where the noise bunches them into ribbons. They lean away from the
  // cursor and slide a little as you scroll. It's one WebGL draw a frame, it pauses when
  // the tab is hidden, and for less motion it paints one still frame instead.
  // Without WebGL the CSS glow (body::before) is still there underneath.
  (function particleField() {
    if (isTerminal) return;
    var canvas = document.createElement("canvas");
    canvas.className = "gl-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true });
    if (!gl) return;

    var NOISE = [
      "vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}",
      "vec2 m289(vec2 x){return x-floor(x*(1./289.))*289.;}",
      "vec3 perm(vec3 x){return m289(((x*34.)+1.)*x);}",
      "float snoise(vec2 v){",
      " const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);",
      " vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);",
      " vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);",
      " vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=m289(i);",
      " vec3 p=perm(perm(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));",
      " vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.); m=m*m; m=m*m;",
      " vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-.5; vec3 ox=floor(x+.5); vec3 a0=x-ox;",
      " m*=1.79284291400159-.85373472095314*(a0*a0+h*h);",
      " vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;",
      " return 130.*dot(m,g);}"
    ].join("\n");

    var VERT = [
      "attribute vec4 aSeed;",       // xy: start spot (-1..1), z: speed, w: size
      "uniform float uTime; uniform float uAspect; uniform float uScroll; uniform float uDpr;",
      "uniform vec2 uMouse; uniform float uHero;",
      "varying vec3 vColor; varying float vAlpha;",
      NOISE,
      "void main(){",
      " vec2 p=aSeed.xy; float t=uTime*.04;",
      " p.x=mod(p.x+1.+uTime*.006*aSeed.z,2.)-1.;",   // a slow drift to the right, wrapping round
      " p.y=mod(p.y+1.-uScroll*.18*aSeed.z,2.)-1.;",   // a little parallax as the page scrolls
      " vec2 q=vec2(p.x*uAspect,p.y);",
      " p+=.11*vec2(snoise(q*1.1+vec2(t,0.)),snoise(q*1.1+vec2(17.,t)));",
      " vec2 away=vec2((p.x-uMouse.x)*uAspect,p.y-uMouse.y); float d=length(away);",
      " p+=normalize(away+1e-4)*.09*smoothstep(.32,0.,d)/vec2(uAspect,1.);",
      " float band=snoise(vec2(p.x*uAspect,p.y)*1.4+vec2(-t*.7,t*.4));",
      " vAlpha=smoothstep(-.35,.7,band)*(.35+.65*aSeed.w);",
      // About a third of the points also belong to a globe on the right of the hero. It
      // turns slowly, and melts back into the field as the hero scrolls away (uHero).
      " float kOff=0.;",
      " float pick=fract(aSeed.x*43.17+aSeed.y*91.3);",
      " if(pick<.38){",
      "  float th=aSeed.y*3.14159+uTime*.12; float ph=acos(clamp(aSeed.x,-1.,1.));",
      "  float r=(uAspect>1.?.52:.36)*(1.+.06*snoise(vec2(th*1.5,ph*2.)+t*2.));",
      "  vec3 g=vec3(sin(ph)*cos(th),cos(ph),sin(ph)*sin(th))*r;",
      "  float ct=cos(.35),st=sin(.35); g.yz=vec2(g.y*ct-g.z*st,g.y*st+g.z*ct);",
      "  vec2 c=uAspect>1.?vec2(.62*uAspect,.02):vec2(.35*uAspect,.5);",
      "  vec2 gp=vec2((c.x+g.x)/uAspect,c.y+g.y);",
      "  float m=(1.-uHero)*(1.-uHero);",
      "  p=mix(p,gp,m);",
      "  vAlpha=mix(vAlpha,.35+.65*smoothstep(-r,r,g.z),m);",
      "  kOff=m*(.5-.5*g.y/r-(p.x*.5+.5));",
      " }",
      " float k=clamp(p.x*.5+.5+.25*band+kOff,0.,1.);",
      " vec3 green=vec3(.122,.725,.329), gold=vec3(.988,.82,.086), red=vec3(.91,.2,.235);",
      " vColor=k<.5?mix(green,gold,k*2.):mix(gold,red,k*2.-1.);",
      " gl_Position=vec4(p,0.,1.);",
      " gl_PointSize=(1.3+aSeed.w*2.8)*uDpr;",
      "}"
    ].join("\n");

    var FRAG = [
      "precision mediump float;",
      "varying vec3 vColor; varying float vAlpha;",
      "void main(){",
      " float d=length(gl_PointCoord-.5)*2.;",
      " float a=vAlpha*pow(max(1.-d,0.),1.6);",
      " gl_FragColor=vec4(vColor*a,a);",
      "}"
    ].join("\n");

    function shader(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    }
    var vs = shader(gl.VERTEX_SHADER, "precision highp float;\n" + VERT);
    var fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var small = window.matchMedia("(max-width: 700px)").matches;
    var COUNT = small ? 5000 : 14000;
    var seeds = new Float32Array(COUNT * 4);
    for (var i = 0; i < COUNT; i++) {
      seeds[i * 4] = Math.random() * 2 - 1;
      seeds[i * 4 + 1] = Math.random() * 2 - 1;
      seeds[i * 4 + 2] = 0.4 + Math.random() * 0.9;
      seeds[i * 4 + 3] = Math.pow(Math.random(), 2.2);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    var aSeed = gl.getAttribLocation(prog, "aSeed");
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 4, gl.FLOAT, false, 0, 0);

    var u = {};
    ["uTime", "uAspect", "uScroll", "uDpr", "uMouse", "uHero"].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);   // light adds up where the points overlap
    gl.clearColor(0, 0, 0, 0);

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    function size() {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(u.uAspect, window.innerWidth / window.innerHeight);
      gl.uniform1f(u.uDpr, dpr);
    }
    size();
    document.body.insertBefore(canvas, document.body.firstChild);

    var mouse = { x: 9, y: 9 }, eased = { x: 9, y: 9 };
    var still = window.matchMedia(LESS_MOTION).matches;
    var t0 = performance.now(), raf = 0;

    function draw(now) {
      eased.x += (mouse.x - eased.x) * 0.06;
      eased.y += (mouse.y - eased.y) * 0.06;
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      gl.uniform1f(u.uTime, still ? 40 : (now - t0) / 1000 + 40);
      gl.uniform1f(u.uScroll, window.scrollY / max);
      gl.uniform1f(u.uHero, isHome ? Math.min(1, window.scrollY / (window.innerHeight * 0.9)) : 1);
      gl.uniform2f(u.uMouse, eased.x, eased.y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, COUNT);
    }
    function loop(now) {
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener("resize", function () { size(); if (still) draw(performance.now()); });
    if (still) {
      draw(performance.now());
      return;
    }
    if (window.matchMedia(MOUSE).matches) {
      window.addEventListener("pointermove", function (e) {
        mouse.x = e.clientX / window.innerWidth * 2 - 1;
        mouse.y = 1 - e.clientY / window.innerHeight * 2;
        if (eased.x > 5) { eased.x = mouse.x; eased.y = mouse.y; }
      }, { passive: true });
    }
    document.addEventListener("visibilitychange", function () {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    });
    raf = requestAnimationFrame(loop);
  })();

})();
