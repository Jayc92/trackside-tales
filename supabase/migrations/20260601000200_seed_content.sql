-- ============================================================
-- Seed content lifted from the canonical Vite app's local data
-- in src/data/tales.ts and src/data/menu.ts.
--
-- This is a faithful transcription, not a rewrite. The slugs,
-- copy, badges, games, pins, timeline entries, and bar summaries
-- match the on-device source word-for-word so the eventual
-- remote-content loader (v6.4) will produce a no-op merge against
-- LOCAL_TALES.
--
-- on conflict (slug) do nothing keeps re-runs idempotent and
-- ensures admin edits made in production are never overwritten
-- by a re-applied seed.
-- ============================================================

-- ---------- tales ----------

insert into public.tales (
  slug, name, abbr, abv, ibu, style, tagline, icon, unlock_seal,
  chapter, year, title,
  story, pins, timeline, scan_badge, game_badge, game,
  bar_summary, still_here, person, person_bio, map_title,
  tap_status, retired_date, display_order
) values
(
  'wa-lager',
  'W.A. Lager',
  'W.A.',
  '4.8%', '18',
  'American Lager',
  'For the man who drew the lines of Allentown.',
  'map-grid',
  'wa-lager-seal',
  'FOUNDING TALE', '1762',
  E'William Allen &\nthe Lehigh Valley',
  '[
    {"type":"p","text":"On <strong>September 10, 1735</strong>, William Allen bought five thousand acres of wilderness north of Philadelphia — rolling hills along a swift river, rich with timber and iron ore. He called it simply ''the tract above the forks.''"},
    {"type":"p","text":"Allen was no ordinary speculator. Born in Philadelphia in 1704, he became <strong>Chief Justice of Pennsylvania</strong>, the colony''s highest judicial office. He counted Benjamin Franklin as a friend and the Penn family as business partners, and he understood early that the land west of Philadelphia was where the next fortunes would be made."},
    {"type":"quote","text":"I think it will be one of the finest settlements in Pennsylvania.","cite":"— William Allen, on his Lehigh Valley tract"},
    {"type":"p","text":"On <strong>May 20, 1762</strong>, Allen formally laid out the town — a 42-block grid of 756 lots with streets named for his children: Margaret, William, James, Ann, and John. He called it Northampton Town. Everyone else called it Allen''s Town, and the name stuck."}
  ]'::jsonb,
  '[
    {"x":50,"y":55,"label":"Market Square","year":"1762","title":"The Original Town Square","desc":"Allen''s plan placed the market at the heart of his new town. A deliberate civic choice — markets meant commerce, and commerce meant the town would survive."},
    {"x":20,"y":30,"label":"Allen''s Lodge","year":"c. 1740","title":"The Hunting Lodge on Jordan Creek","desc":"A rough log cabin on the western bank of Jordan Creek where Allen fished for trout and entertained Governor John Penn. Power wore muddy boots in the 1740s Lehigh Valley."},
    {"x":68,"y":72,"label":"Zion Church","year":"1777","title":"Where the Liberty Bell Hid","desc":"Allen donated this land when he founded the town. Fifteen years later, the Liberty Bell was hidden beneath its floorboards for nine months to keep it from British forces."},
    {"x":80,"y":91,"label":"Lehigh River","year":"Always","title":"The Artery","desc":"Allen chose this land for the river. It would power mills, carry coal and iron, and drive the industrial revolution that made the valley one of the most productive corridors in American history."}
  ]'::jsonb,
  '[
    {"year":"1704","event":"Born in Philadelphia","detail":"Son of Andrew Allen, a prominent Scots-Irish merchant.","major":true},
    {"year":"1735","event":"Purchases the Lehigh Valley tract","detail":"Acquires 5,000 acres on September 10."},
    {"year":"1750","event":"Appointed Chief Justice of Pennsylvania","detail":"The pinnacle of colonial judicial power, held for 12 years.","major":true},
    {"year":"1762","event":"Founds Allentown","detail":"Formally lays out the 42-block town on May 20th.","major":true},
    {"year":"1777","event":"Liberty Bell hidden in Allentown","detail":"Transported 60 miles from Philadelphia and hidden beneath Zion Reformed Church."},
    {"year":"1780","event":"Dies in England","detail":"A Loyalist to the Crown, Allen left America in 1774 and never returned.","major":true}
  ]'::jsonb,
  '{"icon":"town-seal","title":"Founder''s Deed","desc":"A digital artifact of Allen''s 1762 town plan — awarded for unlocking this story."}'::jsonb,
  '{"icon":"survey-grid","title":"Grid Master","desc":"Awarded for retracing Allen''s original street grid."}'::jsonb,
  '{"type":"grid","title":"LAY OUT ALLEN''S TOWN","instructions":"Allen drew Allentown as a 42-block grid in 1762. Tap the lots in order to lay the first streets of his town — the pulsing block is your next stop.","successTitle":"STREETS LAID","successMsg":"You laid the first streets of Allen''s Town. The grid you just traced is still the layout of downtown Allentown today."}'::jsonb,
  '{"who":"The man who founded Allentown and served as Chief Justice of colonial Pennsylvania.","why":"The grid he drew in 1762 is still the layout of downtown Allentown.","beer":"An honest American lager for the man who drew the lines that hold."}'::jsonb,
  '[
    {"place":"Trout Hall","detail":"Allen''s son James built it at 414 Walnut St. in 1770. Still standing — the oldest house in Allentown."},
    {"place":"Allen Street grid","detail":"The 42-block grid Allen drew in 1762 is still the street layout of downtown Allentown."},
    {"place":"Zion Reformed Church","detail":"Where the Liberty Bell was hidden in 1777. Still an active congregation at 620 Hamilton St."}
  ]'::jsonb,
  '{"name":"William Allen","dates":"1704 – 1780","role":"Merchant · Chief Justice · Founder of Allentown","initials":"W.A.","portrait":"images/william-allen.jpg"}'::jsonb,
  'The man who drew the lines of Allentown on a May morning in 1762. Merchant, Chief Justice of Pennsylvania, and one of colonial America''s wealthiest landholders.',
  'Allentown Grid, 1762',
  'on-tap', null, 10
),
(
  'packer-pils',
  'Packer Pilsner',
  'PACKER',
  '5.1%', '32',
  'German-Style Pilsner',
  'The man who put the Lehigh Valley on rails.',
  'rail-spike',
  'packer-pilsner-seal',
  'RAIL TALE', '1855',
  E'Asa Packer &\nthe Iron Horse',
  '[
    {"type":"p","text":"Asa Packer walked from Connecticut to Pennsylvania in 1822. He was seventeen, too poor to afford an inn, and slept on the ground when no farmer would give him a barn for the night. He would die, fifty-seven years later, as one of the wealthiest men in Pennsylvania."},
    {"type":"p","text":"Packer learned carpentry from his cousin in Susquehanna County. He built canal boats on the Lehigh. Then in <strong>October 1851</strong>, he took the bet of his life — he bought majority control of a struggling railroad company and renamed it the <strong>Lehigh Valley Railroad</strong>. On June 11, 1855, the line opened between Easton and Allentown."},
    {"type":"quote","text":"The Bethlehem Iron Company was created to supply rails to the Lehigh Valley Railroad. That company would later become Bethlehem Steel.","cite":"— Frank Whelan, historian"},
    {"type":"p","text":"Packer''s railroad carried anthracite coal from the mines to the eastern cities, where it fed the iron furnaces that produced the rails for more track. Inside a generation that loop — coal, iron, rail, coal again — turned the Lehigh Valley into the industrial spine of the country."},
    {"type":"p","text":"In <strong>1865</strong>, Packer donated $500,000 and 60 acres of South Mountain to found <strong>Lehigh University</strong> in Bethlehem, with tuition kept free for its first twenty years. The boy who once couldn''t afford a stagecoach went on to build a university that trained a century of engineers."}
  ]'::jsonb,
  '[
    {"x":18,"y":45,"label":"Mauch Chunk","year":"1855","title":"The Coal Origin","desc":"Now called Jim Thorpe. The northern terminus of Packer''s original line."},
    {"x":50,"y":52,"label":"Bethlehem","year":"1855","title":"Where Iron Met Rail","desc":"Packer''s line reached Bethlehem in 1855, and with it came Bethlehem Iron — founded to supply the railroad with rails. That company became Bethlehem Steel."},
    {"x":78,"y":55,"label":"Easton","year":"June 11, 1855","title":"The Eastern Terminus","desc":"The line opened between Easton and Allentown on June 11, 1855. From Easton, goods could connect to New York and Philadelphia."},
    {"x":50,"y":80,"label":"Lehigh University","year":"1865","title":"Packer''s Gift","desc":"In 1865, Packer gave $500,000 and 60 acres on South Mountain for a technical trade school. Lehigh opened tuition-free for its first 20 years."}
  ]'::jsonb,
  '[
    {"year":"1805","event":"Born in Mystic, Connecticut","detail":"Into a poor family with almost no formal education.","major":true},
    {"year":"1822","event":"Walks to Pennsylvania","detail":"Too poor for a stagecoach, slept outside most nights."},
    {"year":"1851","event":"Takes over the Lehigh Valley Railroad","detail":"Buys majority control in October.","major":true},
    {"year":"1855","event":"Mainline opens Easton to Allentown","detail":"June 11th — the first major stretch of track.","major":true},
    {"year":"1865","event":"Founds Lehigh University","detail":"Donates $500,000 and 60 acres. Tuition free for 20 years.","major":true},
    {"year":"1879","event":"Dies at his Philadelphia mansion","detail":"May 17th. Leaves a railroad empire, a university, and a transformed Lehigh Valley.","major":true}
  ]'::jsonb,
  '{"icon":"ticket-punch","title":"Conductor''s Ticket","desc":"A ticket for the first run of the Lehigh Valley Railroad, June 11, 1855."}'::jsonb,
  '{"icon":"crossed-spikes","title":"Spike Driver","desc":"Awarded for driving the rail spikes from Mauch Chunk to Easton in rhythm."}'::jsonb,
  '{"type":"spike","title":"DRIVE THE RAIL SPIKES","instructions":"Packer''s crews drove thousands of spikes to lay the Lehigh Valley line. Tap each spike on the rail before it slips by — land 8 of 12 to earn your badge.","successTitle":"LINE COMPLETE","successMsg":"The line is set. The valley is moving. Forty-six miles of iron between Easton and Mauch Chunk — and the coal that built America starts rolling."}'::jsonb,
  '{"who":"A Connecticut carpenter who walked to Pennsylvania and went on to build the Lehigh Valley Railroad.","why":"His line carried the coal that fed Bethlehem Steel and connected the valley to the world.","beer":"A clean German-style pilsner for the man who built clean track."}'::jsonb,
  '[
    {"place":"Lehigh University","detail":"Founded by Packer in 1865 with $500,000 and 60 acres on South Mountain. Still teaching engineers a century and a half later."},
    {"place":"Asa Packer Mansion","detail":"His Italianate home in Jim Thorpe (formerly Mauch Chunk) is preserved as a museum, with the original furnishings intact."},
    {"place":"The D&L Trail","detail":"The Delaware & Lehigh National Heritage Corridor follows the path of the railroad and canal that made Packer''s fortune."}
  ]'::jsonb,
  '{"name":"Asa Packer","dates":"1805 – 1879","role":"Carpenter · Railroad Baron · Founder of Lehigh University","initials":"A.P.","portrait":"images/asa-packer.jpg"}'::jsonb,
  'A Connecticut carpenter who walked to Pennsylvania because he couldn''t afford a stagecoach. Built the Lehigh Valley Railroad. Founded Lehigh University.',
  'LVRR Mainline, 1855',
  'on-tap', null, 20
),
(
  'wooden-match',
  'The Wooden Match Amber Ale',
  'WOODEN MATCH',
  '5.2%', '24',
  'American Amber Ale',
  'Strike history. Light the moment.',
  'station-lantern',
  'wooden-match-seal',
  'STATION TALE', '1868',
  E'The Wooden Match &\nthe Building That Stayed',
  '[
    {"type":"p","text":"Most American train stations end the way their railroads end: a wrecking ball, a parking lot, and a plaque if anyone bothered. The <strong>Central Railroad of New Jersey station on Lehigh Street</strong>, built in <strong>1868</strong>, was an exception."},
    {"type":"p","text":"For nearly a century, the building did exactly what it was built to do. Conductors checked their pocket watches against the wall clock. Two sitting presidents — William Howard Taft in 1911 and Theodore Roosevelt during his Bull Moose run in 1912 — stepped onto the platform and addressed crowds gathered in the gravel below. Steel workers caught the morning train into Bethlehem. Soldiers shipped out from this platform during two world wars."},
    {"type":"quote","text":"The railroads built this valley, and the valley remembered.","cite":"— paraphrased from the building''s historical marker"},
    {"type":"p","text":"On <strong>August 18, 1967</strong>, the last scheduled passenger train pulled away from the platform. The Central Railroad of New Jersey was bankrupt within weeks, and the line was abandoned soon after. In most American cities, that is where the story of a station ends."},
    {"type":"p","text":"This building had what most stations didn''t: a mansard roof, iron platform brackets, and brick walls thick enough to outlast the railroad that owned them. Bethlehem kept it, restored it, and over time filled it with people again — around tables now, instead of timetables. Today the building is <strong>The Wooden Match</strong>, the bar where this beer first poured."},
    {"type":"p","text":"A wooden match is a small thing — you strike it once and it either catches or it doesn''t. This building caught the first time, in 1868, and somehow it has kept catching every decade since. <strong>A hundred and fifty years of footsteps. Yours are the latest.</strong>"}
  ]'::jsonb,
  '[
    {"x":50,"y":50,"label":"The Platform","year":"1868","title":"Where the Trains Stopped","desc":"The original platform under the iron-bracketed canopy. The stone footings are unchanged from the day the first CNJ train pulled in."},
    {"x":30,"y":30,"label":"The Roosevelt Stop","year":"1912","title":"A Whistle-Stop Speech","desc":"Theodore Roosevelt addressed a Bethlehem crowd from the rear platform of his campaign car here during his Bull Moose run. Photographs from that day still hang inside."},
    {"x":72,"y":42,"label":"The Last Train","year":"Aug 18, 1967","title":"Final CNJ Service","desc":"The last scheduled passenger train left this platform on August 18, 1967. The CNJ filed for bankruptcy weeks later. The tracks came up by 1972."},
    {"x":48,"y":78,"label":"The Bar","year":"Today","title":"Where Trackside Pours","desc":"The same room that once held a ticket counter and waiting benches now holds taps, tables, and the soft launch of every Trackside Tales beer."}
  ]'::jsonb,
  '[
    {"year":"1868","event":"Station built","detail":"Central Railroad of New Jersey opens passenger service on the Bethlehem line.","major":true},
    {"year":"1911","event":"President Taft speaks","detail":"William Howard Taft addresses a Bethlehem crowd from the platform during a regional tour."},
    {"year":"1912","event":"Theodore Roosevelt whistle-stop","detail":"Roosevelt stops at the station during his Bull Moose campaign.","major":true},
    {"year":"1944","event":"Wartime peak","detail":"The station handles its highest passenger volume on record — troops, war workers, freight — during the Bethlehem Steel surge."},
    {"year":"1967","event":"Last train departs","detail":"The final scheduled passenger train pulls away on August 18. The CNJ enters bankruptcy weeks later.","major":true},
    {"year":"Today","event":"The Wooden Match","detail":"The building lives on as a bar in Bethlehem and the soft-launch home of Trackside Brewing Co.","major":true}
  ]'::jsonb,
  '{"icon":"station-seal","title":"First Strike","desc":"A small token for the Tale named after the place where it pours. A hundred and fifty years of footsteps in this building — yours just got added to the count."}'::jsonb,
  '{"icon":"match-flame","title":"Match Striker","desc":"Earned for striking enough matches before they burned out. A patient hand for a patient building."}'::jsonb,
  '{"type":"match","title":"STRIKE THE MATCH","instructions":"The old station has been dark since 1967. Swipe across the strike strip to light a match — every strike lights one of the station lamps. Light all five.","successTitle":"STATION LIT","successMsg":"The old station lights up again. A hundred and fifty years of footsteps, and the lamps are still on."}'::jsonb,
  '{"who":"An 1868 Bethlehem train station, today the bar where this beer first poured.","why":"Two presidents spoke from its platform, the last passenger train left in 1967, and the building is still standing.","beer":"An amber ale named for the place that hosts it — crisp, smooth, and built to outlast a trend or two."}'::jsonb,
  '[
    {"place":"The Wooden Match","detail":"The 1868 station building, restored and serving as a Bethlehem bar today — the home where Trackside Tales pour every night."},
    {"place":"The Lehigh Street platform","detail":"The original platform under the iron-bracketed canopy is still in place, and the stone footings are unchanged."},
    {"place":"The CNJ right-of-way","detail":"The cleared corridor of the old line still runs through Bethlehem, marking the path the trains followed from 1868 through that final August in 1967."}
  ]'::jsonb,
  '{"name":"The Wooden Match","dates":"1868 – Today","role":"Train Station · Bar · Living Landmark","initials":"WM","portrait":"images/wooden-match-exterior.jpg"}'::jsonb,
  'A Central Railroad of New Jersey passenger station built in 1868, today the Bethlehem bar where Trackside Tales pour every night. The building has outlived the railroad that built it by more than half a century.',
  'The Wooden Match · Lehigh Street',
  'on-tap', null, 30
)
on conflict (slug) do nothing;

-- ---------- beers ----------
-- Slug values are the canonical admin/QR identifiers. The public app
-- currently keys beers by name; rendering is unaffected by adding a slug.
insert into public.beers (slug, name, abbr, category, style, abv, ibu, tasting, display_order) values
  ('trackside-lager',          'Trackside Lager',           'TRACKSIDE',  'regular', 'American Lager',           '4.9%', '20',
   'Our staple. Crisp, clean, sessionable — the beer every brewery needs to get right. This is ours.', 10),
  ('bethlehem-steel-ale',      'Bethlehem Steel Ale',       'STEEL ALE',  'regular', 'American Amber Ale',       '5.6%', '28',
   'A tribute to the furnaces that built America. Rich caramel malt, medium body, hops that bite just enough.', 20),
  ('610-pilsner',              '610 Pilsner',               '610',        'regular', 'Czech Pilsner',            '5.0%', '35',
   'Named for the highway that cuts through the valley. Bohemian floor-malted pilsner, Saaz hops, a pour that honors the classics.', 30),
  ('signalmans-citrus-wheat',  'Signalman''s Citrus Wheat', 'SIGNALMAN',  'non-alc', 'Non-Alcoholic Wheat Ale', '<0.5%', '12',
   'For the designated drivers and the morning shifts. Bright citrus over soft wheat malt — refreshment without compromise.', 10),
  ('roundhouse-red',           'Roundhouse Red',            'ROUNDHOUSE', 'non-alc', 'Non-Alcoholic Amber',     '<0.5%', '22',
   'All the caramel warmth of an amber ale, zero alcohol. Our answer to the question: why shouldn''t everyone at the table drink well?', 20)
on conflict (slug) do nothing;

-- ---------- food ----------
-- Slugs are stable identifiers for admin/seed use; display names
-- (food.name) remain the customer-facing strings the public app
-- already renders verbatim.
insert into public.food (slug, name, description, display_order) values
  ('other-side-of-the-pillow',
   'Other Side Of The Pillow',
   'Deep fried or sautéed house potato and Cooper cheese pierogies, caramelized onions, sour cream, red wine demi-glace.', 10),
  ('cnj-railyard',
   'CNJ Railyard',
   'Organic super greens, roasted red peppers, carrot ribbons, roasted grape tomatoes, shaved parmesan, balsamic honey vinaigrette.', 20),
  ('broad-street-bully',
   'Broad Street Bully',
   'Shaved ribeye, caramelized onions, Cooper Sharp, Egypt Star Bakery French bread.', 30),
  ('burger-flight',
   'Burger Flight',
   'Three sliders: Double Wide, Mule Kick, Smash Bros.', 40)
on conflict (slug) do nothing;

-- ---------- reward_tiers (placeholder for v6.8) ----------
insert into public.reward_tiers (id, name, stamps_required, perks) values
  (1, 'Passenger',     0, '["Welcome to Trackside Tales", "Free first stamp on any tap"]'::jsonb),
  (2, 'Conductor',     3, '["10% off merch", "Early access to Coming Next tales"]'::jsonb),
  (3, 'Engineer',      6, '["Exclusive Engineer pint glass", "First pour of every new tale"]'::jsonb),
  (4, 'Stationmaster', 10, '["Stationmaster jacket patch", "Named pour at The Wooden Match"]'::jsonb)
on conflict (id) do update
  set name            = excluded.name,
      stamps_required = excluded.stamps_required,
      perks           = excluded.perks;

-- ---------- qr_codes (sample rows; safe — service-role-read only) ----------
-- One stable code per Tale, modeled on the existing
-- `trackside://demo/<id>` pattern parseQRCode already accepts. These
-- are SAMPLE rows for admin/edge-fn testing. Real printed-can codes
-- will be minted by the admin app and may use opaque values.
insert into public.qr_codes (code, tale_slug, location_label, purpose) values
  ('trackside://demo/wa-lager',     'wa-lager',     'Demo button — W.A. Lager',                'test'),
  ('trackside://demo/packer-pils',  'packer-pils',  'Demo button — Packer Pilsner',            'test'),
  ('trackside://demo/wooden-match', 'wooden-match', 'Demo button — Wooden Match Amber Ale',    'test')
on conflict (code) do nothing;
