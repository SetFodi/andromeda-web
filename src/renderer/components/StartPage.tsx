import { memo } from "react";

type StartPageProps = {
  onStartBrowsing: () => void;
  onImportChrome: () => void;
};

function StartPage({ onStartBrowsing, onImportChrome }: StartPageProps) {
  return (
    <main className="start-page">
      <section className="hero-content" aria-label="Andromeda start page">
        <div className="quiet-pill">
          <span />
          Quiet browsing. Clear mind.
        </div>

        <h1>
          Browse with
          <br />
          focus. Live in <em>flow.</em>
        </h1>

        <p className="hero-copy">
          Andromeda is a calmer, cleaner browser
          <br />
          for how you think and work today.
        </p>

        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={onStartBrowsing}>
            Start browsing <span>→</span>
          </button>
          <button className="secondary-button" type="button" onClick={onImportChrome}>
            Import from Chrome
          </button>
        </div>

        <blockquote className="hero-quote">
          <span>“</span>
          <p>
            The best browser is the one
            <br />
            that gets out of your way.
          </p>
        </blockquote>
      </section>

      <AndromedaIllustration />
    </main>
  );
}

function AndromedaIllustration() {
  return (
    <div className="andromeda-illustration" aria-hidden="true">
      <svg viewBox="0 0 900 640" preserveAspectRatio="none">
        <defs>
          <radialGradient id="sunGlow" cx="42%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#ffd9cc" />
            <stop offset="54%" stopColor="#ff9a82" />
            <stop offset="100%" stopColor="#ff8069" stopOpacity="0.9" />
          </radialGradient>
          <linearGradient id="creamWave" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fffaf4" />
            <stop offset="100%" stopColor="#f1e7db" />
          </linearGradient>
          <linearGradient id="navyWave" x1="0%" y1="30%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#21394b" />
            <stop offset="100%" stopColor="#102333" />
          </linearGradient>
          <linearGradient id="coralWave" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffe9e1" />
            <stop offset="100%" stopColor="#ffb9a8" />
          </linearGradient>
        </defs>

        <circle className="sun-orb" cx="634" cy="220" r="116" fill="url(#sunGlow)" />

        <path
          className="bird bird-one"
          d="M541 108 C548 103 554 103 561 108 M561 108 C568 103 574 103 581 108"
        />
        <path
          className="bird bird-two"
          d="M664 72 C670 68 676 68 682 72 M682 72 C688 68 694 68 700 72"
        />
        <path
          className="bird bird-three"
          d="M432 154 C438 150 444 150 450 154 M450 154 C456 150 462 150 468 154"
        />

        <path
          className="wave cream-wave"
          d="M172 640 C285 501 399 454 529 420 C676 382 777 306 900 225 L900 640 Z"
          fill="url(#creamWave)"
        />
        <path
          className="wave navy-wave"
          d="M185 640 C315 530 426 505 553 488 C690 470 792 414 900 360 L900 640 Z"
          fill="url(#navyWave)"
        />
        <path
          className="wave coral-wave"
          d="M414 640 C507 562 609 531 735 512 C806 501 853 489 900 468 L900 640 Z"
          fill="url(#coralWave)"
        />
        <path
          className="wave-outline"
          d="M172 640 C285 501 399 454 529 420 C676 382 777 306 900 225"
        />
      </svg>
    </div>
  );
}

export default memo(StartPage);
