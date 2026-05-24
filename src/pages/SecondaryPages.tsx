import React from 'react';
import { useApp } from '../app/AppContext';

// ================== SECONDARY PAGES ==================
// Stub components for pages that exist in v4.6.1 HTML but are
// lower-priority for migration. Replace with full implementations
// following the same pattern as MenuPage, TalesPage, etc.
// All content is in the original index-v4_6_1-golden.html.

export function OurStoryPage() {
  const { state } = useApp();
  return (
    <div className="page active" id="page-ourstory" >
      <div className="page-hero">
        <h2>OUR STORY</h2>
        <p>The heritage behind Trackside Brewing Co.</p>
      </div>
      {/* TODO Phase 5: extract full OurStory content from index-v4_6_1-golden.html line 6040 */}
    </div>
  );
}

export function AboutPage() {
  const { state } = useApp();
  return (
    <div className="page active" id="page-about" >
      <div className="page-hero">
        <h2>ABOUT TRACKSIDE</h2>
      </div>
      {/* TODO Phase 5: extract full About content from index-v4_6_1-golden.html line 6127 */}
    </div>
  );
}

export function WoodenMatchPage() {
  const { state } = useApp();
  return (
    <div className="page active" id="page-woodenmatch" >
      <div className="woodenmatch-hero">
        <h2>THE WOODEN MATCH</h2>
        <p>An 1868 train station. Your table is waiting.</p>
      </div>
      {/* TODO Phase 5: extract full Wooden Match content from index-v4_6_1-golden.html */}
    </div>
  );
}

export function TracksPage() {
  const { state } = useApp();
  return (
    <div className="page active" id="page-tracks" >
      <div className="tracks-hero">
        <h2>THE TRACKS</h2>
        <p>The industrial corridor that shaped the Lehigh Valley.</p>
      </div>
      {/* TODO Phase 5: extract full Tracks content from index-v4_6_1-golden.html */}
    </div>
  );
}
