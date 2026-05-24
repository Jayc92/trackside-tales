import React from 'react';

// ================== TRACKSIDE ICON SYSTEM ==================
// Inline SVG icon library. Every icon shares a 24×24 viewBox,
// uses currentColor for stroke, and renders as an open-line drawing.

const ICON_BODIES: Record<string, string> = {
  'map-grid':
    '<rect x="3.5" y="3.5" width="17" height="17" rx="0.5"/>' +
    '<line x1="9.17" y1="3.5" x2="9.17" y2="20.5"/>' +
    '<line x1="14.83" y1="3.5" x2="14.83" y2="20.5"/>' +
    '<line x1="3.5" y1="9.17" x2="20.5" y2="9.17"/>' +
    '<line x1="3.5" y1="14.83" x2="20.5" y2="14.83"/>' +
    '<rect x="10.4" y="10.4" width="3.2" height="3.2" fill="currentColor" stroke="none"/>',

  'town-seal':
    '<circle cx="12" cy="12" r="9"/>' +
    '<circle cx="12" cy="12" r="6.5" stroke-dasharray="0.5 1.4"/>' +
    '<rect x="9" y="9" width="6" height="6"/>' +
    '<line x1="12" y1="9" x2="12" y2="15"/>' +
    '<line x1="9" y1="12" x2="15" y2="12"/>',

  'survey-grid':
    '<rect x="3.5" y="3.5" width="7" height="6"/>' +
    '<rect x="13.5" y="3.5" width="7" height="6"/>' +
    '<rect x="3.5" y="14.5" width="7" height="6"/>' +
    '<rect x="13.5" y="14.5" width="7" height="6"/>' +
    '<path d="M12 8.5c1.5 0 2.5 1.1 2.5 2.5 0 1.9-2.5 4.5-2.5 4.5s-2.5-2.6-2.5-4.5c0-1.4 1-2.5 2.5-2.5z"/>' +
    '<circle cx="12" cy="11" r="0.9" fill="currentColor" stroke="none"/>',

  'rail-spike':
    '<line x1="3" y1="9.5" x2="21" y2="9.5"/>' +
    '<line x1="3" y1="14.5" x2="21" y2="14.5"/>' +
    '<path d="M9.5 5.5h5l-0.7 2H10.2z"/>' +
    '<line x1="10.2" y1="7.5" x2="13.8" y2="7.5"/>' +
    '<path d="M10.4 7.5l1.6 11 1.6-11"/>',

  'ticket-punch':
    '<path d="M3.5 7.5v9h17v-9z"/>' +
    '<line x1="14" y1="7.5" x2="14" y2="16.5" stroke-dasharray="1 1.5"/>' +
    '<circle cx="8" cy="12" r="1.6"/>',

  'crossed-spikes':
    '<path d="M5.5 4.5l3 1 11.5 11.5-1 3z"/>' +
    '<line x1="6.5" y1="5.5" x2="19" y2="18"/>' +
    '<path d="M18.5 4.5l-3 1L4 17l1 3z"/>' +
    '<line x1="17.5" y1="5.5" x2="5" y2="18"/>',

  'station-lantern':
    '<path d="M4 10l3-4h10l3 4"/>' +
    '<line x1="4" y1="10" x2="20" y2="10"/>' +
    '<line x1="4" y1="10" x2="4" y2="13"/>' +
    '<line x1="20" y1="10" x2="20" y2="13"/>' +
    '<rect x="10" y="13" width="4" height="6" rx="0.5"/>' +
    '<line x1="10" y1="16" x2="14" y2="16"/>' +
    '<circle cx="12" cy="15" r="0.8" fill="currentColor" stroke="none"/>',

  'station-seal':
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M6.5 14.5l1.5-2h8l1.5 2"/>' +
    '<line x1="6.5" y1="14.5" x2="17.5" y2="14.5"/>' +
    '<rect x="10.5" y="10.5" width="3" height="2" rx="0.3"/>' +
    '<line x1="6.5" y1="17" x2="17.5" y2="17"/>',

  'match-flame':
    '<path d="M12 4c-0.5 1.6 0.8 2.4 0.8 4 0 1.2-0.8 2.2-2 2.2-1.4 0-2.2-1-2.2-2.2 0-2 1.4-2.2 1.4-4 1.2 0.6 1.6 1.4 2 0z"/>' +
    '<line x1="11" y1="11" x2="11" y2="20"/>' +
    '<rect x="10.4" y="10.5" width="1.4" height="2.2" rx="0.3" fill="currentColor" stroke="none"/>',

  'locked-seal':
    '<circle cx="12" cy="12" r="9"/>' +
    '<rect x="9" y="11.5" width="6" height="5" rx="0.6"/>' +
    '<path d="M10.2 11.5v-1.6c0-1 0.8-1.8 1.8-1.8s1.8 0.8 1.8 1.8v1.6"/>' +
    '<line x1="12" y1="13.4" x2="12" y2="14.8"/>',
};

interface TsIconProps {
  icon: string;
  className?: string;
}

export function TsIcon({ icon, className = '' }: TsIconProps) {
  const body = ICON_BODIES[icon] || ICON_BODIES['locked-seal'];
  return (
    <svg
      className={`ts-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

interface SealImageProps {
  sealKey: string;
  sealImages: Record<string, string>;
  className?: string;
}

export function SealImage({ sealKey, sealImages, className = '' }: SealImageProps) {
  const uri = sealImages[sealKey];
  if (!uri) return <TsIcon icon="locked-seal" className={className} />;
  return (
    <img
      className={`ts-seal-img ${className}`.trim()}
      src={uri}
      alt=""
      aria-hidden="true"
    />
  );
}
