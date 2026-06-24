/* ====================================================================== */
/*  Andromeda — Daybreak. Smooth interactions, no dependencies.           */
/* ====================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;

  /* ---- Theme -------------------------------------------------------- */
  var THEME_KEY = "andromeda.site.theme";
  var toggle = document.getElementById("themeToggle");

  function setTheme(mode) {
    root.dataset.theme = mode;
    if (toggle) toggle.setAttribute("aria-pressed", String(mode === "dark"));
  }

  var stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
  setTheme(
    stored === "dark" || stored === "light"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    });
  }

  /* ---- Nav stuck state ---------------------------------------------- */
  var nav = document.getElementById("nav");
  function onNavScroll() {
    if (nav) nav.classList.toggle("is-stuck", window.scrollY > 16);
  }
  onNavScroll();
  window.addEventListener("scroll", onNavScroll, { passive: true });

  /* ---- Reveal on scroll --------------------------------------------- */
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
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) { revObserver.observe(el); });
  }

  /* ---- Hero: cursor spotlight + window tilt + scroll parallax -------- */
  var hero = document.querySelector(".hero");
  var spot = document.querySelector(".hero-spot");
  var heroStage = document.querySelector(".hero-stage");
  var heroWindow = heroStage ? heroStage.querySelector(".window") : null;

  if (hero && fine && !reduce) {
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      if (spot) {
        spot.style.setProperty("--mx", (e.clientX - r.left) + "px");
        spot.style.setProperty("--my", (e.clientY - r.top) + "px");
      }
    });
  }

  if (heroWindow && heroStage && fine && !reduce) {
    heroStage.addEventListener("pointermove", function (e) {
      var r = heroStage.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;   // -0.5..0.5
      var py = (e.clientY - r.top) / r.height - 0.5;
      heroWindow.style.setProperty("--ry", (px * 7).toFixed(2) + "deg");
      heroWindow.style.setProperty("--rx", (-py * 5).toFixed(2) + "deg");
    });
    heroStage.addEventListener("pointerleave", function () {
      heroWindow.style.setProperty("--ry", "0deg");
      heroWindow.style.setProperty("--rx", "0deg");
    });
  }

  /* ---- rAF scroll loop (parallax) ----------------------------------- */
  var ticking = false;
  function onFrame() {
    ticking = false;
    var y = window.scrollY;
    if (heroWindow && !reduce) {
      var sty = Math.max(-60, Math.min(60, y * 0.06));
      heroWindow.style.setProperty("--sty", sty.toFixed(1) + "px");
    }
  }
  function requestFrame() {
    if (!ticking) { ticking = true; requestAnimationFrame(onFrame); }
  }
  if (!reduce) {
    window.addEventListener("scroll", requestFrame, { passive: true });
    onFrame();
  }

  /* ---- Sticky showcase: active step --------------------------------- */
  var feats = Array.prototype.slice.call(document.querySelectorAll(".feat"));
  var shots = document.querySelectorAll(".sc-shot");
  var dots = document.querySelectorAll(".sc-dot");

  function setStep(i) {
    shots.forEach(function (s) { s.classList.toggle("is-active", +s.dataset.shot === i); });
    dots.forEach(function (d) { d.classList.toggle("is-active", +d.dataset.go === i); });
  }

  if (feats.length && "IntersectionObserver" in window) {
    var stepObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setStep(+entry.target.dataset.step);
      });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    feats.forEach(function (f) { stepObserver.observe(f); });
  }

  dots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      var i = +dot.dataset.go;
      var target = feats[i];
      if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    });
  });

  /* ---- Shield counter ----------------------------------------------- */
  var numEl = document.getElementById("shieldNum");
  if (numEl) {
    var target = parseInt(numEl.dataset.target, 10) || 0;
    var ran = false;
    function runCount() {
      if (ran) return; ran = true;
      if (reduce) { numEl.textContent = target.toLocaleString(); return; }
      var start = performance.now();
      var dur = 2000;
      function step(now) {
        var t = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - t, 3);
        numEl.textContent = Math.round(target * eased).toLocaleString();
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    if ("IntersectionObserver" in window) {
      var cObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { runCount(); cObs.disconnect(); } });
      }, { threshold: 0.5 });
      cObs.observe(numEl);
    } else { runCount(); }
  }

  /* ---- Day / night compare slider ----------------------------------- */
  var compare = document.getElementById("compare");
  if (compare) {
    var win = compare.querySelector(".compare-window");
    var handle = document.getElementById("compareHandle");
    var dragging = false;

    function setPct(pct) {
      pct = Math.max(0, Math.min(100, pct));
      win.style.setProperty("--cw", pct + "%");
      if (handle) handle.setAttribute("aria-valuenow", Math.round(pct));
    }
    function fromEvent(clientX) {
      var r = win.getBoundingClientRect();
      setPct(((clientX - r.left) / r.width) * 100);
    }

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
