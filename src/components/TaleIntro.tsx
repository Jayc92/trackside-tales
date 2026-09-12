import React, { useState } from 'react';

// ================== TALE INTRO — the archive's opening flourish ==================
// PUBLIC-v7.4B.INTRO.1B. Presentation-only rendering of admin-authored
// Tale intro media (tales.intro_type / tales.intro_asset_url), already
// modeled on Tale but unrendered before this gate (see INTRO.1A).
//
// Contract (INTRO.1A §55):
//   * none            → this component is not mounted at all (caller's job).
//   * css_animation    → the intro asset (or the Tale's existing artwork
//                        when none was uploaded) as a bounded hero image
//                        with a brief CSS entrance. No controls, no skip,
//                        no replay — it behaves like an ordinary hero,
//                        not a video.
//   * video            → never autoplays. Shown as a "WATCH INTRO"
//                        affordance; only after that click does the
//                        <video> element mount (so no bytes are ever
//                        requested for a Tale the visitor hasn't chosen
//                        to watch), then the native controls take over.
//   * Every failure path (missing asset, 404, decode error) fails open —
//     this component renders null and Tale Detail is otherwise unaffected.
//   * No storage, no AppContext, no dispatch, no navigation, no
//     analytics — purely local component state for playback/error UI.
export interface TaleIntroProps {
  introType?: 'css_animation' | 'video' | 'none';
  introAssetUrl?: string;
  /** Tale.image — the same existing artwork already used elsewhere on
   *  this page (RecordHeader's "THE CAN", the Dossier portrait). Used
   *  as the css_animation fallback when no dedicated intro asset exists. */
  fallbackImageUrl?: string;
  /** Tale.title, already newline-sanitized by the caller the same way
   *  the rest of this page sanitizes it for aria-label/alt use. */
  taleTitle: string;
}

export function TaleIntro({
  introType,
  introAssetUrl,
  fallbackImageUrl,
  taleTitle,
}: TaleIntroProps) {
  const [introAssetFailed, setIntroAssetFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [videoActivated, setVideoActivated] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  if (introType === 'video') {
    if (!introAssetUrl || videoFailed) return null;
    return (
      <section className="tale-intro" aria-label="Tale intro">
        {videoActivated ? (
          <video
            className="tale-intro-video"
            src={introAssetUrl}
            controls
            playsInline
            preload="none"
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <button
            type="button"
            className="tale-intro-watch"
            onClick={() => setVideoActivated(true)}
          >
            <span aria-hidden="true">▶</span> WATCH INTRO
          </button>
        )}
      </section>
    );
  }

  if (introType === 'css_animation') {
    // Precedence: intro asset first, the Tale's own existing artwork
    // once (never a loop), nothing if both are absent/failed.
    const useIntroAsset = !!introAssetUrl && !introAssetFailed;
    const useFallback = !useIntroAsset && !!fallbackImageUrl && !fallbackFailed;
    if (!useIntroAsset && !useFallback) return null;
    const src = useIntroAsset ? introAssetUrl! : fallbackImageUrl!;
    return (
      <section className="tale-intro" aria-label="Tale intro">
        <img
          // Remounting per distinct src is deliberate: it re-runs the
          // CSS entrance for a genuinely new image (including the one
          // fallback swap), the same way any hero image would.
          key={src}
          className="tale-intro-image"
          src={src}
          alt={`${taleTitle} introduction artwork`}
          onError={() => {
            if (useIntroAsset) setIntroAssetFailed(true);
            else setFallbackFailed(true);
          }}
        />
      </section>
    );
  }

  return null;
}
