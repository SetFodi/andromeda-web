/* ====================================================================== */
/*  Andromeda marketing site — interactions                               */
/* ====================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;

  /* ---- Theme --------------------------------------------------------- */
  var THEME_KEY = "andromeda.site.theme";
  var toggle = document.getElementById("themeToggle");

  function setTheme(mode) {
    root.dataset.theme = mode;
    if (toggle) toggle.setAttribute("aria-pressed", String(mode === "dark"));
  }

  var stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
  setTheme(stored === "dark" || stored === "light" ? stored : "light");

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    });
  }

  /* ---- Nav stuck ------------------------------------------------------ */
  var nav = document.getElementById("nav");
  function onNavScroll() {
    if (nav) nav.classList.toggle("is-stuck", window.scrollY > 12);
  }
  onNavScroll();
  window.addEventListener("scroll", onNavScroll, { passive: true });

  /* ---- Reveal --------------------------------------------------------- */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  } else {
    var revObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
    revealEls.forEach(function (el) { revObserver.observe(el); });
  }

  /* ---- Product tilt + scroll parallax --------------------------------- */
  var heroProduct = document.querySelector(".hero-product");
  var productShell = document.querySelector(".product-shell");

  if (productShell && heroProduct && fine && !reduce) {
    heroProduct.addEventListener("pointermove", function (e) {
      var r = heroProduct.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      productShell.style.setProperty("--ry", (px * 3.2).toFixed(2) + "deg");
      productShell.style.setProperty("--rx", (-py * 2.4).toFixed(2) + "deg");
    });
    heroProduct.addEventListener("pointerleave", function () {
      productShell.style.setProperty("--ry", "0deg");
      productShell.style.setProperty("--rx", "0deg");
    });
  }

  var ticking = false;
  function onFrame() {
    ticking = false;
    if (productShell && !reduce) {
      var sty = Math.max(-24, Math.min(24, window.scrollY * 0.03));
      productShell.style.setProperty("--sty", sty.toFixed(1) + "px");
    }
  }
  function requestFrame() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onFrame);
    }
  }
  if (!reduce) {
    window.addEventListener("scroll", requestFrame, { passive: true });
    onFrame();
  }

  /* ====================================================================== */
  /*  Hero demo — a looping tour of the browser                            */
  /*  start → ⌘K + typing → page load + Shield → split → tidy → space      */
  /* ====================================================================== */
  var demo = document.getElementById("appDemo");
  var typeEl = document.getElementById("demoType");
  var captionEl = document.getElementById("demoCaption");
  var demoCmd = demo ? demo.querySelector(".demo-cmd") : null;
  var demoShieldNum = document.getElementById("demoShield");

  var SCENES = [
    { name: "start",   ms: 2400, caption: "A calm place to start." },
    { name: "command", ms: 4300, caption: "⌘K — one field for tabs, history, and actions." },
    { name: "browse",  ms: 4300, caption: "Trackers refused before the page even loads." },
    { name: "split",   ms: 3000, caption: "Split view in one drag." },
    { name: "tidy",    ms: 3200, caption: "Tidy groups tabs by site and closes duplicates." },
    { name: "space",   ms: 3000, caption: "Spaces re-tint the whole shell." }
  ];
  var QUERY = "hubble deep field";

  if (demo && typeEl && captionEl && !reduce) {
    var sceneIndex = -1;
    var timers = [];
    var running = false;

    var later = function (fn, ms) {
      timers.push(window.setTimeout(fn, ms));
    };
    var clearTimers = function () {
      timers.forEach(function (t) { window.clearTimeout(t); });
      timers = [];
    };

    var setCaption = function (text) {
      captionEl.classList.add("is-swapping");
      later(function () {
        captionEl.textContent = text;
        captionEl.classList.remove("is-swapping");
      }, 220);
    };

    var typeQuery = function () {
      typeEl.textContent = "";
      if (demoCmd) demoCmd.classList.remove("has-results");
      var i = 0;
      var step = function () {
        if (demo.dataset.scene !== "command") return;
        typeEl.textContent = QUERY.slice(0, i + 1);
        if (demoCmd && i >= 4) demoCmd.classList.add("has-results");
        i += 1;
        if (i < QUERY.length) later(step, 60 + Math.random() * 90);
      };
      later(step, 650);
    };

    var tickShield = function () {
      demo.classList.add("shield-tick");
      var from = 1272;
      var to = 1281;
      var startAt = performance.now();
      var step = function (now) {
        if (demo.dataset.scene !== "browse" && demo.dataset.scene !== "split") return;
        var t = Math.min(1, (now - startAt) / 900);
        var value = Math.round(from + (to - from) * t);
        if (demoShieldNum) demoShieldNum.textContent = value.toLocaleString();
        if (t < 1) requestAnimationFrame(step);
      };
      later(function () { requestAnimationFrame(step); }, 500);
      later(function () { demo.classList.remove("shield-tick"); }, 2600);
    };

    var playScene = function (index) {
      var scene = SCENES[index];
      demo.dataset.scene = scene.name;
      setCaption(scene.caption);

      if (scene.name === "start") {
        if (demoShieldNum) demoShieldNum.textContent = "1,272";
      } else if (scene.name === "command") {
        typeQuery();
      } else if (scene.name === "browse") {
        tickShield();
      }

      later(function () {
        if (!running) return;
        sceneIndex = (index + 1) % SCENES.length;
        playScene(sceneIndex);
      }, scene.ms);
    };

    var startDemo = function () {
      if (running) return;
      running = true;
      sceneIndex = 0;
      playScene(0);
    };
    var stopDemo = function () {
      running = false;
      clearTimers();
    };

    if ("IntersectionObserver" in window) {
      var demoObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) startDemo();
          else stopDemo();
        });
      }, { threshold: 0.2 });
      demoObs.observe(demo);
    } else {
      startDemo();
    }
  } else if (demo) {
    // Reduced motion: park on the loaded page with a sensible caption.
    demo.dataset.scene = "browse";
    if (captionEl) captionEl.textContent = "Trackers refused before the page even loads.";
    if (typeEl) typeEl.textContent = QUERY;
  }

  /* ---- Appearance mini: cycle Daybreak / Night / Glow ------------------ */
  var themeWindow = document.querySelector(".mini-theme-window");
  if (themeWindow) {
    var themeName = themeWindow.querySelector(".mini-theme-name");
    var themeClock = themeWindow.querySelector(".mini-theme-clock");
    var THEMES = [
      { cls: "", name: "Daybreak", clock: "09:41" },
      { cls: "is-night", name: "Night", clock: "21:47" },
      { cls: "is-glow", name: "Glow", clock: "23:12" }
    ];
    var themeIndex = 0;
    var applyMiniTheme = function () {
      var theme = THEMES[themeIndex];
      themeWindow.classList.remove("is-night", "is-glow");
      if (theme.cls) themeWindow.classList.add(theme.cls);
      if (themeName) themeName.textContent = theme.name;
      if (themeClock) themeClock.textContent = theme.clock;
      themeIndex = (themeIndex + 1) % THEMES.length;
    };
    applyMiniTheme();
    if (!reduce) window.setInterval(applyMiniTheme, 2800);
  }

  /* ---- Shield counter -------------------------------------------------- */
  var numEl = document.getElementById("shieldNum");
  if (numEl) {
    var target = parseInt(numEl.dataset.target, 10) || 0;
    var ran = false;
    var runCount = function () {
      if (ran) return;
      ran = true;
      if (reduce) {
        numEl.textContent = target.toLocaleString();
        return;
      }
      var startAt = performance.now();
      var dur = 1800;
      var step = function (now) {
        var t = Math.min(1, (now - startAt) / dur);
        var eased = 1 - Math.pow(1 - t, 3);
        numEl.textContent = Math.round(target * eased).toLocaleString();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if ("IntersectionObserver" in window) {
      var cObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            runCount();
            cObs.disconnect();
          }
        });
      }, { threshold: 0.4 });
      cObs.observe(numEl);
    } else {
      runCount();
    }
  }

  /* ---- Day / night compare slider -------------------------------------- */
  var compare = document.getElementById("compare");
  if (compare) {
    var win = compare.querySelector(".compare-window");
    var handle = document.getElementById("compareHandle");
    var dragging = false;

    var setPct = function (pct) {
      pct = Math.max(0, Math.min(100, pct));
      win.style.setProperty("--cw", pct + "%");
      if (handle) handle.setAttribute("aria-valuenow", Math.round(pct));
    };
    var fromEvent = function (clientX) {
      var r = win.getBoundingClientRect();
      setPct(((clientX - r.left) / r.width) * 100);
    };

    win.addEventListener("pointerdown", function (e) {
      dragging = true;
      win.setPointerCapture(e.pointerId);
      fromEvent(e.clientX);
    });
    win.addEventListener("pointermove", function (e) {
      if (dragging) fromEvent(e.clientX);
    });
    win.addEventListener("pointerup", function (e) {
      dragging = false;
      try { win.releasePointerCapture(e.pointerId); } catch (err) {}
    });

    if (handle) {
      handle.addEventListener("keydown", function (e) {
        var cur = parseFloat(handle.getAttribute("aria-valuenow")) || 50;
        if (e.key === "ArrowLeft") { setPct(cur - 4); e.preventDefault(); }
        else if (e.key === "ArrowRight") { setPct(cur + 4); e.preventDefault(); }
      });
    }
    setPct(50);
  }
})();
