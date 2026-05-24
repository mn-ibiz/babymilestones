const pptxgen = require('pptxgenjs');

// ---------- Design tokens ----------
const C = {
  navy:    '1E3A5F',
  tan:     'B08968',
  text:    '1F2937',
  muted:   '6B7280',
  light:   'F4F1EC',
  cream:   'FAF7F2',
  divider: 'D6D3D1',
  white:   'FFFFFF'
};

const F = { heading: 'Calibri', body: 'Calibri' };

// Slide geometry (inches, 16:9)
const W = 10;
const H = 5.625;
const M = { l: 0.6, r: 0.6, t: 0.5, b: 0.4 };

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_16x9';
pptx.title = 'Unified Baby Care Platform — BabyCare-Brands';
pptx.author = 'BabyCare-Brands';
pptx.company = 'BabyCare-Brands';

// ---------- Slide primitives ----------

function addFooter(slide, pageNum, total) {
  slide.addShape(pptx.shapes.LINE, {
    x: M.l, y: H - 0.45, w: W - M.l - M.r, h: 0,
    line: { color: C.divider, width: 0.5 }
  });
  slide.addText('BabyCare-Brands  ·  Unified Baby Care Platform', {
    x: M.l, y: H - 0.35, w: 6, h: 0.25,
    fontFace: F.body, fontSize: 8, color: C.muted,
    align: 'left', valign: 'middle'
  });
  slide.addText(`${pageNum} / ${total}`, {
    x: W - M.r - 1, y: H - 0.35, w: 1, h: 0.25,
    fontFace: F.body, fontSize: 8, color: C.muted,
    align: 'right', valign: 'middle'
  });
}

function addHeader(slide, sectionLabel, titleText) {
  // thin accent bar
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: M.l, y: M.t, w: 0.35, h: 0.04,
    fill: { color: C.tan }, line: { color: C.tan, width: 0 }
  });
  // section label
  slide.addText(sectionLabel, {
    x: M.l, y: M.t + 0.08, w: W - M.l - M.r, h: 0.22,
    fontFace: F.body, fontSize: 9, color: C.tan,
    bold: true, charSpacing: 4, align: 'left', valign: 'top'
  });
  // title
  slide.addText(titleText, {
    x: M.l, y: M.t + 0.33, w: W - M.l - M.r, h: 0.65,
    fontFace: F.heading, fontSize: 26, color: C.navy,
    bold: true, align: 'left', valign: 'top'
  });
}

function newSlide() {
  const s = pptx.addSlide();
  s.background = { color: C.white };
  return s;
}

// ---------- Slide 1: Cover ----------

function slide1_Cover() {
  const s = newSlide();
  s.background = { color: C.cream };

  // small top label
  s.addText('BABYCARE-BRANDS', {
    x: 0, y: 0.7, w: W, h: 0.3,
    fontFace: F.heading, fontSize: 11, color: C.tan,
    bold: true, charSpacing: 8, align: 'center', valign: 'middle'
  });

  // divider mark
  s.addShape(pptx.shapes.RECTANGLE, {
    x: W / 2 - 0.25, y: 1.1, w: 0.5, h: 0.03,
    fill: { color: C.tan }, line: { color: C.tan, width: 0 }
  });

  // main title
  s.addText('Unified Baby Care Platform', {
    x: 0, y: 1.6, w: W, h: 0.9,
    fontFace: F.heading, fontSize: 40, color: C.navy,
    bold: true, align: 'center', valign: 'middle'
  });

  // subtitle
  s.addText('A single platform for the salon, toy shop, play area, and parenting classes', {
    x: 0.5, y: 2.55, w: W - 1, h: 0.45,
    fontFace: F.body, fontSize: 15, italic: true, color: C.text,
    align: 'center', valign: 'middle'
  });

  // prepared-for block
  s.addText('PREPARED FOR', {
    x: 0, y: 3.55, w: W, h: 0.22,
    fontFace: F.body, fontSize: 9, color: C.muted,
    bold: true, charSpacing: 4, align: 'center', valign: 'middle'
  });
  s.addText('[Client Business Name]', {
    x: 0, y: 3.78, w: W, h: 0.35,
    fontFace: F.heading, fontSize: 18, color: C.text,
    bold: true, align: 'center', valign: 'middle'
  });

  // prepared-by block
  s.addText('PREPARED BY', {
    x: 0, y: 4.3, w: W, h: 0.22,
    fontFace: F.body, fontSize: 9, color: C.muted,
    bold: true, charSpacing: 4, align: 'center', valign: 'middle'
  });
  s.addText('BabyCare-Brands', {
    x: 0, y: 4.53, w: W, h: 0.35,
    fontFace: F.heading, fontSize: 18, color: C.text,
    bold: true, align: 'center', valign: 'middle'
  });

  // bottom meta
  s.addText('Version 1.0  ·  Draft  ·  23 April 2026', {
    x: 0, y: H - 0.55, w: W, h: 0.25,
    fontFace: F.body, fontSize: 9, color: C.muted,
    align: 'center', valign: 'middle'
  });
}

// ---------- Slide 2: The Vision ----------

function slide2_Vision(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'VISION', 'One destination. One platform.');

  s.addText([
    { text: 'A single, trusted place', options: { bold: true, color: C.navy } },
    { text: ' for everything a young family needs — haircuts, toys, play, and parenting classes — run on ', options: {} },
    { text: 'one modern digital platform', options: { bold: true, color: C.navy } },
    { text: '.', options: {} }
  ], {
    x: M.l, y: 1.6, w: W - M.l - M.r, h: 1.2,
    fontFace: F.body, fontSize: 18, color: C.text,
    align: 'left', valign: 'top'
  });

  // three pillar cards
  const py = 3.15;
  const ph = 1.55;
  const gap = 0.18;
  const pw = (W - M.l - M.r - gap * 2) / 3;

  const pillars = [
    { label: 'FOR PARENTS', title: 'Simpler visits', body: 'One account. One login. Every service in the complex at their fingertips.' },
    { label: 'FOR STAFF',   title: 'Clear tools',    body: 'Purpose-built screens for stylists, cashiers, attendants, and trainers.' },
    { label: 'FOR OWNERS',  title: 'One true view',  body: 'Real-time reporting across every unit, drillable to a single transaction.' }
  ];

  pillars.forEach((p, i) => {
    const x = M.l + (pw + gap) * i;
    // top accent line
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y: py, w: 0.5, h: 0.03,
      fill: { color: C.tan }, line: { color: C.tan, width: 0 }
    });
    s.addText(p.label, {
      x, y: py + 0.08, w: pw, h: 0.22,
      fontFace: F.body, fontSize: 9, color: C.tan, bold: true, charSpacing: 4
    });
    s.addText(p.title, {
      x, y: py + 0.32, w: pw, h: 0.4,
      fontFace: F.heading, fontSize: 18, color: C.navy, bold: true
    });
    s.addText(p.body, {
      x, y: py + 0.78, w: pw, h: 0.75,
      fontFace: F.body, fontSize: 12, color: C.text, valign: 'top'
    });
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 3: Agenda ----------

function slide3_Agenda(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'AGENDA', 'What this deck covers');

  const items = [
    ['01', 'The four business units',            'Salon · Shop · Play Area · Training'],
    ['02', 'The HQ unification layer',           'A single real-time view of the whole complex'],
    ['03', 'The unified parent account',         'One customer across every service'],
    ['04', 'Payments & receipts',                'M-Pesa, cash, and Kenya tax readiness'],
    ['05', 'Technical approach',                 'Monorepo, shared services, progressive delivery'],
    ['06', 'Phased roadmap',                     'Five phases, each live before the next begins'],
    ['07', 'What we need from you',              'Open questions and next steps']
  ];

  const startY = 1.55;
  const rowH = 0.48;
  items.forEach((it, i) => {
    const y = startY + i * rowH;
    s.addText(it[0], {
      x: M.l, y, w: 0.5, h: rowH - 0.05,
      fontFace: F.heading, fontSize: 14, color: C.tan, bold: true, valign: 'middle'
    });
    s.addText(it[1], {
      x: M.l + 0.55, y, w: 4.0, h: rowH - 0.05,
      fontFace: F.heading, fontSize: 14, color: C.navy, bold: true, valign: 'middle'
    });
    s.addText(it[2], {
      x: M.l + 4.6, y, w: W - M.l - M.r - 4.6, h: rowH - 0.05,
      fontFace: F.body, fontSize: 12, color: C.muted, valign: 'middle'
    });
    s.addShape(pptx.shapes.LINE, {
      x: M.l, y: y + rowH - 0.05, w: W - M.l - M.r, h: 0,
      line: { color: C.divider, width: 0.5 }
    });
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 4: The four business units (2x2) ----------

function slide4_FourUnits(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'OVERVIEW', 'The four business units');

  const gridY = 1.55;
  const gridH = 3.35;
  const gap = 0.2;
  const cardW = (W - M.l - M.r - gap) / 2;
  const cardH = (gridH - gap) / 2;

  const units = [
    { num: '01', name: 'Baby Salon',            body: 'Online and walk-in hair bookings. Pick a preferred stylist. Pay at counter. Stylist earnings tracked automatically.' },
    { num: '02', name: 'Toy Shop',              body: 'In-store POS in the custom platform. Online store on standalone WooCommerce. POS syncs both ways: pulls Woo orders to pack, pushes stock by SKU so we never oversell.' },
    { num: '03', name: 'Play Area',             body: 'Counter tokens per game or all-games day passes. Sessions tracked by child. Revenue by game at end of day.' },
    { num: '04', name: 'Training & Events',     body: 'Parenting classes with online booking and M-Pesa payment. Ready to grow into ticketed conferences.' }
  ];

  units.forEach((u, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M.l + col * (cardW + gap);
    const y = gridY + row * (cardH + gap);

    // card bg
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y, w: cardW, h: cardH,
      fill: { color: C.cream }, line: { color: C.divider, width: 0.5 }
    });
    // left accent bar
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y, w: 0.06, h: cardH,
      fill: { color: C.tan }, line: { color: C.tan, width: 0 }
    });
    // number
    s.addText(u.num, {
      x: x + 0.3, y: y + 0.2, w: 0.6, h: 0.3,
      fontFace: F.heading, fontSize: 11, color: C.tan, bold: true, charSpacing: 3
    });
    // name
    s.addText(u.name, {
      x: x + 0.3, y: y + 0.5, w: cardW - 0.5, h: 0.45,
      fontFace: F.heading, fontSize: 20, color: C.navy, bold: true
    });
    // body
    s.addText(u.body, {
      x: x + 0.3, y: y + 1.0, w: cardW - 0.5, h: cardH - 1.1,
      fontFace: F.body, fontSize: 12, color: C.text, valign: 'top'
    });
  });

  addFooter(s, pageNum, total);
}

// ---------- Generic Module detail slide ----------

function moduleSlide(num, name, purpose, features, pageNum, total) {
  const s = newSlide();
  addHeader(s, `MODULE ${num}`, name);

  // purpose
  s.addText(purpose, {
    x: M.l, y: 1.55, w: W - M.l - M.r, h: 0.8,
    fontFace: F.body, fontSize: 13, italic: true, color: C.muted, valign: 'top'
  });

  // features grid (2 cols)
  const startY = 2.5;
  const colGap = 0.4;
  const colW = (W - M.l - M.r - colGap) / 2;
  const rowH = 0.66;

  features.forEach((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M.l + col * (colW + colGap);
    const y = startY + row * rowH;

    // bullet dot
    s.addShape(pptx.shapes.OVAL, {
      x: x, y: y + 0.12, w: 0.08, h: 0.08,
      fill: { color: C.tan }, line: { color: C.tan, width: 0 }
    });
    s.addText([
      { text: f.label, options: { bold: true, color: C.navy } },
      { text: '  ·  ' + f.text, options: { color: C.text } }
    ], {
      x: x + 0.2, y, w: colW - 0.2, h: rowH - 0.1,
      fontFace: F.body, fontSize: 11.5, valign: 'top'
    });
  });

  addFooter(s, pageNum, total);
}

function slide5_Salon(p, t) {
  moduleSlide(1, 'Baby Salon — Bookings',
    'Let parents book online or as walk-ins, let stylists see their day, and capture payment at the counter — with each stylist’s income attributed automatically.',
    [
      { label: 'Online booking',    text: 'Pick service, date, time, and preferred stylist (or "any").' },
      { label: 'Walk-ins',          text: 'Receptionist adds walk-ins into the same live schedule.' },
      { label: 'Stylist view',      text: 'Each stylist sees only their own day and earnings.' },
      { label: 'Counter payment',   text: 'M-Pesa STK-push or cash, printed / SMS receipt.' },
      { label: 'No double-booking', text: 'System enforces slot, stylist, and service rules.' },
      { label: 'Stylist reports',   text: 'Revenue and clients per stylist — feeds HQ.' }
    ], p, t);
}

function slide6_Shop(p, t) {
  moduleSlide(2, 'Toy Shop — In-Store POS + Standalone WooCommerce',
    'Physical shop runs on our custom POS. The online store runs on a separate WooCommerce site (own auth, own checkout, own M-Pesa plugin). The POS keeps them in sync: pulls Woo orders for packing; pushes stock by SKU so we never oversell.',
    [
      { label: 'In-store POS',          text: 'Scan barcodes, take M-Pesa / cash / card, print receipt.' },
      { label: 'WooCommerce (separate)', text: 'Online catalogue, checkout, payments, delivery — all in Woo.' },
      { label: 'Order pull',            text: 'POS pulls new Woo orders every 2 min into an Online Orders tab.' },
      { label: 'Stock push',            text: 'Every stock change flows to Woo by SKU, debounced — no overselling.' },
      { label: 'Status writeback',      text: 'POS state machine writes back to Woo (processing → completed).' },
      { label: 'Inventory + reconcile', text: 'Low-stock alerts, GRN, stock-take, nightly drift report vs. Woo.' }
    ], p, t);
}

function slide7_Play(p, t) {
  moduleSlide(3, 'Play Area — Counter Tokens & Passes',
    'A counter attendant sells access to games — per-game tokens or an all-games session pass. Sessions are timed and linked to the parent account; revenue splits by game and by package.',
    [
      { label: 'Per-game tokens',   text: 'Pay for a specific game for a set duration.' },
      { label: 'All-games pass',    text: 'Flat fee (e.g., KES 1,000) for the whole day.' },
      { label: 'Session tracking',  text: 'Attendant starts and ends each session.' },
      { label: 'Child on booking',  text: 'Child’s name attached (not a separate login).' },
      { label: 'Game catalogue',    text: 'Admin maintains games, rates, and packages.' },
      { label: 'Game-level reports', text: 'Revenue by game (tokens) vs. passes — split clearly.' }
    ], p, t);
}

function slide8_Training(p, t) {
  moduleSlide(4, 'Training & Events',
    'Publish parenting classes online, accept M-Pesa booking payments, and manage attendance on the day. The same module scales up to ticketed conferences and public events.',
    [
      { label: 'Class catalogue',   text: 'Topic, trainer, price, capacity, venue.' },
      { label: 'Online booking',    text: 'Seat held only on successful M-Pesa payment.' },
      { label: 'SMS reminders',     text: 'Confirmation + reminder the day before.' },
      { label: 'Trainer check-in',  text: 'Attendee list on the day, tap to check in.' },
      { label: 'Events mode',       text: 'Tiers, promo codes, and waiting lists.' },
      { label: 'Trainer reports',   text: 'Classes, attendees, and revenue per trainer.' }
    ], p, t);
}

// ---------- Slide 9: HQ Unification ----------

function slide9_HQ(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'HQ LAYER', 'One dashboard for the whole complex');

  s.addText('The owner opens one screen and sees:', {
    x: M.l, y: 1.5, w: W - M.l - M.r, h: 0.35,
    fontFace: F.body, fontSize: 13, color: C.muted, italic: true
  });

  const stats = [
    { big: 'Live', label: 'revenue today across all 4 units' },
    { big: '#1',   label: 'top-performing stylist / game / class this week' },
    { big: 'All',  label: 'online orders, bookings, sessions in progress' },
    { big: 'Any',  label: 'number drills down to the individual transaction' }
  ];

  const gridY = 2.0;
  const gridH = 2.4;
  const gap = 0.18;
  const cardW = (W - M.l - M.r - gap * 3) / 4;
  stats.forEach((st, i) => {
    const x = M.l + (cardW + gap) * i;
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y: gridY, w: cardW, h: gridH,
      fill: { color: C.cream }, line: { color: C.divider, width: 0.5 }
    });
    s.addText(st.big, {
      x, y: gridY + 0.4, w: cardW, h: 0.9,
      fontFace: F.heading, fontSize: 34, color: C.navy, bold: true, align: 'center'
    });
    s.addShape(pptx.shapes.RECTANGLE, {
      x: x + cardW / 2 - 0.2, y: gridY + 1.35, w: 0.4, h: 0.03,
      fill: { color: C.tan }, line: { color: C.tan, width: 0 }
    });
    s.addText(st.label, {
      x: x + 0.15, y: gridY + 1.5, w: cardW - 0.3, h: 0.8,
      fontFace: F.body, fontSize: 11, color: C.text, align: 'center', valign: 'top'
    });
  });

  // tagline
  s.addText([
    { text: 'Plus:', options: { bold: true, color: C.navy } },
    { text: '  record expenses  ·  run P&L  ·  compare periods  ·  export to Excel / PDF', options: { color: C.text } }
  ], {
    x: M.l, y: gridY + gridH + 0.2, w: W - M.l - M.r, h: 0.35,
    fontFace: F.body, fontSize: 12, align: 'left', valign: 'middle'
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 10: Unified parent account ----------

function slide10_Account(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'CUSTOMER', 'One parent account. One view across everything.');

  s.addText('A parent signs up once and is known across every unit. Their full history lives in one place.', {
    x: M.l, y: 1.5, w: W - M.l - M.r, h: 0.5,
    fontFace: F.body, fontSize: 13, italic: true, color: C.muted
  });

  // centre "Parent account" circle
  const cx = W / 2;
  const cy = 3.5;
  s.addShape(pptx.shapes.OVAL, {
    x: cx - 0.95, y: cy - 0.6, w: 1.9, h: 1.2,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 }
  });
  s.addText('Parent\nAccount', {
    x: cx - 0.95, y: cy - 0.6, w: 1.9, h: 1.2,
    fontFace: F.heading, fontSize: 15, color: C.white, bold: true,
    align: 'center', valign: 'middle'
  });

  // four satellites
  const satellites = [
    { label: 'Salon history',      dx: -3.3, dy: -0.8 },
    { label: 'Shop purchases',     dx:  3.3, dy: -0.8 },
    { label: 'Play sessions',      dx: -3.3, dy:  0.8 },
    { label: 'Classes attended',   dx:  3.3, dy:  0.8 }
  ];

  satellites.forEach(sat => {
    const x = cx + sat.dx;
    const y = cy + sat.dy;
    // connecting line
    s.addShape(pptx.shapes.LINE, {
      x: cx, y: cy, w: sat.dx, h: sat.dy,
      line: { color: C.tan, width: 1 }
    });
    // small circle
    s.addShape(pptx.shapes.OVAL, {
      x: x - 0.55, y: y - 0.25, w: 1.1, h: 0.5,
      fill: { color: C.cream }, line: { color: C.tan, width: 1 }
    });
    s.addText(sat.label, {
      x: x - 0.65, y: y - 0.25, w: 1.3, h: 0.5,
      fontFace: F.body, fontSize: 10, color: C.navy, bold: true,
      align: 'center', valign: 'middle'
    });
  });

  s.addText('Children’s names are attached to bookings and sessions for record-keeping — they do not have their own logins.', {
    x: M.l, y: H - 1.1, w: W - M.l - M.r, h: 0.4,
    fontFace: F.body, fontSize: 10, italic: true, color: C.muted, align: 'center'
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 11: Payments & receipts ----------

function slide11_Payments(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'PAYMENTS', 'M-Pesa and cash — every receipt, every channel');

  const rows = [
    ['M-Pesa STK-push',      'Online checkout, salon counter, shop POS, play counter, class booking.'],
    ['Cash',                 'Supported at every staffed counter with change calculator and end-of-day cash-up.'],
    ['Receipts',             'Printed at counter, sent by SMS to the parent — ETR / eTIMS-ready when required.'],
    ['Reconciliation',       'Automatic match of M-Pesa confirmations to transactions, plus a manual rescue screen.'],
    ['Card payments (later)', 'Optional extension via Pesapal / Flutterwave when the client is ready.']
  ];

  const startY = 1.65;
  const rowH = 0.62;
  rows.forEach((r, i) => {
    const y = startY + i * rowH;
    s.addShape(pptx.shapes.RECTANGLE, {
      x: M.l, y: y + 0.08, w: 0.08, h: 0.36,
      fill: { color: C.tan }, line: { color: C.tan, width: 0 }
    });
    s.addText(r[0], {
      x: M.l + 0.2, y, w: 2.6, h: rowH - 0.1,
      fontFace: F.heading, fontSize: 14, color: C.navy, bold: true, valign: 'middle'
    });
    s.addText(r[1], {
      x: M.l + 2.9, y, w: W - M.l - M.r - 2.9, h: rowH - 0.1,
      fontFace: F.body, fontSize: 12, color: C.text, valign: 'middle'
    });
    if (i < rows.length - 1) {
      s.addShape(pptx.shapes.LINE, {
        x: M.l, y: y + rowH - 0.05, w: W - M.l - M.r, h: 0,
        line: { color: C.divider, width: 0.5 }
      });
    }
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 12: Technical approach ----------

function slide12_Tech(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'TECHNICAL', 'One codebase. Shared foundations. Progressive rollout.');

  // left column: monorepo tree
  const leftX = M.l;
  const leftW = (W - M.l - M.r) * 0.48;
  const colY = 1.55;

  s.addText('MONOREPO LAYOUT', {
    x: leftX, y: colY, w: leftW, h: 0.25,
    fontFace: F.body, fontSize: 9, color: C.tan, bold: true, charSpacing: 4
  });

  const tree = [
    '/apps/salon',
    '/apps/shop',
    '/apps/play',
    '/apps/training',
    '/apps/hq',
    '/packages/auth',
    '/packages/payments',
    '/packages/catalog',
    '/packages/reporting',
    '/packages/ui',
    '/packages/db'
  ];
  tree.forEach((t, i) => {
    s.addText(t, {
      x: leftX, y: colY + 0.3 + i * 0.23, w: leftW, h: 0.22,
      fontFace: 'Courier New', fontSize: 11, color: i < 5 ? C.navy : C.muted,
      bold: i < 5, valign: 'middle'
    });
  });

  // right column: stack notes
  const rightX = M.l + leftW + 0.4;
  const rightW = W - M.l - M.r - leftW - 0.4;

  s.addText('RECOMMENDED STACK', {
    x: rightX, y: colY, w: rightW, h: 0.25,
    fontFace: F.body, fontSize: 9, color: C.tan, bold: true, charSpacing: 4
  });

  const stack = [
    { k: 'Frontend',  v: 'Next.js · React · Tailwind' },
    { k: 'Backend',   v: 'Node.js · TypeScript APIs' },
    { k: 'Database',  v: 'PostgreSQL (single shared)' },
    { k: 'Hosting',   v: 'Cloud + on-site cache for POS' },
    { k: 'Payments',  v: 'M-Pesa Daraja (STK / B2C)' },
    { k: 'SMS',       v: 'Africa’s Talking' }
  ];
  stack.forEach((it, i) => {
    const y = colY + 0.35 + i * 0.48;
    s.addText(it.k, {
      x: rightX, y, w: 1.35, h: 0.25,
      fontFace: F.heading, fontSize: 12, color: C.navy, bold: true, valign: 'middle'
    });
    s.addText(it.v, {
      x: rightX + 1.35, y, w: rightW - 1.35, h: 0.25,
      fontFace: F.body, fontSize: 11.5, color: C.text, valign: 'middle'
    });
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 13: Phased roadmap ----------

function slide13_Roadmap(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'ROADMAP', 'Five phases. Each phase ships before the next begins.');

  const phases = [
    { p: 'P1', name: 'Foundation + Salon',           dur: '8–10 wks' },
    { p: 'P2', name: 'Toy Shop (Online + POS)',      dur: '10–12 wks' },
    { p: 'P3', name: 'Play Area',                    dur: '5–7 wks' },
    { p: 'P4', name: 'Training & Events',            dur: '5–7 wks' },
    { p: 'P5', name: 'HQ Advanced + Polish',         dur: '4–6 wks' }
  ];

  // timeline line
  const tlY = 2.8;
  const tlStart = M.l + 0.4;
  const tlEnd = W - M.r - 0.4;
  s.addShape(pptx.shapes.LINE, {
    x: tlStart, y: tlY, w: tlEnd - tlStart, h: 0,
    line: { color: C.divider, width: 1.5 }
  });

  const step = (tlEnd - tlStart) / (phases.length - 1);
  phases.forEach((ph, i) => {
    const cx = tlStart + step * i;

    // node
    s.addShape(pptx.shapes.OVAL, {
      x: cx - 0.2, y: tlY - 0.2, w: 0.4, h: 0.4,
      fill: { color: C.navy }, line: { color: C.navy, width: 0 }
    });
    s.addText(ph.p, {
      x: cx - 0.2, y: tlY - 0.2, w: 0.4, h: 0.4,
      fontFace: F.heading, fontSize: 10, color: C.white, bold: true,
      align: 'center', valign: 'middle'
    });

    // title above
    s.addText(ph.name, {
      x: cx - 1.1, y: tlY - 1.0, w: 2.2, h: 0.5,
      fontFace: F.heading, fontSize: 12, color: C.navy, bold: true,
      align: 'center', valign: 'bottom'
    });

    // duration below
    s.addText(ph.dur, {
      x: cx - 1.0, y: tlY + 0.35, w: 2.0, h: 0.3,
      fontFace: F.body, fontSize: 11, color: C.tan, bold: true,
      align: 'center', valign: 'top'
    });
  });

  // caption
  s.addText('Durations are indicative — firmed up after the requirements are signed off and open questions are resolved.', {
    x: M.l, y: H - 1.05, w: W - M.l - M.r, h: 0.4,
    fontFace: F.body, fontSize: 10, italic: true, color: C.muted, align: 'center'
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 14: What we need from you ----------

function slide14_OpenQuestions(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'OPEN QUESTIONS', 'What we need from you to move forward');

  const cols = [
    { title: 'Commercial',      items: ['Card payments now, or M-Pesa + cash only?', 'ETR / eTIMS needed at launch?', 'Loyalty / discount programme at launch?'] },
    { title: 'Operational',     items: ['Delivery zones and pricing for the shop?', 'Stylist pay model — salary, commission, or mix?', 'Single complex, or a second branch in 12 months?'] },
    { title: 'Technical',       items: ['Play-area hardware — consoles, PCs, arcade?', 'POS hardware — existing, or we supply?', 'SMS sender ID and admin email addresses?'] }
  ];

  const colGap = 0.25;
  const colW = (W - M.l - M.r - colGap * 2) / 3;
  const startY = 1.7;

  cols.forEach((c, i) => {
    const x = M.l + i * (colW + colGap);
    // accent top
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y: startY, w: 0.5, h: 0.03,
      fill: { color: C.tan }, line: { color: C.tan, width: 0 }
    });
    s.addText(c.title, {
      x, y: startY + 0.1, w: colW, h: 0.4,
      fontFace: F.heading, fontSize: 16, color: C.navy, bold: true
    });
    c.items.forEach((it, j) => {
      const y = startY + 0.6 + j * 0.7;
      s.addShape(pptx.shapes.OVAL, {
        x, y: y + 0.1, w: 0.08, h: 0.08,
        fill: { color: C.tan }, line: { color: C.tan, width: 0 }
      });
      s.addText(it, {
        x: x + 0.2, y, w: colW - 0.2, h: 0.6,
        fontFace: F.body, fontSize: 11.5, color: C.text, valign: 'top'
      });
    });
  });

  s.addText('The full list (12 items) is on page 25 of the accompanying requirements document.', {
    x: M.l, y: H - 1.05, w: W - M.l - M.r, h: 0.4,
    fontFace: F.body, fontSize: 10, italic: true, color: C.muted, align: 'center'
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 15: Next steps ----------

function slide15_NextSteps(pageNum, total) {
  const s = newSlide();
  addHeader(s, 'NEXT STEPS', 'From this deck to a working system');

  const steps = [
    { n: '1', t: 'Review',           b: 'Read the requirements document. Mark up anything that is wrong, missing, or unclear.' },
    { n: '2', t: 'Answer',           b: 'Respond to the open questions (Section 12) — by email, a short call, or on the doc.' },
    { n: '3', t: 'Sign off scope',   b: 'The updated document becomes the baseline for the project.' },
    { n: '4', t: 'Commercial offer', b: 'We submit a project cost and firm schedule against the agreed scope.' },
    { n: '5', t: 'Kick off Phase 1', b: 'Foundation and the Salon booking system enter build.' }
  ];

  const startY = 1.6;
  const rowH = 0.65;
  steps.forEach((st, i) => {
    const y = startY + i * rowH;
    // number circle
    s.addShape(pptx.shapes.OVAL, {
      x: M.l, y: y + 0.05, w: 0.48, h: 0.48,
      fill: { color: C.navy }, line: { color: C.navy, width: 0 }
    });
    s.addText(st.n, {
      x: M.l, y: y + 0.05, w: 0.48, h: 0.48,
      fontFace: F.heading, fontSize: 14, color: C.white, bold: true,
      align: 'center', valign: 'middle'
    });
    s.addText(st.t, {
      x: M.l + 0.65, y: y + 0.02, w: 2.4, h: 0.3,
      fontFace: F.heading, fontSize: 14, color: C.navy, bold: true, valign: 'top'
    });
    s.addText(st.b, {
      x: M.l + 0.65, y: y + 0.32, w: W - M.l - M.r - 0.65, h: 0.3,
      fontFace: F.body, fontSize: 11.5, color: C.text, valign: 'top'
    });
  });

  addFooter(s, pageNum, total);
}

// ---------- Slide 16: Thank you / contact ----------

function slide16_ThankYou() {
  const s = newSlide();
  s.background = { color: C.navy };

  s.addShape(pptx.shapes.RECTANGLE, {
    x: W / 2 - 0.25, y: 1.5, w: 0.5, h: 0.03,
    fill: { color: C.tan }, line: { color: C.tan, width: 0 }
  });

  s.addText('Thank you', {
    x: 0, y: 1.8, w: W, h: 0.9,
    fontFace: F.heading, fontSize: 46, color: C.white, bold: true,
    align: 'center', valign: 'middle'
  });

  s.addText('We are looking forward to building this with you.', {
    x: 0, y: 2.8, w: W, h: 0.5,
    fontFace: F.body, fontSize: 15, italic: true, color: C.light, align: 'center'
  });

  s.addText('BABYCARE-BRANDS', {
    x: 0, y: 4.0, w: W, h: 0.3,
    fontFace: F.heading, fontSize: 11, color: C.tan, bold: true, charSpacing: 6, align: 'center'
  });
  s.addText('[Your contact name]  ·  [Phone]  ·  [Email]', {
    x: 0, y: 4.3, w: W, h: 0.3,
    fontFace: F.body, fontSize: 12, color: C.white, align: 'center'
  });
}

// ---------- Build ----------

const TOTAL = 16;
slide1_Cover();
slide2_Vision(2, TOTAL);
slide3_Agenda(3, TOTAL);
slide4_FourUnits(4, TOTAL);
slide5_Salon(5, TOTAL);
slide6_Shop(6, TOTAL);
slide7_Play(7, TOTAL);
slide8_Training(8, TOTAL);
slide9_HQ(9, TOTAL);
slide10_Account(10, TOTAL);
slide11_Payments(11, TOTAL);
slide12_Tech(12, TOTAL);
slide13_Roadmap(13, TOTAL);
slide14_OpenQuestions(14, TOTAL);
slide15_NextSteps(15, TOTAL);
slide16_ThankYou();

pptx.writeFile({
  fileName: '/Users/linuxlab/Desktop/Baby-Care/BabyCare-Brands - Unified Baby Care Platform - Pitch Deck.pptx'
}).then(file => console.log('Wrote:', file));
