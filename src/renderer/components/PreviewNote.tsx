import Icon from "./Icon";

// A small, honest label shown in the onboarding intro and in Settings: Andromeda
// is an aesthetic-first everyday browser, with some power-user features still to
// come. Intentionally low-key — it sets expectations without nagging.
function PreviewNote() {
  return (
    <div className="preview-note">
      <span className="preview-note-mark">
        <Icon name="sparkle" size={13} />
      </span>
      <span className="preview-note-copy">
        Aesthetic-first, built for the everyday basics — a few core features are still on the way.
      </span>
    </div>
  );
}

export default PreviewNote;
