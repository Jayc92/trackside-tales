// ================== PUBLIC-v7.4B.P.28a — interactive helpers ==================
// The public app renders several tappable cards as styled <div>s (the CSS
// targets div structure directly, so converting to <button> would fight
// years of layout styling). `pressable()` upgrades those divs to real
// keyboard citizens: role=button, tab order, and Enter/Space activation.
// The global :focus-visible ring in tokens.css provides the indicator.
//
// Use for any click-only <div>/<article> card. Real <button>/<a> elements
// don't need it.

import type React from 'react';

export function pressable(handler: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    },
  };
}
