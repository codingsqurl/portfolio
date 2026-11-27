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
    var activityCleanup = null;
    var terminalCleanup = null;

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
            // About 3 seconds from January to today, so the sweep is easy to follow.
            duration: 0.7,
            ease: "back.out(2)",
            delay: function (i) { return ((xs[i] - minX) / spanX) * 3 + (i % 7) * 0.03; }
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

})();
