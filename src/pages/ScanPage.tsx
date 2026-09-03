import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { parseQRCode, LOCAL_DEMO_QR_ALLOWED } from '../services/qrValidation';
import { validateQrRemote } from '../services/qrValidationRemote';
import { resolveScannedTaleAppId } from '../services/scanSlugTranslation';
import { USE_REMOTE_QR_VALIDATION } from '../services/supabaseClient';
import { logEvent, flushEvents } from '../services/eventLogger';
import { BADGE_KEY_SCAN, Tale } from '../app/types';

// ================== SCAN — the archive gate ==================
// PUBLIC-v7.4B.P.28g.8 — presentation/structural refinement of the Scan
// page as the entry point of the family (Tales = archive, Tale Detail =
// opened dossier, Passport = travel document, Scan = the gate where a
// ticket is validated). Scan / unlock / camera lifecycle logic is
// preserved verbatim — only markup and classes changed.
//
// Hard constraints honored (unchanged from v6.4/P.13b):
//   • Html5Qrcode mounting target #qr-reader unchanged.
//   • parseQRCode + handleDemoUnlock contract (unlockTale + awardScanBadge
//     + navToTale) unchanged.
//   • Featured Tales rows route through the same handleDemoUnlock as a
//     real scan in demo mode, so badge keys and unlock paths are
//     identical; in remote mode they preview (navigate only).
//   • startScanner / stopScanner mount/unmount lifecycle preserved.
//
// PUBLIC-v7.4B.P.13b: server-authoritative QR validation.
//   • With USE_REMOTE_QR_VALIDATION on (the production posture), the
//     scanned code is sent to the validate-qr Edge Function and a Tale
//     unlocks ONLY when the server returns { valid: true } with the
//     canonical slug. A rejected code shows a generic message; an
//     unreachable validator fails closed with a "try again" message —
//     it NEVER falls back to permissive local parsing.
//   • The bounded curated demo path (parseQRCode against the three
//     baked-in ids) runs only when LOCAL_DEMO_QR_ALLOWED (dev build or
//     fully offline demo build; see qrValidation.ts). Ambiguous
//     production configuration fails closed.
//
// ADMIN-v6.8C: fire-and-forget event logging for the true scan/unlock +
// scan-badge path only (opts.logScanEvent, defaults false). Featured
// taps emit NO events. All logEvent calls run AFTER the local unlock
// dispatch and scan-badge award have committed; logging never blocks
// unlockTale, awardScanBadge, or navToTale.

declare const Html5Qrcode: unknown;

const QR_READER_ID = 'qr-reader';

// ---- The validation window (camera area, reticle, plates) ------------------
interface ScannerGateProps {
  scanning: boolean;
  scannerError: boolean;
}
function ScannerGate({ scanning, scannerError }: ScannerGateProps) {
  const status = scannerError
    ? 'CAMERA UNAVAILABLE'
    : scanning
      ? 'LIVE · CAMERA'
      : 'CAMERA READY';
  return (
    <div className="scan-gate">
      {/* top status plate */}
      <div className="scan-gate-plate">
        <span
          className={`scan-gate-plate-dot${scannerError ? ' scan-gate-plate-dot--err' : ''}${scanning && !scannerError ? ' scan-gate-plate-dot--live' : ''}`}
          aria-hidden="true"
        />
        {status}
      </div>

      {/* inspection window — Html5Qrcode injects video into #qr-reader */}
      <div className="scan-gate-port">
        <div id={QR_READER_ID} />

        {/* idle emblem — typographic can, no camera implied */}
        {!scanning && (
          <div className="scan-gate-emblem" aria-hidden="true">
            <div className="scan-gate-emblem-can">
              <span className="scan-gate-emblem-mark">TRACKSIDE<br />TALES</span>
            </div>
            <span className="scan-gate-emblem-tag">THE CAN IS THE TICKET</span>
          </div>
        )}

        {/* reticle — ticket-punch corner brackets */}
        <div className="scan-reticle" aria-hidden="true">
          <span className="scan-reticle-corner scan-reticle-corner--tl" />
          <span className="scan-reticle-corner scan-reticle-corner--tr" />
          <span className="scan-reticle-corner scan-reticle-corner--bl" />
          <span className="scan-reticle-corner scan-reticle-corner--br" />
        </div>

        {/* sweep line */}
        <div className={`scan-sweep${scanning ? ' scan-sweep--live' : ''}`} aria-hidden="true" />
      </div>

      {/* bottom plate */}
      <div className="scan-gate-foot">
        <span className="scan-gate-foot-glyph" aria-hidden="true" />
        SCAN TO UNLOCK
      </div>
    </div>
  );
}

// ---- Featured Tale row -----------------------------------------------------
interface FeaturedTaleRowProps {
  tale: Tale;
  index: number;
  unlocked: boolean;
  onSelect: (taleId: string) => void;
}
function FeaturedTaleRow({ tale, index, unlocked, onSelect }: FeaturedTaleRowProps) {
  // P.13b: rows unlock only in demo mode; in remote mode they preview.
  const actionWord = LOCAL_DEMO_QR_ALLOWED ? 'Unlock' : 'Preview';
  return (
    <button
      type="button"
      className={`scan-row${unlocked ? ' scan-row--unlocked' : ''}`}
      onClick={() => onSelect(tale.id)}
      aria-label={
        tale.person.name
          ? `${actionWord} ${tale.name} — ${tale.person.name}`
          : `${actionWord} ${tale.name}`
      }
    >
      <span className="scan-row-num" aria-hidden="true">{index + 1}</span>
      <span className="scan-row-name">
        <strong>{tale.name}</strong>
        <span className="scan-row-sub"> — {tale.person.name}</span>
      </span>
      {unlocked && <span className="scan-row-state" aria-hidden="true">UNLOCKED</span>}
      <span className="scan-row-arrow" aria-hidden="true">→</span>
    </button>
  );
}

// ================== SCAN PAGE ROOT ==================
export function ScanPage() {
  const { state, tales, guestId, unlockTale, awardScanBadge, navToTale, nav } = useApp();
  const [scanning, setScanning]     = useState(false);
  const [scannerError, setScanErr]  = useState(false);
  const [scanTitle, setScanTitle]   = useState('POINT AT A TRACKSIDE CAN');
  const [scanSub, setScanSub]       = useState(
    "Center the QR code on the can in the frame — we'll unlock its Tale and stamp your Passport.",
  );
  const scannerRef = useRef<unknown>(null);

  // ADMIN-v6.8C — analytics is opt-IN per call. The default branch
  // (Featured Tale row taps, future non-scan callers) emits NO events.
  // Only the real-scan path in processCode opts in via
  // { logScanEvent: true }. Visible behavior is unchanged in both
  // branches: unlock dispatch + (conditional) scan-badge award +
  // navigation happen exactly as before, in the same order, on the
  // same tick. Logging always runs AFTER navigation so a slow
  // logEvent / receipt read can never delay the unlock paint.
  interface UnlockOpts { logScanEvent?: boolean }
  const handleDemoUnlock = useCallback((
    taleId: string,
    opts: UnlockOpts = {},
  ) => {
    const tale = tales.find((t) => t.id === taleId);
    if (!tale) return;
    const wasUnlocked = state.unlocked.has(taleId);
    unlockTale(taleId);
    if (!wasUnlocked) awardScanBadge(taleId);
    navToTale(tale);

    // ---- v6.8C analytics: opt-in, fire-and-forget. ----
    // Featured taps fall through this block entirely. logEvent is a
    // no-op when USE_REMOTE_EVENTS is off, so even on the scan path
    // these calls are completely inert in default builds.
    if (!opts.logScanEvent) return;

    logEvent({
      type:     'tale_unlocked',
      taleSlug: taleId,
      source:   'scan',
    });

    // Award badge_awarded only when the scan badge actually granted
    // for the first time on this device. Mirrors the awardScanBadge
    // gate above so we don't double-count on re-scans of an already
    // unlocked tale.
    if (!wasUnlocked) {
      logEvent({
        type:     'badge_awarded',
        taleSlug: taleId,
        badgeKey: BADGE_KEY_SCAN(taleId),
        via:      'scan',
      });
    }

    // Nudge the queue toward the network. flushEvents is a no-op when
    // the flag is off / no guestId / nothing queued, and never throws.
    void flushEvents(guestId);
  }, [tales, state.unlocked, unlockTale, awardScanBadge, navToTale, guestId]);

  // P.13b — remote-mode Featured-Tales tap: navigate WITHOUT unlocking.
  // The Tale detail page renders its locked branch for tales the user
  // hasn't actually scanned.
  const previewTale = useCallback((taleId: string) => {
    const tale = tales.find((t) => t.id === taleId);
    if (tale) navToTale(tale);
  }, [tales, navToTale]);

  // P.13b — scan processing. Remote-authoritative in production;
  // bounded curated demo path in dev/offline builds; fail-closed when
  // configuration is ambiguous. The camera decoder fires repeatedly
  // (~10 fps) on the same code, so a per-code in-flight guard prevents
  // hammering the Edge Function with duplicate requests.
  const inFlightCodeRef = useRef<string | null>(null);

  const processCode = useCallback(async (raw: string) => {
    if (USE_REMOTE_QR_VALIDATION) {
      const trimmed = raw.trim();
      if (inFlightCodeRef.current === trimmed) return;
      inFlightCodeRef.current = trimmed;
      try {
        setScanTitle('CHECKING CODE…');
        setScanSub('Validating this Trackside code.');
        const result = await validateQrRemote(trimmed);
        if (result.status === 'valid') {
          // P.15a: the validator returns the canonical PRODUCTION
          // slug; curated Tales use renamed app ids. Translate once
          // and use the app id for lookup, unlock persistence, and
          // navigation; generic slugs pass through unchanged.
          const appTaleId = resolveScannedTaleAppId(result.taleSlug);
          const tale = tales.find((t) => t.id === appTaleId);
          if (!tale) {
            // Server-valid, but the Tale isn't in the loaded content.
            // Fail closed rather than persist an unlock for an id the
            // app can't render.
            setScanTitle('TALE NOT AVAILABLE');
            setScanSub('This code is valid, but its Tale could not be loaded right now. Please try again.');
            return;
          }
          handleDemoUnlock(appTaleId, { logScanEvent: true });
          return;
        }
        if (result.status === 'invalid') {
          setScanTitle('QR NOT RECOGNIZED');
          setScanSub("That code isn't an active Trackside Tale code. Try a Trackside can.");
          return;
        }
        // 'unavailable' — validator unreachable/misconfigured. Fail
        // closed: no unlock, and explicitly NO fallback to local
        // parsing (a network failure must never weaken validation).
        setScanTitle('VALIDATION UNAVAILABLE');
        setScanSub("Couldn't reach the validation service. Check your connection and try again.");
        return;
      } finally {
        inFlightCodeRef.current = null;
      }
    }

    if (LOCAL_DEMO_QR_ALLOWED) {
      // Bounded local/demo path: the three curated ids only.
      const result = parseQRCode(raw);
      if (!result) {
        setScanTitle('QR NOT RECOGNIZED');
        setScanSub("That code isn't a Trackside Tale. Try a Trackside can or choose a Featured Tale below.");
        return;
      }
      handleDemoUnlock(result.taleId, { logScanEvent: true });
      return;
    }

    // Ambiguous configuration (Supabase configured, remote validation
    // flag unset in a production build): fail closed, do not guess.
    setScanTitle('SCANNING UNAVAILABLE');
    setScanSub('QR validation is not configured for this build. Please try again later.');
  }, [tales, handleDemoUnlock]);

  const startScanner = useCallback(async () => {
    if (typeof Html5Qrcode === 'undefined') {
      setScanErr(true);
      return;
    }
    try {
      const scanner = new (Html5Qrcode as new (id: string) => {
        start: (constraints: unknown, config: unknown, cb: (v: string) => void) => Promise<void>;
        stop: () => Promise<void>;
      })(QR_READER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded: string) => processCode(decoded),
      );
      setScanning(true);
    } catch (e) {
      setScanErr(true);
      console.warn('[trackside] Scanner start failed:', e);
    }
  }, [processCode]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await (scannerRef.current as { stop: () => Promise<void> }).stop();
      } catch (_) { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  // Auto-start once on mount; auto-stop on unmount. Lifecycle preserved
  // verbatim from v5.x — see prior comment.
  const startedRef = useRef(false);
  useEffect(() => {
    if (state.page !== 'scan') {
      stopScanner();
      return;
    }
    if (!startedRef.current) {
      startedRef.current = true;
      startScanner();
    }
    return () => { stopScanner(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.page]);

  return (
    <div className="page active px-screen scan-page" id="page-scan">

      {/* ── Head — the archive gate ── */}
      <header className="scan-head">
        <span className="scan-eyebrow">Trackside Tales · Archive Gate</span>
        <h1 className="scan-heading">SCAN A<br />TRACKSIDE TALE</h1>
        <hr className="scan-rule" aria-hidden="true" />
      </header>

      <div className="scan-wrap">

        {/* ── The validation window ── */}
        <ScannerGate scanning={scanning} scannerError={scannerError} />

        {/* ── Live readout — same state-driven messages as before ── */}
        <div className="scan-readout" role="status">
          <h2 className="scan-readout-title">{scanTitle}</h2>
          <p className="scan-readout-sub">{scanSub}</p>
        </div>

        {/* ── The loop, presentation-only ── */}
        <div className="scan-flow" aria-hidden="true">
          SCAN <span>→</span> STORY <span>→</span> CHALLENGE <span>→</span> PASSPORT
        </div>

        {/* ── Camera error (conditional) ── */}
        {scannerError && (
          <div className="scan-error" role="alert">
            <div className="scan-error-title">CAMERA UNAVAILABLE</div>
            <div className="scan-error-copy">
              Camera access is unavailable. Choose a Featured Tale above to continue,
              or grant camera access and retry.
            </div>
            <button
              type="button"
              className="scan-error-retry"
              onClick={() => { setScanErr(false); startScanner(); }}
            >
              TRY CAMERA AGAIN
            </button>
          </div>
        )}

        {/* ── Featured Tales ── */}
        {/* P.13b: tap-to-UNLOCK is a demo affordance and exists only in
           the bounded demo mode (LOCAL_DEMO_QR_ALLOWED). In production
           (remote-authoritative) mode, tapping a row navigates to the
           Tale instead — its locked page renders unless a real scan has
           unlocked it. A list tap is not proof of a scan. */}
        <section
          className="scan-featured"
          aria-label={LOCAL_DEMO_QR_ALLOWED
            ? 'Featured Tales — tap to unlock'
            : 'Featured Tales — tap to preview'}
        >
          <div className="scan-featured-head">
            <span className="scan-heading-label">
              {LOCAL_DEMO_QR_ALLOWED
                ? 'Featured Tales · Tap to Unlock'
                : 'Featured Tales · Tap to Preview'}
            </span>
            <span className="scan-featured-note" aria-hidden="true">
              CAN'T SCAN RIGHT NOW?
            </span>
          </div>
          <div className="scan-featured-rows">
            {tales.map((tale, idx) => (
              <FeaturedTaleRow
                key={tale.id}
                tale={tale}
                index={idx}
                unlocked={state.unlocked.has(tale.id)}
                onSelect={LOCAL_DEMO_QR_ALLOWED ? handleDemoUnlock : previewTale}
              />
            ))}
          </div>
        </section>

        {/* ── Quiet index back into the collection ── */}
        <section className="scan-next">
          <button type="button" className="scan-next-link" onClick={() => nav('tales')}>
            <span className="scan-next-glyph" aria-hidden="true" />
            <span className="scan-next-title">THE TALE ARCHIVE</span>
            <span className="scan-next-desc">Every Tale, collected and sealed.</span>
            <span className="scan-next-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="scan-next-link" onClick={() => nav('passport')}>
            <span className="scan-next-glyph" aria-hidden="true" />
            <span className="scan-next-title">VIEW PASSPORT</span>
            <span className="scan-next-desc">Your stamps so far.</span>
            <span className="scan-next-arrow" aria-hidden="true">→</span>
          </button>
        </section>

        <div className="scan-foot-space" />
      </div>
    </div>
  );
}
