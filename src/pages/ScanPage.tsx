import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { parseQRCode } from '../services/qrValidation';
import { validateQrRemote } from '../services/qrValidationRemote';
import { setLatestQrReceipt } from '../services/qrReceiptStore';
import { Tale } from '../app/types';

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
// ADMIN-v6.7: enrichment-only remote QR validation hook.
//   • parseQRCode is still the source of truth for the unlock decision —
//     locally-valid scans always unlock, regardless of remote state.
//   • After the local unlock dispatches, we fire (no await) a call to
//     validateQrRemote. On success, the signed receipt lands in the
//     in-memory qrReceiptStore for ADMIN-v6.8's log-events to consume.
//   • Remote failure / null is silent. No UI change, no unlock rollback,
//     no localStorage/badge-key mutation.
//   • The Featured-Tales button rows do NOT trigger remote validation —
//     they have no scanned `code` value (their canonical code would have
//     to be reconstructed, which would muddy demo behavior). They keep
//     the existing offline unlock contract verbatim.

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
  return (
    <button
      type="button"
      className={`ts-scan-row${unlocked ? ' ts-scan-row--unlocked' : ''}`}
      onClick={() => onSelect(tale.id)}
      aria-label={`Unlock ${tale.name} — ${tale.person.name}`}
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
      <span className="ts-scan-fallback__watermark" aria-hidden="true">⚙</span>
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

  const handleDemoUnlock = useCallback((taleId: string) => {
    const tale = tales.find((t) => t.id === taleId);
    if (!tale) return;
    const wasUnlocked = state.unlocked.has(taleId);
    unlockTale(taleId);
    if (!wasUnlocked) awardScanBadge(taleId);
    navToTale(tale);
  }, [tales, state.unlocked, unlockTale, awardScanBadge, navToTale]);

  // ADMIN-v6.7 — fire-and-forget remote enrichment.
  //
  // Called only after the local parseQRCode + unlock path has already
  // run (or about to run on the same tick). Returns immediately; the
  // promise resolves out of band. On success the receipt lands in
  // qrReceiptStore for ADMIN-v6.8 to consume; on failure or when the
  // flag is off, validateQrRemote returns null and we silently skip.
  //
  // No throw can escape this function — `validateQrRemote` is already
  // wrapped, but the .then().catch() here is belt-and-suspenders so a
  // future helper change can never bubble into the unlock flow.
  const captureRemoteReceipt = useCallback((raw: string) => {
    void validateQrRemote(raw, guestId, 'scan')
      .then((result) => {
        if (!result || result.ok !== true) return;
        setLatestQrReceipt({
          taleSlug:   result.taleSlug,
          qrCodeId:   result.qrCodeId,
          receipt:    result.receipt,
          receiptExp: result.receiptExp,
          source:     'scan',
          capturedAt: Date.now(),
        });
      })
      .catch((err) => {
        console.warn('[trackside] validate-qr enrichment skipped', err);
      });
  }, [guestId]);

  const processCode = useCallback((raw: string) => {
    const result = parseQRCode(raw);
    if (!result) {
      // Local parse is the source of truth for the unlock decision.
      // Remote validation does NOT rescue unrecognized codes in v6.7.
      setScanTitle('QR NOT RECOGNIZED');
      setScanSub("That code isn't a Trackside Tale. Try a Trackside can or choose a Featured Tale below.");
      return;
    }
    handleDemoUnlock(result.taleId);
    // Enrichment fires after the local unlock has dispatched. The
    // unlock UI is already committed at this point; whatever happens
    // on the network can't roll it back.
    captureRemoteReceipt(raw);
  }, [handleDemoUnlock, captureRemoteReceipt]);

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
    <div className="page active ts-scan-screen" id="page-scan">

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
      {/* Same unlock contract as a real can scan — id passes through
         unlockTale + awardScanBadge. Visual presentation only changed. */}
      <div className="ts-scan-featured" aria-label="Featured Tales — tap to unlock">
        <div className="ts-scan-featured__header">
          <span className="ts-scan-featured__rule" aria-hidden="true" />
          <span className="ts-scan-featured__label">FEATURED TALES · TAP TO UNLOCK</span>
          <span className="ts-scan-featured__rule" aria-hidden="true" />
        </div>
        <div className="ts-scan-featured__rows">
          {tales.map((tale, idx) => (
            <FeaturedTaleRow
              key={tale.id}
              tale={tale}
              index={idx}
              unlocked={state.unlocked.has(tale.id)}
              onSelect={handleDemoUnlock}
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
