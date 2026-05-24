import React from 'react';
import { useApp } from '../app/AppContext';
import { PageId } from '../app/types';

// ================== TALES HUB PAGE (== golden #page-taleshub) ==================
// Mirrors the golden v4.6.1 #page-taleshub structure exactly:
//   .taleshub-hero with .taleshub-eyebrow, .taleshub-title (+ <br>),
//   .taleshub-title-diamond, .taleshub-sub
//   .taleshub-cards stacking 3 .taleshub-card items, each composed of
//   .taleshub-card-image (with <img>) + .taleshub-card-content
//   (.taleshub-image-label, .taleshub-card-title, .taleshub-card-subtitle,
//    .taleshub-card-body, .taleshub-card-cta)
// Per golden: these 3 cards are static editorial hub entries — not the per-Tale
// list. Per-Tale cards live on the MENU/Tap List page.

interface HubCard {
  image: string;
  imageAlt: string;
  label: string;
  title: string;
  subtitle: string;
  body: string;
  cta: string;
  navTo: PageId;
}

const HUB_CARDS: HubCard[] = [
  {
    image: 'assets/tales/tales-wooden-match.png',
    imageAlt: 'The Wooden Match',
    label: 'PARTNER VENUE',
    title: 'THE WOODEN MATCH',
    subtitle: 'A rail-side Bethlehem tavern built for stories, beer, and the people passing through.',
    body: "Built inside an 1868 CNJ station building, The Wooden Match is the first real-world Trackside partner — a preserved piece of Lehigh Valley rail history.",
    cta: 'READ THE STORY →',
    navTo: 'woodenmatch',
  },
  {
    image: 'assets/tales/tales-trackside-brewing.png',
    imageAlt: 'Trackside Brewing Co.',
    label: 'THE CONCEPT',
    title: 'TRACKSIDE BREWING CO.',
    subtitle: 'A brewery concept rooted in local history, rail heritage, and stories worth collecting.',
    body: 'Every Trackside beer is tied to a real person or moment in Lehigh Valley history. The beer is the ticket — the history is the destination.',
    cta: 'READ THE STORY →',
    navTo: 'about',
  },
  {
    image: 'assets/tales/tales-scan-unlock.png',
    imageAlt: 'Scan, unlock, collect',
    label: 'THE EXPERIENCE',
    title: 'TRACKSIDE TALES',
    subtitle: 'Every pour has a route. Every can can unlock a story.',
    body: 'Scan a Trackside can to unlock a history chapter, earn a passport stamp, and play a mini-game tied to each tale.',
    cta: 'EXPLORE TALES →',
    navTo: 'scan',
  },
];

export function TalesPage() {
  const { nav } = useApp();

  return (
    <div className="page active" id="page-taleshub">

      <div className="taleshub-hero">
        <div className="taleshub-eyebrow">TRACKSIDE TALES</div>
        <div className="taleshub-title">
          STORIES FROM<br />THE TRACK
        </div>
        <span className="taleshub-title-diamond">◆</span>
        <div className="taleshub-sub">
          History, heritage, and the people who keep the spirit on track — one pour at a time.
        </div>
      </div>

      <div className="taleshub-cards">
        {HUB_CARDS.map((card) => (
          <div
            key={card.title}
            className="taleshub-card"
            onClick={() => nav(card.navTo)}
            role="button"
            aria-label={card.title}
          >
            <div className="taleshub-card-image">
              <img
                src={card.image}
                alt={card.imageAlt}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div className="taleshub-card-content">
              <span className="taleshub-image-label">{card.label}</span>
              <div className="taleshub-card-title">{card.title}</div>
              <div className="taleshub-card-subtitle">{card.subtitle}</div>
              <div className="taleshub-card-body">{card.body}</div>
              <button className="taleshub-card-cta">{card.cta}</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: '2rem' }} />
    </div>
  );
}
