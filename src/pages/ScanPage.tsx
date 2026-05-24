import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { parseQRCode } from '../services/qrValidation';

// ================== SCAN PAGE (== golden #page-scan) ==================
// Mirrors the golden v4.6.1 #page-scan structure:
//   .scan-viewport with .scan-live-chip, #qr-reader, .scan-corners,
//   .scan-corners-b, .scan-line, .scan-can (placeholder when camera idle)
//   .scan-title  /  .scan-sub
//   .camera-error (hidden by default; shown when scanner fails to start)
//   .demo-quick-scan with .demo-quick-scan-label + .demo-quick-scan-buttons
//   filled with .demo-quick-btn rows
// QR / unlock / scan logic preserved untouched — only markup classes were brought
// in line with the golden so the existing scan-page CSS lights up.

declare const Html5Qrcode: unknown;

const QR_READER_ID = 'qr-reader';

export function ScanPage() {
  const { state, tales, unlockTale, awardScanBadge, navToTale } = useApp();
  const [scanning, setScanning]     = useState(false);
  const [scannerError, setScanErr]  = useState(false);
  const [scanTitle, setScanTitle]   = useState('POINT AT A CAN');
  const [scanSub, setScanSub]       = useState(
    "Center a Trackside Tales QR code in the frame — we'll unlock the story it holds.",
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

  const processCode = useCallback((raw: string) => {
    const result = parseQRCode(raw);
    if (!result) {
      setScanTitle('QR NOT RECOGNIZED');
      setScanSub('Try a Trackside Tales coaster or can.');
      return;
    }
    handleDemoUnlock(result.taleId);
  }, [handleDemoUnlock]);

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

  // Auto-start once on mount; auto-stop on unmount. The Vite app only mounts
  // ScanPage while it is the active route, so this is the natural place to
  // attach/release the camera. We intentionally exclude startScanner/stopScanner
  // from deps to avoid re-running on every state change (the callbacks are
  // stable in effect — they reference current closures via React state).
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
    <div className="page active" id="page-scan">

      <div className="scan-viewport">
        <div className={`scan-live-chip${scanning ? ' active' : ''}`} id="scan-live-chip">LIVE · CAMERA</div>
        <div id={QR_READER_ID} />
        <div className="scan-corners" />
        <div className="scan-corners-b" />
        <div className="scan-line" />
        {!scanning && (
          <div className="scan-can" id="scan-placeholder">
            <div className="scan-can-sweep" />
            <div className="scan-can-name">TRACKSIDE<br />TALES</div>
          </div>
        )}
      </div>

      <h2 className="scan-title" id="scan-title">{scanTitle}</h2>
      <p className="scan-sub" id="scan-sub">{scanSub}</p>

      {scannerError && (
        <div className="camera-error" id="camera-error">
          <strong>CAMERA UNAVAILABLE</strong><br />
          <span>Using demo mode instead.</span>
          <br />
          <button
            className="camera-retry-btn"
            onClick={() => { setScanErr(false); startScanner(); }}
          >
            TRY CAMERA AGAIN
          </button>
        </div>
      )}

      <div className="demo-quick-scan" id="demo-fallback">
        <div className="demo-quick-scan-label" id="demo-label">DEMO MODE · SELECT A STORY</div>
        <p className="demo-preview-hint">Preview mode: choose a Tale below to simulate a can scan.</p>
        <div className="demo-quick-scan-buttons" id="demo-buttons">
          {tales.map((tale) => (
            <button
              key={tale.id}
              className="demo-quick-btn"
              onClick={() => handleDemoUnlock(tale.id)}
            >
              <span>{tale.name} — {tale.person.name}</span>
              <span className="demo-quick-btn-arrow">→</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
