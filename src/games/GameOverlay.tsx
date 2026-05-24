import React from 'react';
import { GameConfig } from './gameConfigs';

// ================== GAME OVERLAY (v5.0.1 — DISABLED) ==================
// Mini-games are temporarily switched off in the public app while the
// game mechanics are being rebuilt for v5.1. The Tale detail page no
// longer mounts this overlay, but we keep the component (and the rest
// of the games/ folder) wired up so the future rebuild has a clean
// slot to drop into.
//
// If anything mounts this overlay anyway — a stale onClick, a dev-tool
// invocation, a future bug — it now renders a polished "Challenge
// coming soon" panel using the same brass styling instead of trying to
// boot the broken game UI.
//
// ── Future rebuild ──
// The pre-v5.0.1 implementation lived in this file and orchestrated
// AllenTownGame / PackerRailGame / WoodenMatchGame with phases:
//   playing → quiz → success | fail
// All three child components remain on disk (src/games/*.tsx) along
// with gameConfigs.ts. To restore: re-implement the orchestrator here
// and flip the Tale detail CTA's disabled flag in TaleDetailPage.tsx.

interface GameOverlayProps {
  config: GameConfig;
  onClose: () => void;
  // Kept for API parity with the pre-v5.0.1 signature. The disabled
  // overlay never awards badges — passport progress is unaffected.
  onBadgeAwarded?: (badgeKey: string) => void;
  alreadyEarned?: boolean;
}

export function GameOverlay({ config, onClose }: GameOverlayProps) {
  return (
    <div
      className="game-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Interactive Challenge — coming soon"
    >
      <div className="game-modal">
        <div className="game-modal-header">
          <button
            className="game-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
          <h2 className="game-title">Interactive Challenge</h2>
        </div>

        <div className="game-success" style={{ paddingTop: '0.5rem' }}>
          <div className="game-success-icon">◈</div>
          <h3 className="game-success-title">Coming Soon</h3>
          <p className="game-success-msg">
            The {config?.title || 'Tale'} challenge is being rebuilt for the next preview.
            Your scan badge and passport stamp are already secured.
          </p>
          <button className="game-dismiss-btn brass-btn" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
