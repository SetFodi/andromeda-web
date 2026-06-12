/* Andromeda landing — interactions. No dependencies. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Theme toggle (persisted, defaults to system) -------------------- */
  var THEME_KEY = "andromeda.site.theme";
  var root = document.documentElement;

  function applyTheme(mode) {
    root.dataset.theme = mode;
  }

  var storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_KEY);
  } catch (e) {
    /* private mode */
  }
  applyTheme(
    storedTheme === "dark" || storedTheme === "light"
      ? storedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
  );

  document.getElementById("themeBtn").addEventListener("click", function () {
    var next = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* ignore */
    }
  });

  /* ---- Live clock + greeting in the mockup ----------------------------- */
  var clockEl = document.getElementById("mockClock");
  var dateEl = document.getElementById("mockDate");
  var greetEl = document.getElementById("mockGreeting");

  function tick() {
    var now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    dateEl.textContent = now.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    var hour = now.getHours();
    greetEl.textContent =
      hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }

  tick();
  setInterval(tick, 30000);

  /* ---- Accent picker: swatches + space dock tiles ----------------------- */
  function setAccent(color, source) {
    root.style.setProperty("--maccent", color);

    document.querySelectorAll(".swatch").forEach(function (el) {
      el.classList.toggle("is-active", el.dataset.color === color);
    });
    // The dock only highlights when the chosen color matches one of its
    // spaces; otherwise the active space keeps its own tile color.
    var matched = false;
    document.querySelectorAll(".mock-space").forEach(function (el) {
      var match = el.dataset.color === color;
      el.classList.toggle("is-active", match);
      if (match) matched = true;
    });
    if (!matched && source !== "dock") {
      var first = document.querySelector(".mock-space");
      if (first) {
        first.classList.add("is-active");
        first.style.setProperty("--tile", color);
        first.dataset.color = color;
      }
    }
  }

  document.querySelectorAll(".swatch").forEach(function (el) {
    el.addEventListener("click", function () {
      setAccent(el.dataset.color, "swatch");
    });
  });

  document.querySelectorAll(".mock-space").forEach(function (el) {
    el.addEventListener("click", function () {
      setAccent(el.dataset.color, "dock");
    });
  });

  /* ---- Reveal on scroll -------------------------------------------------- */
  var revealEls = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) {
      el.classList.add("in");
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* ---- Shield counter ----------------------------------------------------
     Counts up when scrolled into view, then keeps ticking slowly — a small
     dramatization of the network blocking that never stops. */
  var numEl = document.getElementById("shieldNum");
  var started = false;

  function formatNum(value) {
    return Math.round(value).toLocaleString();
  }

  function startCounter() {
    if (started) return;
    started = true;

    var target = 1284;
    if (reduceMotion) {
      numEl.textContent = formatNum(target);
    } else {
      var startTime = null;
      var duration = 1400;
      function frame(ts) {
        if (startTime === null) startTime = ts;
        var t = Math.min(1, (ts - startTime) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        numEl.textContent = formatNum(target * eased);
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    setInterval(function () {
      target += 1 + Math.floor(Math.random() * 3);
      numEl.textContent = formatNum(target);
    }, 1700);
  }

  if ("IntersectionObserver" in window) {
    var counterObserver = new IntersectionObserver(
      function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          startCounter();
          counterObserver.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    counterObserver.observe(numEl);
  } else {
    startCounter();
  }
})();
