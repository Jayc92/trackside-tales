import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { parseQRCode, LOCAL_DEMO_QR_ALLOWED } from '../services/qrValidation';
import { validateQrRemote } from '../services/qrValidationRemote';
import { resolveScannedTaleAppId } from '../services/scanSlugTranslation';
import { USE_REMOTE_QR_VALIDATION } from '../services/supabaseClient';
import { logEvent, flushEvents } from '../services/eventLogger';
import { BADGE_KEY_SCAN, Tale } from '../app/types';

// ================== SCAN PAGE (v6.4 — Structured Design Pass) ==================
// Visual rewrite to match the v6.0 reference. Scan / unlock / camera lifecycle
// logic is preserved verbatim — only markup + classes were brought in line
// with the design system.
//
// Hard constraints honored:
//   • Html5Qrcode mounting target #qr-reader unchanged.
//   • parseQRCode + handleDemoUnlock contract (unlockTale + awardScanBadge +
//     navToTale) unchanged.
//   • Featured Tales rows route through the same handleDemoUnlock as a real
//     scan, so badge keys and unlock paths are identical.
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
//   • The Featured-Tales rows are tap-to-unlock only in the demo mode;
//     in remote mode they navigate to the Tale (locked view) instead —
//     tapping a list row is not proof of a scan.
//   • The v6.6/v6.7 HMAC receipt capture is gone: the hardened
//     validate-qr returns only { valid, taleSlug } and the log-events
//     receipt pipeline was never deployed.
//
// ADMIN-v6.8C: fire-and-forget event logging for the true scan/unlock +
// scan-badge path only. Game events stay deferred to v6.8D; passport /
// story pageviews remain out of scope per the v6.8 plan.
//   • Logging is OPT-IN per call. handleDemoUnlock takes an optional
//     opts.logScanEvent flag that defaults false. Only the real-scan
//     path in processCode passes { logScanEvent: true }. Featured Tale
//     row taps unlock exactly as before but emit NO events — Featured
//     taps are not scans and must not pollute future direct/deep-link
//     analytics buckets.
//   • All logEvent calls run AFTER the local unlock dispatch and the
//     scan-badge award have already committed. Logging never blocks
//     unlockTale, awardScanBadge, or navToTale.
//   • With USE_REMOTE_EVENTS off, every logEvent call is a no-op and
//     the call sites are inert. Same posture as the v6.7 receipt hook.
//   • Receipt attachment is best-effort: validateQrRemote's promise
//     races the unlock dispatch, so the receipt is usually absent at
//     logEvent time on the first scan. The 250ms debounce inside
//     eventLogger gives it a chance to land; when it doesn't, the
//     server still accepts the row with qr_code_id=NULL.
//   • We do NOT clear the receipt store after flush — eventLogger's
//     fire-and-forget API doesn't surface per-event success, and the
//     store is already single-slot with a 5-minute TTL. Deferred to
//     ADMIN-v6.8E if it turns out to matter in practice.

declare const Html5Qrcode: unknown;

const QR_READER_ID = 'qr-reader';

// ---- Scanner frame (camera area, reticle, plaques) -------------------------
interface ScannerFrameProps {
  scanning: boolean;
  scannerError: boolean;
}
function ScannerFrame({ scanning, scannerError }: ScannerFrameProps) {
  const status = scannerError
    ? 'CAMERA UNAVAILABLE'
    : scanning
      ? 'LIVE · CAMERA'
      : 'CAMERA READY';
  const dotMod = scannerError ? ' ts-scan-plaque__dot--err' : '';
  return (
    <div className="ts-scan-frame">
      {/* Outer brass corner ornaments */}
      <span className="ts-scan-frame__ornament ts-scan-frame__ornament--tl" aria-hidden="true" />
      <span className="ts-scan-frame__ornament ts-scan-frame__ornament--tr" aria-hidden="true" />
      <span className="ts-scan-frame__ornament ts-scan-frame__ornament--bl" aria-hidden="true" />
      <span className="ts-scan-frame__ornament ts-scan-frame__ornament--br" aria-hidden="true" />

      {/* Top floating plaque — CAMERA READY */}
      <div className="ts-scan-plaque ts-scan-plaque--top">
        <span className={`ts-scan-plaque__dot${dotMod}`} aria-hidden="true" />
        {status}
      </div>

      {/* Camera viewport — Html5Qrcode injects video into #qr-reader */}
      <div className="ts-scan-frame__viewport">
        <div id={QR_READER_ID} />

        {/* Idle placeholder: stylized can on warm taproom-glow background */}
        {!scanning && (
          <div className="ts-scan-can" aria-hidden="true">
            <div className="ts-scan-can__shape">
              <div className="ts-scan-can__mark">
                TRACKSIDE<br />TALES
              </div>
            </div>
            <div className="ts-scan-can__name">EST. 2026</div>
          </div>
        )}

        {/* Reticle corner brackets */}
        <div className="ts-scan-reticle" aria-hidden="true">
          <span className="ts-scan-reticle__corner ts-scan-reticle__corner--tl" />
          <span className="ts-scan-reticle__corner ts-scan-reticle__corner--tr" />
          <span className="ts-scan-reticle__corner ts-scan-reticle__corner--bl" />
          <span className="ts-scan-reticle__corner ts-scan-reticle__corner--br" />
        </div>

        {/* Animated sweep line */}
        <div className="ts-scan-sweep" aria-hidden="true" />
      </div>

      {/* Bottom floating plaque — SCAN TO UNLOCK */}
      <div className="ts-scan-plaque ts-scan-plaque--bot">
        ⊕ SCAN TO UNLOCK
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
      className={`ts-scan-row${unlocked ? ' ts-scan-row--unlocked' : ''}`}
      onClick={() => onSelect(tale.id)}
      aria-label={
        tale.person.name
          ? `${actionWord} ${tale.name} — ${tale.person.name}`
          : `${actionWord} ${tale.name}`
      }
    >
      <span className="ts-scan-row__num" aria-hidden="true">{index + 1}</span>
      <span className="ts-scan-row__title">
        <strong>{tale.name}</strong>{' '}
        <span className="ts-scan-row__title-sub">— {tale.person.name}</span>
      </span>
      <span className="ts-scan-row__arrow" aria-hidden="true">→</span>
    </button>
  );
}

// ---- Can't-scan-right-now fallback panel -----------------------------------
function ScanFallbackPanel() {
  return (
    <aside className="ts-scan-fallback" aria-label="Manual preview">
      <div className="ts-scan-fallback__seal" aria-hidden="true">
        <span className="ts-scan-fallback__seal-glyph">◈</span>
        TRACKSIDE<br />PREVIEW<br />ANYTIME
      </div>
      <div className="ts-scan-fallback__body">
        <div className="ts-scan-fallback__title">CAN'T SCAN RIGHT NOW?</div>
        <div className="ts-scan-fallback__copy">Select a Tale to preview.</div>
      </div>
      <span className="ts-scan-fallback__watermark" aria-hidden="true">◈</span>
    </aside>
  );
}

// ================== SCAN PAGE ROOT ==================
export function ScanPage() {
  const { state, tales, guestId, unlockTale, awardScanBadge, navToTale } = useApp();
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
  // { logScanEvent: true }. This keeps the v6.8C analytics surface
  // strictly limited to true scan/unlock + scan-badge — Featured taps
  // are not scans and must not pollute future direct/deep-link
  // analytics buckets.
  //
  // Visible behavior is unchanged in both branches: unlock dispatch +
  // (conditional) scan-badge award + navigation happen exactly as
  // before, in the same order, on the same tick. Logging always runs
  // AFTER navigation so a slow logEvent / receipt read can never delay
  // the unlock paint.
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
    // Featured taps fall through this block entirely — no logEvent,
    // no flushEvents, no receipt read. logEvent is itself a no-op when
    // USE_REMOTE_EVENTS is off, so even on the scan path these calls
    // are completely inert in default builds.
    if (!opts.logScanEvent) return;

    // P.13b: no receipt attachment — the hardened validate-qr contract
    // carries no receipt, and the log-events pipeline that consumed
    // one was never deployed. logEvent remains a no-op unless
    // USE_REMOTE_EVENTS is enabled.
    logEvent({
      type:     'tale_unlocked',
      taleSlug: taleId,
      source:   'scan',
    });

    // Award badge_awarded only when the scan badge actually granted
    // for the first time on this device. Mirrors the awardScanBadge
    // gate above so we don't double-count on re-scans of an already
    // unlocked tale. badgeKey uses the same BADGE_KEY_SCAN(id) shape
    // the rest of the app holds in localStorage / state.
    if (!wasUnlocked) {
      logEvent({
        type:     'badge_awarded',
        taleSlug: taleId,
        badgeKey: BADGE_KEY_SCAN(taleId),
        via:      'scan',
      });
    }

    // Nudge the queue toward the network. flushEvents itself is a
    // no-op when the flag is off / no guestId / nothing queued, and
    // it never throws. The await-less invocation keeps unlock paint
    // priority intact.
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
          // slug; curated Tales use renamed app ids (packer-pilsner →
          // packer-pils, wooden-match-amber → wooden-match). Translate
          // once and use the app id for lookup, unlock persistence,
          // and navigation; generic slugs pass through unchanged.
          const appTaleId = resolveScannedTaleAppId(result.taleSlug);
          const tale = tales.find((t) => t.id === appTaleId);
          if (!tale) {
            // Server-valid, but the Tale isn't in the loaded content
            // (e.g. remote Tales fetch failed this session). Fail
            // closed rather than persist an unlock for an id the app
            // can't render.
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
    <div className="page active px-screen ts-scan-screen" id="page-scan">

      {/* ============== 1. SCANNER FRAME ============== */}
      <ScannerFrame scanning={scanning} scannerError={scannerError} />

      {/* ============== 2. INSTRUCTION BLOCK ============== */}
      <div className="ts-scan-instructions">
        <h2 className="ts-scan-instructions__title">
          {scanTitle}
        </h2>
        <p className="ts-scan-instructions__copy">
          <span className="ts-scan-instructions__star" aria-hidden="true">✦</span>
          {scanSub}
          <span className="ts-scan-instructions__star" aria-hidden="true">✦</span>
        </p>
      </div>

      {/* ============== 3. FEATURED TALES ============== */}
      {/* P.13b: tap-to-UNLOCK is a demo affordance and exists only in
         the bounded demo mode (LOCAL_DEMO_QR_ALLOWED). In production
         (remote-authoritative) mode, tapping a row navigates to the
         Tale instead — its locked page renders unless a real scan has
         unlocked it. A list tap is not proof of a scan. */}
      <div
        className="ts-scan-featured"
        aria-label={LOCAL_DEMO_QR_ALLOWED
          ? 'Featured Tales — tap to unlock'
          : 'Featured Tales — tap to preview'}
      >
        <div className="ts-scan-featured__header">
          <span className="ts-scan-featured__rule" aria-hidden="true" />
          <span className="ts-scan-featured__label">
            {LOCAL_DEMO_QR_ALLOWED
              ? 'FEATURED TALES · TAP TO UNLOCK'
              : 'FEATURED TALES · TAP TO PREVIEW'}
          </span>
          <span className="ts-scan-featured__rule" aria-hidden="true" />
        </div>
        <div className="ts-scan-featured__rows">
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
      </div>

      {/* ============== 4. CAN'T SCAN PANEL ============== */}
      <ScanFallbackPanel />

      {/* ============== 5. CAMERA ERROR (conditional) ============== */}
      {scannerError && (
        <div className="ts-scan-error" role="alert">
          <div className="ts-scan-error__title">CAMERA UNAVAILABLE</div>
          <div className="ts-scan-error__copy">
            Camera access is unavailable. Choose a Featured Tale above to continue,
            or grant camera access and retry.
          </div>
          <button
            type="button"
            className="ts-scan-error__retry"
            onClick={() => { setScanErr(false); startScanner(); }}
          >
            TRY CAMERA AGAIN
          </button>
        </div>
      )}

    </div>
  );
}
