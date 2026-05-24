const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, UnderlineType, ShadingType, VerticalAlign, PageNumber, PageBreak
} = require('docx');

// ---------- Design tokens ----------
const COLOR = {
  primary: '1E3A5F',    // deep navy
  accent:  'B08968',    // warm tan
  text:    '1F2937',    // charcoal
  muted:   '6B7280',    // gray
  light:   'F4F1EC',    // cream
  band:    'E8E2D9',    // table header shading
  divider: 'D6D3D1',
  white:   'FFFFFF'
};

const FONT = 'Calibri'; // widely available; safely substitutes to Aptos/Arial

// ---------- Helpers ----------
const border = (color = COLOR.divider, size = 4) =>
  ({ style: BorderStyle.SINGLE, size, color });
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const cellBorders = (color = COLOR.divider) => ({
  top: border(color), bottom: border(color), left: border(color), right: border(color)
});
const allBorders = (color = COLOR.divider) => ({
  top: border(color), bottom: border(color), left: border(color), right: border(color),
  insideHorizontal: border(color), insideVertical: border(color)
});

const P = (text, opts = {}) =>
  new Paragraph({
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: 300 },
    alignment: opts.align,
    indent: opts.indent,
    children: [new TextRun({
      text,
      bold: opts.bold,
      italics: opts.italic,
      color: opts.color || COLOR.text,
      size: opts.size || 22,
      font: FONT
    })]
  });

// Rich paragraph: array of {text, bold, color, size, italic}
const RP = (runs, opts = {}) =>
  new Paragraph({
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: 300 },
    alignment: opts.align,
    children: runs.map(r => new TextRun({
      text: r.text,
      bold: r.bold,
      italics: r.italic,
      color: r.color || COLOR.text,
      size: r.size || 22,
      font: FONT
    }))
  });

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, bold: true, color: COLOR.primary, size: 36, font: FONT })],
  spacing: { before: 360, after: 200 },
  border: { bottom: { color: COLOR.accent, space: 4, style: BorderStyle.SINGLE, size: 8 } }
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [new TextRun({ text, bold: true, color: COLOR.primary, size: 28, font: FONT })],
  spacing: { before: 280, after: 140 }
});

const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun({ text, bold: true, color: COLOR.accent, size: 24, font: FONT })],
  spacing: { before: 200, after: 100 }
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  spacing: { after: 80, line: 300 },
  children: [new TextRun({ text, color: COLOR.text, size: 22, font: FONT })]
});

const bulletRich = (runs, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  spacing: { after: 80, line: 300 },
  children: runs.map(r => new TextRun({
    text: r.text, bold: r.bold, italics: r.italic,
    color: r.color || COLOR.text, size: 22, font: FONT
  }))
});

const numbered = (text, ref) => new Paragraph({
  numbering: { reference: ref, level: 0 },
  spacing: { after: 80, line: 300 },
  children: [new TextRun({ text, color: COLOR.text, size: 22, font: FONT })]
});

const spacer = (height = 200) => new Paragraph({
  spacing: { before: 0, after: height },
  children: [new TextRun({ text: '' })]
});

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// Table cell helper
const tc = (content, opts = {}) => new TableCell({
  borders: cellBorders(opts.borderColor || COLOR.divider),
  width: { size: opts.width, type: WidthType.DXA },
  shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR, color: 'auto' } : undefined,
  verticalAlign: VerticalAlign.CENTER,
  children: Array.isArray(content) ? content : [content]
});

const headerCell = (text, width) => tc(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, bold: true, color: COLOR.white, size: 22, font: FONT })]
  }),
  { width, shade: COLOR.primary, borderColor: COLOR.primary }
);

const bodyCell = (text, width, opts = {}) => tc(
  new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, color: COLOR.text, size: 20, font: FONT, bold: opts.bold })]
  }),
  { width, shade: opts.shade }
);

// Info box (single-cell table used as a callout)
const infoBox = (titleText, bodyText, shade = COLOR.light) => new Table({
  columnWidths: [9360],
  margins: { top: 180, bottom: 180, left: 280, right: 280 },
  rows: [new TableRow({ children: [new TableCell({
    borders: {
      top: border(COLOR.accent, 12),
      bottom: border(COLOR.divider, 4),
      left: border(COLOR.divider, 4),
      right: border(COLOR.divider, 4)
    },
    width: { size: 9360, type: WidthType.DXA },
    shading: { fill: shade, type: ShadingType.CLEAR, color: 'auto' },
    children: [
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: titleText, bold: true, color: COLOR.primary, size: 22, font: FONT })]
      }),
      new Paragraph({
        spacing: { after: 0, line: 300 },
        children: [new TextRun({ text: bodyText, color: COLOR.text, size: 22, font: FONT })]
      })
    ]
  })]})]
});

// ---------- Content builders ----------

function cover() {
  return [
    spacer(1600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({
        text: 'BABYCARE-BRANDS',
        bold: true, color: COLOR.accent, size: 28, font: FONT,
        characterSpacing: 120
      })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({
        text: '—', color: COLOR.accent, size: 28, font: FONT
      })]
    }),
    spacer(600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({
        text: 'Unified Baby Care Platform',
        bold: true, color: COLOR.primary, size: 64, font: FONT
      })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({
        text: 'Requirements & Functional Specification',
        color: COLOR.text, size: 32, font: FONT, italics: true
      })]
    }),
    spacer(1800),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({
        text: 'PREPARED FOR', color: COLOR.muted, size: 18, font: FONT, bold: true
      })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({
        text: '[Client Business Name]', color: COLOR.text, size: 28, font: FONT, bold: true
      })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({
        text: 'PREPARED BY', color: COLOR.muted, size: 18, font: FONT, bold: true
      })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({
        text: 'BabyCare-Brands', color: COLOR.text, size: 28, font: FONT, bold: true
      })]
    }),
    spacer(800),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'Version 1.0 · Draft · ', color: COLOR.muted, size: 20, font: FONT }),
        new TextRun({ text: '23 April 2026', color: COLOR.muted, size: 20, font: FONT })
      ]
    }),
    pageBreak()
  ];
}

function tableOfContents() {
  const row = (num, title, page) => new TableRow({
    children: [
      tc(new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({ text: num, bold: true, color: COLOR.accent, size: 22, font: FONT }),
          new TextRun({ text: '    ' + title, color: COLOR.text, size: 22, font: FONT })
        ]
      }), { width: 8200, borderColor: 'FFFFFF' }),
      tc(new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text: String(page), color: COLOR.muted, size: 22, font: FONT })]
      }), { width: 1160, borderColor: 'FFFFFF' })
    ]
  });
  const rows = [
    ['1', 'Executive Summary', 3],
    ['2', 'Business Context & Goals', 4],
    ['3', 'Users & Roles', 5],
    ['4', 'Module 1 — Salon Booking System', 6],
    ['5', 'Module 2 — Toy Shop (Online + In-Store POS)', 9],
    ['6', 'Module 3 — Play Area', 12],
    ['7', 'Module 4 — Training & Events', 14],
    ['8', 'Module 5 — HQ Unification & Reporting', 16],
    ['9', 'Cross-Cutting Requirements', 19],
    ['10', 'Technical Architecture Overview', 21],
    ['11', 'Phased Delivery Roadmap', 23],
    ['12', 'Open Questions & Decisions Needed', 25],
    ['13', 'Next Steps', 27]
  ].map(r => row(r[0], r[1], r[2]));

  return [
    H1('Table of Contents'),
    new Table({
      columnWidths: [8200, 1160],
      rows
    }),
    pageBreak()
  ];
}

function section1_ExecutiveSummary() {
  return [
    H1('1. Executive Summary'),
    P('This document describes a Unified Baby Care Platform — a single digital system that runs four distinct but complementary lines of business under one roof, and a central management layer that brings them all together for the owner.', { after: 160 }),
    P('The four business units operate independently day-to-day but share a common customer, a common product catalog, a common payment pipeline (M-Pesa and cash), and a single parent account that customers use across the entire complex.', { after: 160 }),

    H2('The Four Business Units'),
    bulletRich([
      { text: 'Baby Salon — ', bold: true, color: COLOR.primary },
      { text: 'Online and walk-in hair service bookings. Parents can pick a preferred stylist, reserve a slot, and pay at the counter. Each stylist’s earnings are tracked automatically.' }
    ]),
    bulletRich([
      { text: 'Toy Shop — ', bold: true, color: COLOR.primary },
      { text: 'In-store point-of-sale (POS) for the physical toy shop, integrated with a standalone WooCommerce online store. WooCommerce handles the online catalogue, checkout, payments, and delivery. The POS pulls Woo orders into a live queue for packing/dispatch and pushes stock-level updates back so we never oversell.' }
    ]),
    bulletRich([
      { text: 'Play Area — ', bold: true, color: COLOR.primary },
      { text: 'A video-game play zone where attendants issue tokens per session at the counter. The system supports both per-game charges and "all-games" day passes, and tracks revenue by game and by child.' }
    ]),
    bulletRich([
      { text: 'Parenting Training & Events — ', bold: true, color: COLOR.primary },
      { text: 'An online catalogue of parenting and baby-care classes that parents can book and pay for, with room to grow into ticketed public conferences and workshops.' }
    ]),

    H2('The HQ Unification Layer'),
    P('On top of the four units sits a Headquarters module reserved for management and accounting. From a single screen it answers questions like:', { after: 120 }),
    bullet('“What did each business unit earn today, this week, this month?”'),
    bullet('“Which stylist brought in the most revenue this week?”'),
    bullet('“Which game is the most profitable in the Play Area?”'),
    bullet('“What are our online vs. in-store sales for the toy shop?”'),
    bullet('“After expenses, what is the overall profit for the complex?”'),
    P('Any top-line number can be drilled down to the underlying transactions. Expenses are recorded centrally on the HQ side, and unified profit & loss reports are generated automatically.', { before: 120, after: 200 }),

    infoBox(
      'Delivery approach',
      'The system will be built on a single monorepo codebase and delivered in phases — starting with one business unit and growing progressively. This protects the budget, gets revenue-generating features live sooner, and lets us learn from each phase before committing to the next.'
    ),
    pageBreak()
  ];
}

function section2_BusinessContext() {
  return [
    H1('2. Business Context & Goals'),
    P('The vision is a single, trusted destination for everything a young family needs — a place where a parent can bring a child for a haircut, shop for toys, let the child play, and attend a parenting class, all in one visit and all managed through one platform.', { after: 160 }),

    H2('2.1 The Problem Today'),
    P('Running four overlapping businesses with four disconnected tools creates predictable pain:', { after: 120 }),
    bullet('No single view of how the complex is performing. The owner has to add up numbers manually from each unit.'),
    bullet('Customer data is fragmented. A parent known to the salon is a stranger to the shop and the play area.'),
    bullet('Stock, bookings, tokens and receipts all live in separate places, making reconciliation and accounting slow and error-prone.'),
    bullet('No reliable way to attribute revenue to a specific stylist, game, product, or class.'),

    H2('2.2 Business Goals'),
    P('The platform is built to achieve five outcomes:', { after: 120 }),
    numbered('One customer, one account — a parent signs up once and is known across all four units.', 'goals'),
    numbered('One product catalog — toys sold in-store and online share the same stock and the same prices.', 'goals'),
    numbered('One payment pipeline — every shilling collected (M-Pesa or cash, online or at the counter) flows into the same ledger.', 'goals'),
    numbered('One management dashboard — the owner and accountant see the whole business in real time, and drill into any number to the level of an individual transaction.', 'goals'),
    numbered('One system to grow — new services, new branches, and new promotions can be added without rebuilding anything.', 'goals'),

    H2('2.3 Who Benefits'),
    bulletRich([{ text: 'Parents — ', bold: true, color: COLOR.primary }, { text: 'a simpler, faster experience across every service in the complex.' }]),
    bulletRich([{ text: 'Staff — ', bold: true, color: COLOR.primary }, { text: 'clear, purpose-built screens for their specific job (stylist, cashier, attendant, trainer).' }]),
    bulletRich([{ text: 'Owners and accountants — ', bold: true, color: COLOR.primary }, { text: 'accurate, automatic, real-time reporting with full drill-down.' }]),
    pageBreak()
  ];
}

function section3_UsersAndRoles() {
  const W = [1900, 4500, 2960];
  const row = (role, desc, access) => new TableRow({
    children: [
      bodyCell(role, W[0], { bold: true, shade: COLOR.light }),
      bodyCell(desc, W[1]),
      bodyCell(access, W[2])
    ]
  });

  return [
    H1('3. Users & Roles'),
    P('The platform supports the following roles. Each role sees only the screens and data relevant to their job.', { after: 160 }),
    new Table({
      columnWidths: W,
      margins: { top: 100, bottom: 100, left: 180, right: 180 },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [headerCell('Role', W[0]), headerCell('Description', W[1]), headerCell('Typical Access', W[2])]
        }),
        row('Parent / Customer', 'End user of all four units. Creates an account, books, purchases, attends classes, pays.',
            'Self-service booking, orders, own history, own profile.'),
        row('Salon Receptionist', 'Manages the salon front desk — check-ins, walk-ins, payments at counter.',
            'Salon schedule, booking mgmt, counter payments.'),
        row('Stylist', 'Performs hair services. Sees own appointments for the day and own earnings.',
            'Own daily schedule, own performance, mark as done.'),
        row('Shop Cashier', 'Operates the toy-shop POS. Scans products, takes M-Pesa or cash, prints receipts.',
            'POS, stock lookup, end-of-day cash-up.'),
        row('Shop Order-Packer', 'Processes incoming online orders from the shop floor.',
            'Incoming order queue, pack / dispatch / fulfilled.'),
        row('Play-Area Attendant', 'Issues play tokens / day passes at the counter, starts and ends sessions.',
            'Token issuance, active sessions, session close-out.'),
        row('Trainer / Facilitator', 'Runs parenting classes. Views upcoming classes and attendee list.',
            'Own classes, attendee check-in, mark completed.'),
        row('HQ / Owner / Manager', 'Senior operator. Sees everything across all four units in real time.',
            'All dashboards, all reports, all drill-downs.'),
        row('Accountant', 'Records expenses, reconciles cash, runs the period reports.',
            'Expenses module, reports, exports.'),
        row('System Administrator', 'Manages users, permissions, products, services, staff, system settings.',
            'User mgmt, catalog mgmt, settings.')
      ]
    }),
    pageBreak()
  ];
}

function moduleIntro(number, name, purpose, users) {
  return [
    H1(`${number}. Module ${number - 3} — ${name}`),
    RP([
      { text: 'Purpose. ', bold: true, color: COLOR.primary },
      { text: purpose }
    ]),
    RP([
      { text: 'Primary users. ', bold: true, color: COLOR.primary },
      { text: users }
    ], { after: 160 })
  ];
}

function section4_Salon() {
  return [
    ...moduleIntro(
      4, 'Salon Booking System',
      'Let parents book hair services online or as walk-ins, let the receptionist manage the daily schedule, let stylists see their own appointments, and capture payments at the counter with each stylist’s income automatically attributed.',
      'Parent / Customer, Salon Receptionist, Stylist, Shop Cashier (for payments), HQ.'
    ),

    H2('4.1 Key Features'),

    H3('4.1.1 Online Booking (Parent)'),
    bullet('Parent logs in (or signs up) and opens the Salon booking page.'),
    bullet('Picks a service (e.g., Baby First Haircut, Boys Cut, Girls Wash & Style) with the price shown.'),
    bullet('Chooses a date and sees only the time slots that are actually available.'),
    bullet('Optionally selects a preferred stylist, or leaves it as "Any available stylist".'),
    bullet('Adds the child’s name (simple text field, attached to the booking).'),
    bullet('Confirms. Booking is held for a configurable window; a confirmation SMS is sent.'),
    bullet('Parent can reschedule or cancel from their account up to a cut-off (e.g., 2 hours before).'),

    H3('4.1.2 Walk-In (Receptionist)'),
    bullet('Receptionist opens the daily schedule view and can see all bookings by stylist, by hour.'),
    bullet('For a walk-in customer, the receptionist searches by phone number (or creates a new parent record on the spot).'),
    bullet('Assigns a stylist, a service, and a time — system prevents double-booking.'),
    bullet('Walk-in is added to the queue and the stylist’s schedule updates immediately.'),

    H3('4.1.3 Stylist View'),
    bullet('Each stylist signs in and sees only their own day: upcoming appointments, completed ones, and breaks.'),
    bullet('Can mark a service as In Progress / Completed / No-show.'),
    bullet('Sees their weekly/monthly earned commission (if commission structure is enabled).'),

    H3('4.1.4 Payment (Counter)'),
    bullet('After the service is complete, the customer pays at the counter.'),
    bullet('Cashier opens the booking, chooses M-Pesa (STK-push) or cash, captures payment, prints or SMSs the receipt.'),
    bullet('The system links the paid booking to the stylist who performed it — this is the basis for stylist-level reporting.'),

    H2('4.2 Business Rules'),
    bullet('A stylist cannot be booked twice in the same slot.'),
    bullet('A service cannot be started before payment is expected — the counter workflow is enforced by the system.'),
    bullet('Cancellations after the cut-off may be configured to trigger a partial fee or just a warning.'),
    bullet('A booking can be reassigned between stylists by the receptionist with an audit trail kept.'),

    H2('4.3 Data Captured Per Booking'),
    P('Every completed booking records: date & time, service, price, stylist, parent account, child name, payment method, payment reference (M-Pesa code if applicable), receptionist, and any notes. This is what the salon reports draw from.', { after: 160 }),

    H2('4.4 Salon Reports (feed into HQ)'),
    bullet('Today’s bookings, revenue, and completed vs. no-shows.'),
    bullet('Revenue by stylist (day / week / month), number of clients served, average ticket size.'),
    bullet('Service mix — which services are bringing in the most revenue.'),
    bullet('Parent retention — first-time vs. returning customers.'),
    pageBreak()
  ];
}

function section5_Shop() {
  return [
    ...moduleIntro(
      5, 'Toy Shop (In-Store POS + Standalone WooCommerce Online Store)',
      'The physical toy shop runs on our custom in-store POS app. The online toy shop runs on a standalone WooCommerce site (separate hosting, own auth, own checkout, own M-Pesa plugin) which is NOT part of this custom build. The POS keeps WooCommerce in sync by pulling online orders for dispatch and pushing stock-level updates by SKU, so we never oversell.',
      'Parent / Customer (online, in WooCommerce), Shop Cashier (POS), Shop Order-Packer, System Administrator (catalog + sync config), HQ.'
    ),

    H2('5.1 Product Catalogue (custom platform)'),
    P('The local product record is the source of truth for inventory used by the POS. Each product has:', { after: 120 }),
    bullet('Name, description, category, brand.'),
    bullet('SKU (the join key to WooCommerce), barcode (for POS scanning).'),
    bullet('Price, tax treatment, optional discount.'),
    bullet('Available stock quantity (decremented by POS sales; pushed to Woo on every change).'),
    bullet('woo_product_id — optional mapping field linking the local SKU to a Woo product. Missing mapping means the item is "in-store only" and is not pushed to Woo.'),

    H2('5.2 In-Store POS'),
    bullet('Runs on a tablet or PC at the shop counter.'),
    bullet('Cashier scans a barcode (or searches by name); product is added to the sale.'),
    bullet('Supports multiple items per sale, quantity adjustment, line discounts, and overall discount.'),
    bullet('Payment: M-Pesa (STK-push with auto-matching), cash with change calculation, Paystack card, or wallet.'),
    bullet('Printable receipt + optional SMS receipt.'),
    bullet('Stock is decremented in real time and pushed to WooCommerce so the online store reflects the new quantity within seconds.'),
    bullet('End-of-day cash-up screen: expected vs. counted cash, M-Pesa total, variance.'),

    H2('5.3 Online Storefront (WooCommerce — separate system)'),
    bullet('Standalone WooCommerce site at shop.babymilestones.example with its own hosting, admin, and database.'),
    bullet('Customer accounts are managed by WooCommerce only — no SSO with the custom platform.'),
    bullet('Checkout, payments (M-Pesa via Woo plugin, card via Woo plugin), and customer notifications are all handled by WooCommerce. Our platform does not send SMS for online orders.'),
    bullet('Loyalty points are NOT earned or redeemed on online purchases (loyalty applies only to bookings and in-store POS sales in the custom platform).'),
    bullet('Delivery zones / methods are configured inside WooCommerce; the chosen method comes through on the order pull and is printed on the packing slip.'),

    H2('5.4 Live Order Queue (POS Online-Orders tab — pulled from WooCommerce)'),
    P('A scheduled sync (default every 2 minutes) pulls new and updated WooCommerce orders into a local mirror so they appear in a second tab inside the POS:', { after: 120 }),
    bullet('New orders appear at the top of the queue, with a soft alert tone (optional).'),
    bullet('Order card shows items, quantities, customer name + phone, shipping method, payment status (read from Woo).'),
    bullet('Status flow: New → Being Packed → Ready → Dispatched → Fulfilled. Each transition is written back to WooCommerce (processing / completed / cancelled) so the customer sees the right status in their Woo account.'),
    bullet('Dispatched orders can capture a rider name / vehicle reg, appended as a Woo order note.'),
    bullet('Failed writebacks are retried with exponential backoff; permanent failures land in a dead-letter view in the admin for manual handling.'),

    H2('5.5 Inventory'),
    bullet('POS is the single source of truth for inventory. Stock is a single number per SKU, updated by POS sales, manual adjustments, GRN, and stock-take.'),
    bullet('Every change pushes the new stock quantity to the matching WooCommerce product by SKU (debounced per-SKU to collapse bursts).'),
    bullet('Low-stock alerts: a configurable threshold per product — triggers a dashboard flag and (optionally) an email to the administrator.'),
    bullet('Goods-received-note workflow: administrator enters quantities when new stock arrives, with unit cost captured for margin reporting.'),
    bullet('Stock-take mode: a scheduled count against system quantity, producing a reconciled variance report.'),
    bullet('Nightly reconciliation: compares local stock with Woo stock per mapped SKU; flags any drift in admin.'),

    H2('5.6 Shop Reports (feed into HQ)'),
    bullet('In-store sales reports come from the custom POS (top products, cashier performance, margin, stock on hand).'),
    bullet('Online sales reports come from WooCommerce admin (not consolidated into HQ at launch).'),
    bullet('The HQ dashboard surfaces a "Sync health" tile: last pull time, queue depth, dead-letter count.'),
    bullet('Low-stock list and stock value are reported from the custom platform (single source of truth).'),
    pageBreak()
  ];
}

function section6_Play() {
  return [
    ...moduleIntro(
      6, 'Play Area',
      'Let a counter attendant sell access to video games — either as a single-game token or as an all-games session pass — track who is playing what for how long, and reconcile revenue by game and by child at end of day.',
      'Parent / Customer (at counter), Play-Area Attendant, HQ.'
    ),

    H2('6.1 The Charging Model'),
    P('Two ways for a parent to pay:', { after: 120 }),
    bulletRich([{ text: 'Per-game token — ', bold: true, color: COLOR.primary }, { text: 'pays for a specific game for a set duration (e.g., 30 minutes of Racing). Cheaper per session; revenue is attributed to that game.' }]),
    bulletRich([{ text: 'Session Pass (e.g., KES 1,000 all-games) — ', bold: true, color: COLOR.primary }, { text: 'flat fee to play any game for the session. Revenue is attributed to the "All-Games Pass" bucket and NOT to any individual game.' }]),

    H2('6.2 Counter Workflow (Attendant)'),
    bullet('Parent arrives at the play counter. Attendant searches parent by phone number (or registers them on the spot).'),
    bullet('Attendant asks child’s name (text field, attached to the session) and picks the package:'),
    bullet('  – Per-game: choose the game + duration, system shows price.', 1),
    bullet('  – Session pass: choose the pass (e.g., "Day Pass — All Games — KES 1,000").', 1),
    bullet('Payment: M-Pesa or cash. A printed / SMS ticket with a session code is issued.'),
    bullet('Attendant presses "Start Session" — system records the start time.'),
    bullet('When the child is done (or time elapses), attendant presses "End Session" — duration is logged.'),

    H2('6.3 Game Catalogue'),
    bullet('Administrator maintains a list of games (name, console/station, per-minute or flat rate, image).'),
    bullet('Each game has an Active / Inactive flag.'),
    bullet('System supports adding a new game at any time — immediately available to the attendant.'),

    H2('6.4 Package Catalogue'),
    bullet('Administrator configures packages: name, price, scope (single game or all games), duration.'),
    bullet('Examples: "Racing — 30 min — KES 200", "All-Games Day Pass — KES 1,000", "Weekend Family Pass — 2 children — KES 1,500".'),

    H2('6.5 Data Captured Per Session'),
    P('Every play session records: parent account, child name, package purchased, game (or "All Games"), start time, end time, duration, attendant, payment method, payment reference, and any notes.', { after: 160 }),

    H2('6.6 Play Reports (feed into HQ)'),
    bullet('Revenue by game (only counts per-game tokens).'),
    bullet('Revenue by package type (per-game vs. all-games pass split).'),
    bullet('Revenue by child / by parent — "top players" leaderboard.'),
    bullet('Peak hours and peak days heatmap.'),
    bullet('Attendant performance (sessions sold, revenue handled).'),

    infoBox(
      'Why we split game-level revenue from package revenue',
      'When a parent buys the "All-Games Pass", the child may play five different games. Allocating that KES 1,000 across the five would distort per-game economics. The report therefore shows game-level revenue (from tokens) separately from package revenue. This was the customer’s explicit preference.'
    ),
    pageBreak()
  ];
}

function section7_Training() {
  return [
    ...moduleIntro(
      7, 'Training & Events',
      'Publish a catalogue of parenting / baby-care classes, let parents browse and book online, accept M-Pesa payment at booking time, and manage attendance on the day. The same module also supports occasional larger ticketed events and conferences.',
      'Parent / Customer, Trainer / Facilitator, System Administrator, HQ.'
    ),

    H2('7.1 Class Catalogue'),
    bullet('Administrator creates a class: name, description, trainer, topic area (e.g., Newborn Care, Feeding & Nutrition, Sleep Training, First Aid, Infant Development).'),
    bullet('Schedule: fixed session date & time OR a recurring series.'),
    bullet('Capacity (number of seats), price per parent, location / venue or online link.'),
    bullet('Optional: requires a specific child age range.'),

    H2('7.2 Public Booking (Parent)'),
    bullet('Parent browses upcoming classes on the public site (or from their logged-in dashboard).'),
    bullet('Picks a class, sees remaining seats, and books.'),
    bullet('Payment: M-Pesa STK-push at booking time — seat is only held on successful payment.'),
    bullet('Receives a confirmation SMS with session details and a reminder SMS the day before (configurable lead time).'),

    H2('7.3 Attendance (Trainer)'),
    bullet('On the day of the class, the trainer opens their session and sees the attendee list.'),
    bullet('Check-in by tap (or by searching the parent’s name).'),
    bullet('Trainer marks the class as Completed at the end, which unlocks the post-session follow-up (e.g., SMS thank-you, optional follow-up resource).'),

    H2('7.4 Events & Conferences (future-ready)'),
    P('The same underlying mechanism supports larger public events. An administrator can mark a class as "Event" to unlock:', { after: 120 }),
    bullet('Multi-tier pricing (Early Bird, Regular, VIP).'),
    bullet('Discount codes / promo codes.'),
    bullet('Waiting list once capacity is reached.'),
    bullet('Bulk SMS announcement to past attendees of similar events.'),
    bullet('Optional paid sponsors listed on the event page.'),

    H2('7.5 Training & Events Reports (feed into HQ)'),
    bullet('Revenue per class / per event.'),
    bullet('Attendance rate (booked vs. showed-up).'),
    bullet('Trainer performance — classes delivered, parents served, revenue.'),
    bullet('Repeat attendance — which parents come back for more classes.'),
    pageBreak()
  ];
}

function section8_HQ() {
  return [
    H1('8. Module 5 — HQ Unification & Reporting'),
    P('The HQ module is the reason the platform exists. Everything the four units do flows here. It is where the owner and accountant run the business.', { after: 160 }),

    H2('8.1 The Unified Dashboard'),
    P('A single home screen answers the most common questions instantly:', { after: 120 }),
    bullet('Today’s total revenue (and how it splits across Salon, Shop, Play Area, Training).'),
    bullet('Today’s in-store toy-shop revenue (online toy revenue lives in the WooCommerce admin, separate system).'),
    bullet('Top-performing stylist today / this week.'),
    bullet('Top-earning game today / this week (plus all-games-pass total).'),
    bullet('Active bookings (salon, training) and pending online orders pulled from WooCommerce into the POS queue — live numbers.'),
    bullet('Alerts: low stock, unusually low or high revenue, failed payments.'),

    H2('8.2 Drill-Down'),
    P('Any number on the dashboard is clickable. One click goes from a top-line total all the way down to the individual transaction — with the customer, product/service, staff member, time, and payment reference visible.', { after: 160 }),

    H2('8.3 Reports by Unit'),

    H3('8.3.1 Salon Reports'),
    bullet('Revenue by day, week, month.'),
    bullet('Revenue per stylist (with ranking).'),
    bullet('Service mix — what customers are spending on.'),
    bullet('Return-customer rate.'),

    H3('8.3.2 Shop Reports'),
    bullet('Revenue online vs. in-store.'),
    bullet('Top products, top categories.'),
    bullet('Margin by product (sale price − cost price).'),
    bullet('Stock on hand, stock value, low-stock list.'),
    bullet('Cashier performance.'),

    H3('8.3.3 Play Area Reports'),
    bullet('Revenue by game (tokens).'),
    bullet('Revenue by package (tokens vs. all-games passes).'),
    bullet('Revenue by player / parent.'),
    bullet('Peak hours, peak days.'),
    bullet('Attendant performance.'),

    H3('8.3.4 Training & Events Reports'),
    bullet('Revenue by class / event.'),
    bullet('Attendance and drop-off.'),
    bullet('Trainer performance.'),
    bullet('Repeat parent attendance.'),

    H2('8.4 Expense Management'),
    P('Expenses are recorded centrally on the HQ side (not inside the individual business-unit apps).', { after: 120 }),
    bullet('Accountant creates expense records with: date, category (rent, salaries, utilities, stock purchases, marketing, etc.), business unit it relates to (or "shared"), amount, payment method, reference, and an optional receipt attachment.'),
    bullet('Expenses can be recurring (e.g., monthly rent auto-created on the 1st).'),
    bullet('Expenses per unit flow into the unit’s net-profit view.'),

    H2('8.5 Unified Profit & Loss'),
    P('The system generates a consolidated P&L by period:', { after: 120 }),
    bullet('Revenue per unit, revenue total.'),
    bullet('Direct costs (cost of goods sold for the shop).'),
    bullet('Expenses per unit, expenses shared, expenses total.'),
    bullet('Net profit per unit, net profit total.'),
    bullet('Period comparison: this month vs. last month, this year vs. last year.'),

    H2('8.6 Exports'),
    P('All reports can be exported as PDF (for sharing) and Excel / CSV (for accounting).', { after: 160 }),

    infoBox(
      'Everything is auditable',
      'Every transaction, every status change, and every expense record is logged with who did it and when. Reports are never "just a number" — you can always trace it back to the source event.'
    ),
    pageBreak()
  ];
}

function section9_CrossCutting() {
  return [
    H1('9. Cross-Cutting Requirements'),
    P('These are the capabilities that apply across every module.', { after: 160 }),

    H2('9.1 Unified Parent Account'),
    bullet('One parent account (phone number + PIN / password) is used across Salon, Shop, Play Area, and Training.'),
    bullet('Account shows unified history: past haircuts, past purchases, past play sessions, past classes attended.'),
    bullet('Parent can register children’s names on their profile; these names are used when creating bookings and sessions but are not separate logins.'),
    bullet('Password reset by SMS one-time code.'),

    H2('9.2 Payments'),
    bulletRich([{ text: 'M-Pesa STK-push ', bold: true, color: COLOR.primary }, { text: 'is the primary digital payment method. The system prompts the customer’s phone and confirms payment automatically before proceeding.' }]),
    bulletRich([{ text: 'Cash ', bold: true, color: COLOR.primary }, { text: 'is supported at every counter with a change calculator and an end-of-day cash-up workflow per till.' }]),
    bullet('Failed or cancelled M-Pesa transactions are clearly shown; the workflow does not advance until payment succeeds.'),
    bullet('Manual reconciliation screen for rare cases where M-Pesa confirms but the system missed it.'),

    H2('9.3 Notifications'),
    bullet('SMS: booking confirmations, reminders (salon, classes), online order status updates, payment receipts.'),
    bullet('In-app: staff alerts (new online order, low stock, failed payment).'),
    bullet('Every SMS template is editable from the admin panel.'),

    H2('9.4 Receipts & Kenya Tax'),
    bullet('Every paid transaction generates a receipt (print + SMS).'),
    bullet('The receipt format supports Kenya ETR / eTIMS-compliant printing when the client is ready; integration with an ETR device / KRA eTIMS is treated as a tracked open question (see Section 12).'),
    bullet('VAT treatment is configurable per product / service.'),

    H2('9.5 Roles & Permissions'),
    bullet('Every staff user is assigned one or more roles (as described in Section 3).'),
    bullet('A role defines which screens the user can open and which actions they can perform (view, create, edit, delete, refund).'),
    bullet('Sensitive actions (refunds, voids, price overrides, expense deletion) require an authorised role.'),

    H2('9.6 Audit Log'),
    bullet('Every create, update, and delete across the system is logged with user, timestamp, screen, and before/after values.'),
    bullet('The owner can review the audit log from the HQ module.'),

    H2('9.7 Data Backup & Recovery'),
    bullet('Automated daily backup of the database to a separate location.'),
    bullet('Retention policy (e.g., 30 daily, 12 monthly) configurable by the administrator.'),
    bullet('Restore procedure documented and tested during commissioning.'),

    H2('9.8 Security Essentials'),
    bullet('All web traffic over HTTPS.'),
    bullet('Passwords stored as salted hashes; optional 2-factor for admin roles.'),
    bullet('Session timeout on idle terminals (POS, HQ) to protect unattended tills.'),
    bullet('M-Pesa credentials and other secrets stored encrypted, not in source code.'),
    pageBreak()
  ];
}

function section10_TechArch() {
  return [
    H1('10. Technical Architecture Overview'),
    P('A short, non-exhaustive summary of the technical shape of the system — included so the technical reader can see how the pieces fit.', { after: 160 }),

    H2('10.1 Monorepo Structure'),
    P('One repository, clearly sub-divided:', { after: 120 }),
    bullet('/apps/salon — the salon booking web & staff UI.'),
    bullet('/apps/pos — in-store POS for the toy shop, including WooCommerce sync (pulls online orders, pushes stock by SKU). The public online storefront itself runs separately on WooCommerce and is not in this monorepo.'),
    bullet('/apps/play — play-area counter UI and session tracking.'),
    bullet('/apps/training — class catalogue, public booking site, trainer UI.'),
    bullet('/apps/hq — HQ dashboards, expenses, reports.'),
    bullet('/packages/auth — the unified parent account & staff auth.'),
    bullet('/packages/payments — M-Pesa integration and cash reconciliation.'),
    bullet('/packages/catalog — the single product & service catalog.'),
    bullet('/packages/reporting — shared reporting engine & exports.'),
    bullet('/packages/ui — shared design system (buttons, tables, forms, etc.).'),
    bullet('/packages/db — the single shared database schema.'),

    H2('10.2 Recommended Stack'),
    P('Pragmatic, proven, and hireable in the Kenyan market:', { after: 120 }),
    bulletRich([{ text: 'Frontend — ', bold: true, color: COLOR.primary }, { text: 'Next.js (React) with Tailwind CSS. Mobile-responsive by default, fast on feature-phone-class networks.' }]),
    bulletRich([{ text: 'Backend — ', bold: true, color: COLOR.primary }, { text: 'Node.js (TypeScript) API, one deployable per app sharing the same packages.' }]),
    bulletRich([{ text: 'Database — ', bold: true, color: COLOR.primary }, { text: 'PostgreSQL. One logical database with schemas-per-unit keeps the reporting joins simple.' }]),
    bulletRich([{ text: 'Hosting — ', bold: true, color: COLOR.primary }, { text: 'Cloud-hosted (AWS / DigitalOcean) with a local on-site cache so the in-store POS can keep taking cash sales during internet outages and sync when the link is restored.' }]),
    bulletRich([{ text: 'Payments — ', bold: true, color: COLOR.primary }, { text: 'M-Pesa Daraja API (STK-push, B2C, Callback URLs).' }]),
    bulletRich([{ text: 'SMS — ', bold: true, color: COLOR.primary }, { text: 'Africa’s Talking (or equivalent) for transactional SMS.' }]),

    H2('10.3 Why a Monorepo'),
    bullet('Shared code — auth, payments, catalog — is written once and reused across every unit.'),
    bullet('One database schema means cross-unit reports (the HQ layer) are simple, accurate, and fast.'),
    bullet('Releases across units stay coordinated, preventing "my app still uses the old product table" type bugs.'),
    bullet('New features for one unit can immediately benefit the others without duplication.'),

    H2('10.4 Non-Functional Targets'),
    bullet('Page load under 3 seconds on a 4G connection.'),
    bullet('POS transaction (scan, price, pay, receipt) under 10 seconds.'),
    bullet('99.5% uptime target during business hours.'),
    bullet('Graceful offline mode at the in-store POS for cash sales.'),
    pageBreak()
  ];
}

function section11_Roadmap() {
  const W = [1400, 2800, 3500, 1660];
  const row = (phase, title, scope, duration, shade = undefined) => new TableRow({
    children: [
      bodyCell(phase, W[0], { bold: true, shade: shade || COLOR.light }),
      bodyCell(title, W[1], { bold: true }),
      bodyCell(scope, W[2]),
      bodyCell(duration, W[3])
    ]
  });

  return [
    H1('11. Phased Delivery Roadmap'),
    P('The system is large. It will be delivered in clear phases, each ending in a working, usable product. Every phase is small enough to review, approve, and go live before the next one begins.', { after: 160 }),

    new Table({
      columnWidths: W,
      margins: { top: 100, bottom: 100, left: 180, right: 180 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell('Phase', W[0]),
          headerCell('Title', W[1]),
          headerCell('Scope', W[2]),
          headerCell('Indicative Duration', W[3])
        ]}),
        row('Phase 1', 'Foundation + Salon',
            'Monorepo setup; unified parent account; staff roles; M-Pesa integration; salon booking (online + walk-in + counter payment); basic HQ dashboard with Salon reports only.',
            '8–10 weeks'),
        row('Phase 2', 'Toy Shop (In-Store POS + WooCommerce sync)',
            'In-store POS for the toy shop; product catalogue + inventory in the custom platform; WooCommerce site provisioned separately (out of custom scope); sync layer pulls Woo orders into the POS queue, pushes stock by SKU; low-stock alerts; in-store reports in HQ.',
            '6–8 weeks'),
        row('Phase 3', 'Play Area',
            'Game & package catalogue; counter token / session-pass workflow; session tracking; Play reports in HQ (per-game and per-package splits).',
            '5–7 weeks'),
        row('Phase 4', 'Training & Events',
            'Class catalogue; public booking + M-Pesa checkout; trainer attendance screens; reminders; Training reports in HQ. Event/conference extras built as toggles.',
            '5–7 weeks'),
        row('Phase 5', 'HQ Advanced + Polish',
            'Expense module; unified P&L; period comparisons; exports (PDF/Excel); audit log review UI; security hardening; loyalty-ready (future).',
            '4–6 weeks')
      ]
    }),

    H2('11.1 Why This Order'),
    bullet('The Salon is the simplest unit to ship — a fast, high-impact first win.'),
    bullet('Phase 1 also builds the foundations (parent account, payments, roles, HQ shell) that every later phase will reuse.'),
    bullet('The Shop is delivered second because it benefits from a solid foundation; with the online storefront now on standalone WooCommerce, the custom scope here is the in-store POS plus a thin sync layer to Woo.'),
    bullet('Play Area and Training are self-contained and can be delivered in either order after Phase 2 — shown here as Phase 3 and 4 by default.'),
    bullet('Phase 5 concentrates the "unification" and polish work that is most valuable once all four units are live.'),

    infoBox(
      'Durations are indicative, not fixed',
      'The durations above are a professional estimate based on the scope described in this document. They will be refined into a firm project plan after the client confirms the requirements, open questions are resolved (Section 12), and the commercial proposal is agreed.'
    ),
    pageBreak()
  ];
}

function section12_OpenQuestions() {
  const items = [
    ['Card payments', 'Do you want online card payments (Visa / Mastercard) added in Phase 2 alongside M-Pesa — via Pesapal / Flutterwave / similar — or strictly M-Pesa and cash only for now?'],
    ['ETR / KRA eTIMS', 'Do you need KRA-compliant receipts (ETR/eTIMS) from day one, or can the system start with standard receipts and add ETR integration at a defined point?'],
    ['Delivery zones', 'For online toy-shop orders, delivery zones and pricing are configured inside WooCommerce (Woo shipping zones / methods + plugin). Decision still needed: in-house rider vs. courier (Sendy, Glovo, Pickup Mtaani), and which Woo shipping plugin to install.'],
    ['Commission structure', 'Do stylists earn a fixed salary, a commission per service, or a mix? The system can support either; we need the rules.'],
    ['Loyalty / discounts', 'Any parent loyalty programme at launch (e.g., every 10th haircut free, points across units)? Or added later?'],
    ['Data migration', 'Is there existing customer, product, or booking data in any tool today that must be migrated into the new system, or will we start clean?'],
    ['Number of sites', 'The specification assumes a single physical complex. If a second branch is planned in the next 12 months, we will design the data model for multi-branch from day one.'],
    ['POS hardware', 'Receipt printer preference (thermal 80mm is typical), barcode scanner model, cash drawer — do you have existing hardware, or should we specify and supply?'],
    ['Play-area hardware', 'Are games run on consoles (PS/Xbox), PCs, or arcade cabinets? This affects the attendant session-start workflow.'],
    ['Training location', 'Will classes be held on-site, online (Zoom/Google Meet link), or both? Affects check-in vs. virtual attendance.'],
    ['Admin email / SMS sender', 'The SMS sender ID and any noreply@ email address we should register for the platform.'],
    ['Branding assets', 'Logo files (SVG/PNG), brand colors, and any existing domain name(s) the platform should live under.']
  ];

  const W = [2700, 6660];
  const row = (title, question) => new TableRow({
    children: [
      bodyCell(title, W[0], { bold: true, shade: COLOR.light }),
      bodyCell(question, W[1])
    ]
  });

  return [
    H1('12. Open Questions & Decisions Needed'),
    P('The items below are decisions only the client can make. Each one affects scope, cost, or timeline. A short answer next to each is all that is needed to move forward.', { after: 160 }),

    new Table({
      columnWidths: W,
      margins: { top: 100, bottom: 100, left: 180, right: 180 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell('Topic', W[0]),
          headerCell('Question', W[1])
        ]}),
        ...items.map(i => row(i[0], i[1]))
      ]
    }),
    pageBreak()
  ];
}

function section13_NextSteps() {
  return [
    H1('13. Next Steps'),
    P('We propose the following next steps to move from this requirements document to a working system:', { after: 120 }),

    numbered('Client review of this document — confirm that every module describes the business correctly. Mark up anything that is wrong, missing, or unclear.', 'nextsteps'),
    numbered('Answer the open questions in Section 12 — by email, a short call, or directly on the document.', 'nextsteps'),
    numbered('Sign-off of the agreed scope — this document, with revisions, becomes the baseline for the project.', 'nextsteps'),
    numbered('Commercial proposal — BabyCare-Brands submits a project cost and a firm schedule against the signed-off scope.', 'nextsteps'),
    numbered('Kick-off of Phase 1 — foundation and the Salon booking system go into build.', 'nextsteps'),

    spacer(300),

    infoBox(
      'Thank you',
      'Thank you for the opportunity to help shape this system. The vision of one trusted, modern platform running an entire baby care complex is a strong one, and we are looking forward to building it with you.'
    ),

    spacer(400),

    RP([
      { text: 'BabyCare-Brands\n', bold: true, color: COLOR.primary, size: 24 }
    ]),
    P('[Your contact name]', { color: COLOR.text }),
    P('[Phone]  ·  [Email]', { color: COLOR.muted })
  ];
}

// ---------- Assemble document ----------

const doc = new Document({
  creator: 'BabyCare-Brands',
  title: 'Unified Baby Care Platform — Requirements & Functional Specification',
  description: 'Requirements and functional specification for the Unified Baby Care Platform.',
  styles: {
    default: { document: { run: { font: FONT, size: 22, color: COLOR.text } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal',
        run: { size: 64, bold: true, color: COLOR.primary, font: FONT },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, color: COLOR.primary, font: FONT },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, color: COLOR.primary, font: FONT },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, color: COLOR.accent, font: FONT },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } }
    ]
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 900, hanging: 270 } } } }
        ] },
      { reference: 'goals',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: 'nextsteps',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }
    ]
  },
  sections: [{
    properties: {
      page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0 },
          children: [
            new TextRun({ text: 'BabyCare-Brands', bold: true, color: COLOR.primary, size: 18, font: FONT }),
            new TextRun({ text: '  ·  Unified Baby Care Platform', color: COLOR.muted, size: 18, font: FONT })
          ]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Requirements & Functional Specification  ·  v1.0 Draft  ·  Page ', color: COLOR.muted, size: 18, font: FONT }),
            new TextRun({ children: [PageNumber.CURRENT], color: COLOR.muted, size: 18, font: FONT }),
            new TextRun({ text: ' of ', color: COLOR.muted, size: 18, font: FONT }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], color: COLOR.muted, size: 18, font: FONT })
          ]
        })]
      })
    },
    children: [
      ...cover(),
      ...tableOfContents(),
      ...section1_ExecutiveSummary(),
      ...section2_BusinessContext(),
      ...section3_UsersAndRoles(),
      ...section4_Salon(),
      ...section5_Shop(),
      ...section6_Play(),
      ...section7_Training(),
      ...section8_HQ(),
      ...section9_CrossCutting(),
      ...section10_TechArch(),
      ...section11_Roadmap(),
      ...section12_OpenQuestions(),
      ...section13_NextSteps()
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = '/Users/linuxlab/Desktop/Baby-Care/BabyCare-Brands - Unified Baby Care Platform - Requirements & Functional Specification.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('Wrote:', outPath, '(' + buffer.length + ' bytes)');
});
