// Pure pricing engine: computeQuote, integer pesos, formula breakdowns.

export const PRICING_DEFAULTS = {
  minPax: 75,
  underMinFlat: 15000,
  guestsPerRoundTable: 5,
  softMaxPax: 500,
  downpaymentPercent: 50,
  weddingSurchargePerHead: 20,
  levels: [
    { level: 1, name: "Food Package 1", perHead: 250, dishes: 4, slots: [["chicken", "fish"], ["beef", "pork"], ["pasta"], ["vegetables"]] },
    { level: 2, name: "Food Package 2", perHead: 270, dishes: 5, slots: [["chicken"], ["fish"], ["beef", "pork"], ["pasta"], ["vegetables"]] },
    { level: 3, name: "Food Package 3", perHead: 300, dishes: 6, slots: [["chicken"], ["fish"], ["beef"], ["pork"], ["pasta"], ["vegetables"]] }
  ],
  cateringInclusions: [
    "Utensils", "Waiters", "Food attendants", "Ice", "Java or plain rice", "Tables and chairs", "Basic set up", "Dessert", "Drinks"
  ],
  allIn: {
    baseLevel: 1,
    bundles: [
      {
        id: "party",
        name: "Party Package",
        forEvents: ["party", "birthday", "corporate", "reunion", "other"],
        price: 55000,
        basePax: 100,
        extraPerHead: 250,
        inclusions: [
          "Catering service",
          "Stage set up (styro name, character, wooden chair, balloon decoration, entrance arc)",
          "Clown (puppet and magician)",
          "Photobooth (3 hours unlimited shots with laminated copy)",
          "Basic lights and sounds",
          "Cake and 1 dozen cupcakes",
          "Photographer",
          "Host"
        ]
      },
      {
        id: "wedding",
        name: "Wedding Package",
        forEvents: ["wedding"],
        price: 55000,
        basePax: 100,
        extraPerHead: 280,
        inclusions: [
          "Catering service",
          "Stage set up (styro name, character, couch, entrance arc)",
          "Presidential table",
          "Photobooth (3 hours unlimited shots)",
          "Invitation (20 pcs)",
          "Basic lights and sounds",
          "Cake and 1 dozen cupcakes",
          "Photographer",
          "Host"
        ]
      }
    ]
  },
  componentEstimates: {
    catering: 25000,
    stageStandard: 5000,
    stageCompany: 3000,
    stageReunion: 4000,
    clown: 4000,
    photobooth: 5000,
    lightsAndSounds: 4000,
    cakeCupcakes: 3000,
    photographer: 5000,
    host: 4000
  },
  eventPackages: [
    {
      id: "wedding",
      name: "Wedding Package",
      occasion: "wedding",
      price: 55000,
      basePax: 100,
      extraPerHead: 280,
      priceStatus: "confirmed",
      inclusions: [
        "Catering service",
        "Stage set up (styro name, character, couch, entrance arc)",
        "Presidential table",
        "Photobooth (3 hours unlimited shots)",
        "Invitation (20 pcs)",
        "Basic lights and sounds",
        "Cake and 1 dozen cupcakes",
        "Photographer",
        "Host"
      ]
    },
    {
      id: "party",
      name: "Party Package",
      occasion: "party",
      price: 55000,
      basePax: 100,
      extraPerHead: 250,
      priceStatus: "confirmed",
      inclusions: [
        "Catering service",
        "Stage set up (styro name, character, wooden chair, balloon decoration, entrance arc)",
        "Clown (puppet and magician)",
        "Photobooth (3 hours unlimited shots with laminated copy)",
        "Basic lights and sounds",
        "Cake and 1 dozen cupcakes",
        "Photographer",
        "Host"
      ]
    },
    {
      id: "birthday",
      name: "Birthday Package",
      occasion: "birthday",
      price: 50000,
      basePax: 100,
      extraPerHead: 250,
      priceStatus: "estimate",
      inclusions: [
        "Catering service",
        "Stage set up (styro name, character, wooden chair, balloon decoration, entrance arc)",
        "Clown (puppet and magician)",
        "Photobooth (3 hours unlimited shots with laminated copy)",
        "Basic lights and sounds",
        "Cake and 1 dozen cupcakes",
        "Host"
      ]
    },
    {
      id: "corporate",
      name: "Corporate Package",
      occasion: "corporate",
      price: 41000,
      basePax: 100,
      extraPerHead: 250,
      priceStatus: "estimate",
      inclusions: [
        "Catering service",
        "Stage set up (company name board and entrance arc)",
        "Basic lights and sounds",
        "Photographer",
        "Host (emcee)"
      ]
    },
    {
      id: "reunion",
      name: "Reunion Package",
      occasion: "reunion",
      price: 47000,
      basePax: 100,
      extraPerHead: 250,
      priceStatus: "estimate",
      inclusions: [
        "Catering service",
        "Stage set up (family name board, balloon decoration, wooden chair, entrance arc)",
        "Photobooth (3 hours unlimited shots with laminated copy)",
        "Basic lights and sounds",
        "Photographer",
        "Host"
      ]
    },
    {
      id: "other",
      name: "Special Occasion Package",
      occasion: "other",
      price: 46000,
      basePax: 100,
      extraPerHead: 250,
      priceStatus: "estimate",
      description: "for christenings, anniversaries and graduations",
      inclusions: [
        "Catering service",
        "Stage set up (styro name, character, wooden chair, balloon decoration, entrance arc)",
        "Basic lights and sounds",
        "Cake and 1 dozen cupcakes",
        "Photographer",
        "Host"
      ]
    }
  ],
  addOns: [
    { id: "clown-magician", label: "Clown (puppet and magician)", type: "flat", price: 4000, priceStatus: "estimate", occasions: ["reunion", "other"], hideIfIncluded: true },
    { id: "photobooth-3h", label: "Photobooth (3 hours unlimited shots with laminated copy)", type: "flat", price: 5000, priceStatus: "estimate", occasions: ["corporate", "other"], hideIfIncluded: true },
    { id: "cake-cupcakes", label: "Cake and 1 dozen cupcakes", type: "flat", price: 3000, priceStatus: "estimate", occasions: ["corporate", "reunion"], hideIfIncluded: true },
    { id: "photographer", label: "Photographer", type: "flat", price: 5000, priceStatus: "estimate", occasions: ["birthday"], hideIfIncluded: true },
    { id: "extra-photobooth-hour", label: "Extra photobooth hour", type: "flat", price: 1500, priceStatus: "estimate", occasions: ["all"], requires: "photobooth" },
    { id: "videographer", label: "Videographer, event coverage", type: "flat", price: 5000, priceStatus: "estimate", occasions: ["all"] },
    { id: "presidential-table", label: "Presidential table", type: "flat", price: 1000, priceStatus: "estimate", occasions: ["party", "birthday", "corporate", "reunion", "other"], hideIfIncluded: true },
    { id: "invitation-20", label: "Invitation (20 pcs)", type: "flat", price: 600, priceStatus: "estimate", occasions: ["party", "birthday", "reunion", "other"], hideIfIncluded: true },
    { id: "couch-upgrade", label: "Couch instead of wooden chair", type: "flat", price: 1000, priceStatus: "estimate", occasions: ["party", "birthday", "reunion", "other"], hideIfIncluded: true },
    { id: "ceremony-setup", label: "Ceremony and aisle set up", type: "flat", price: 3500, priceStatus: "estimate", occasions: ["wedding"] },
    { id: "flower-centerpieces", label: "Flower centerpieces", type: "flat", price: 4500, priceStatus: "estimate", occasions: ["wedding"] },
    { id: "cake-upgrade", label: "Tiered cake upgrade", type: "flat", price: 3500, priceStatus: "estimate", occasions: ["wedding"] },
    { id: "bridal-car", label: "Bridal car decoration", type: "flat", price: 1500, priceStatus: "estimate", occasions: ["wedding"] },
    { id: "kiddie-games", label: "Kiddie games and prizes", type: "flat", price: 2500, priceStatus: "estimate", occasions: ["party", "birthday"] },
    { id: "mascot", label: "Mascot or character visit", type: "flat", price: 3500, priceStatus: "estimate", occasions: ["party", "birthday"] },
    { id: "food-cart", label: "Ice cream, popcorn or cotton candy cart", type: "flat", price: 4000, priceStatus: "estimate", occasions: ["party", "birthday"] },
    { id: "balloon-centerpieces", label: "Balloon centerpieces", type: "flat", price: 2000, priceStatus: "estimate", occasions: ["party", "birthday"] },
    { id: "videoke", label: "Videoke", type: "flat", price: 2500, priceStatus: "estimate", occasions: ["party", "reunion"] },
    { id: "custom-backdrop", label: "Custom tarpaulin backdrop", type: "flat", price: 1500, priceStatus: "estimate", occasions: ["birthday"] },
    { id: "giveaways", label: "Giveaways or loot bags", type: "per_head", price: 35, priceStatus: "estimate", occasions: ["birthday"] },
    { id: "projector-screen", label: "Projector and screen", type: "flat", price: 3500, priceStatus: "estimate", occasions: ["corporate"] },
    { id: "extra-mics", label: "Extra wireless microphones, pair", type: "flat", price: 800, priceStatus: "estimate", occasions: ["corporate"] },
    { id: "registration-table", label: "Registration table with attendants", type: "flat", price: 1500, priceStatus: "estimate", occasions: ["corporate"] },
    { id: "coffee-station", label: "Coffee break station", type: "flat", price: 3500, priceStatus: "estimate", occasions: ["corporate"] },
    { id: "company-banner", label: "Company banner backdrop", type: "flat", price: 2000, priceStatus: "estimate", occasions: ["corporate"] },
    { id: "branded-giveaways", label: "Branded giveaways", type: "per_head", price: 50, priceStatus: "estimate", occasions: ["corporate"] },
    { id: "family-backdrop", label: "Family name and year backdrop", type: "flat", price: 1800, priceStatus: "estimate", occasions: ["reunion"] },
    { id: "family-games", label: "Family games and prizes", type: "flat", price: 2500, priceStatus: "estimate", occasions: ["reunion"] },
    { id: "lechon", label: "Lechon", type: "flat", price: 10000, priceStatus: "estimate", occasions: ["reunion"] },
    { id: "souvenir-shirts", label: "Souvenir shirts, each", type: "per_unit", price: 200, priceStatus: "estimate", occasions: ["reunion"] },
    { id: "memory-wall", label: "Photo wall or memory board", type: "flat", price: 2000, priceStatus: "estimate", occasions: ["reunion", "other"] },
    { id: "celebrant-backdrop", label: "Custom backdrop with the celebrant's name", type: "flat", price: 1800, priceStatus: "estimate", occasions: ["other"] },
    { id: "balloon-bouquet", label: "Balloon bouquet or backdrop", type: "flat", price: 3000, priceStatus: "estimate", occasions: ["other"] },
    { id: "dessert-buffet", label: "Dessert or candy buffet", type: "flat", price: 3500, priceStatus: "estimate", occasions: ["other"] },
    { id: "souvenirs", label: "Souvenirs", type: "per_head", price: 30, priceStatus: "estimate", occasions: ["other"] }
  ],
  extraDishPer100: {
    chicken: 3000,
    beef: 3500,
    pork: 3500,
    fish: 3000,
    vegetables: 3000,
    pasta: 3000
  },
  stageSetup: {
    includes: ["Balloon decoration", "Styro name", "Couch or wooden chair", "Entrance arc"],
    variants: [
      { id: "wooden-chair", label: "Wooden chair", price: 5000, assumed: true },
      { id: "couch", label: "Couch", price: 6000, assumed: true }
    ]
  },
  includedChoices: { drinks: 1, desserts: 1, rice: 1 },
  specialDishes: [
    { name: "Shrimp Tempura", price: null, assumed: true },
    { name: "Lemon Buttered Shrimp", price: null, assumed: true },
    { name: "Mix Seafoods", price: null, assumed: true }
  ],
  requestItems: [
    "Clown (puppet or magician)",
    "Photobooth (3 hours unlimited shots with laminated copy)",
    "Basic lights and sounds",
    "Photographer",
    "Host",
    "Cake and 1 dozen cupcakes",
    "Invitation (20 pcs)",
    "Presidential table"
  ],
  trays: { chicken: 900, pork: 950, beef: 1000, pasta: 800, fish: 800, veggie: 800 }
};

export const phPesos = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0
});

export function formatPesos(amount) {
  if (amount === null || amount === undefined) return "To be quoted";
  return phPesos.format(Math.round(amount));
}

export const formatPeso = formatPesos;

let activePricingConfig = null;

export function setPricingConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid pricing configuration.');
  }

  activePricingConfig = config;
}

export function getPricingConfig() {
  if (activePricingConfig) {
    return activePricingConfig;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('tikim.pricing');

      if (stored) {
        return { ...PRICING_DEFAULTS, ...JSON.parse(stored) };
      }
    } catch (e) {
      // Fallback to defaults
    }
  }

  return PRICING_DEFAULTS;
}

// Revision 17B Part 2: Single central downpayment calculation function.
export function computeDownpaymentAndBalance(total, type, settings = {}) {
  const isTrays = type === 'trays';
  const pct = isTrays
    ? (Number(settings?.trays?.paymentPercent) || 100)
    : (Number(settings?.downpaymentPercent) || 50);
  const downpayment = Math.ceil(total * (pct / 100));
  const balance = Math.max(0, total - downpayment);
  const label = isTrays ? 'Pay in full' : `Downpayment (${pct}%)`;
  return { downpayment, balance, pct, label, isTrays };
}

/**
 * Asserts mathematical integrity of a computed quotation (Revision 18A Part 2.2).
 * @param {Object} quote
 * @throws {Error} If totals do not equal the sum of lines or downpayment is incorrect.
 */
export function assertQuote(quote) {
  if (!quote || !Array.isArray(quote.lines)) {
    console.error('[assertQuote] Quote or quote.lines missing:', quote);
    throw new Error('assertQuote failed: quote or quote.lines missing');
  }
  const linesSum = quote.lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
  if (quote.total !== linesSum) {
    console.error(`[assertQuote] total ${quote.total} !== sum of lines ${linesSum}`, quote);
    throw new Error(`assertQuote failed: total ${quote.total} !== sum of lines ${linesSum}`);
  }
  if (quote.knownTotal !== linesSum) {
    console.error(`[assertQuote] knownTotal ${quote.knownTotal} !== sum of lines ${linesSum}`, quote);
    throw new Error(`assertQuote failed: knownTotal ${quote.knownTotal} !== sum of lines ${linesSum}`);
  }
  const pct = quote.downpaymentPercent ?? (quote.type === 'trays' ? 100 : 50);
  const expectedDp = Math.ceil(quote.total * pct / 100);
  if (quote.downpayment !== expectedDp) {
    console.error(`[assertQuote] downpayment ${quote.downpayment} !== expectedDp ${expectedDp}`, quote);
    throw new Error(`assertQuote failed: downpayment ${quote.downpayment} !== expectedDp ${expectedDp}`);
  }
  const expectedBal = quote.total - quote.downpayment;
  if (quote.balance !== expectedBal) {
    console.error(`[assertQuote] balance ${quote.balance} !== expectedBal ${expectedBal}`, quote);
    throw new Error(`assertQuote failed: balance ${quote.balance} !== expectedBal ${expectedBal}`);
  }
  return true;
}

/**
 * Computes a pure itemized quotation according to Revision 18A specifications.
 * @param {Object} input
 * @returns {Object} Quote breakdown with integer totals, line items, and audit flags.
 */
export function computeQuote(input = {}) {
  const cfg = getPricingConfig();
  const rawType = String(input.type || '').toLowerCase();
  
  // Strict TYPE-AWARENESS (Part 2.2):
  // Event and food bookings ignore trays completely; trays bookings ignore packages completely.
  let isTrays = false;
  let isEvent = false;
  let isFood = false;

  if (rawType === 'trays' || input.plan === 'trays') {
    isTrays = true;
  } else if (rawType === 'event' || input.plan === 'allin') {
    isEvent = true;
  } else if (rawType === 'food') {
    isFood = true;
  } else if (input.packageId && !input.packageId.startsWith('food') && !rawType) {
    isEvent = true;
  } else if (Array.isArray(input.trays) && input.trays.length > 0 && !rawType && !input.packageId) {
    isTrays = true;
  } else {
    isFood = true;
  }

  const bookingType = isTrays ? 'trays' : (isEvent ? 'event' : 'food');
  const plan = isEvent ? 'allin' : (isTrays ? 'trays' : 'catering');
  const eventType = String(input.eventType || 'party').toLowerCase();
  const pax = Math.round(Number(input.pax) || 0);

  const levelNum = Math.min(3, Math.max(1, Number(input.level) || 1));
  const levelIdx = levelNum - 1;
  const levelData = cfg.levels[levelIdx] || cfg.levels[0];

  const lines = [];
  let underMin = false;
  let hasTbc = false;
  let assumedRulesUsed = false;
  let usesEstimates = false;
  let selectedEventPackage = null;

  // A) FOOD BOOKING (type === 'food') -> IGNORE TRAYS AND EVENT PACKAGES COMPLETELY
  if (isFood) {
    if (pax >= cfg.minPax) {
      const ratePerHead = levelData.perHead;
      const foodTotal = pax * ratePerHead;
      lines.push({
        id: `food-level-${levelNum}`,
        category: 'Food',
        name: `Food Package ${levelNum} (${pax} guests x ₱${ratePerHead})`,
        unitPrice: ratePerHead,
        quantity: pax,
        amount: foodTotal,
        formula: `${pax} guests x ₱${ratePerHead}`,
        isTbc: false
      });
    } else if (pax > 0) {
      underMin = true;
      const flatTotal = cfg.underMinFlat || 15000;
      lines.push({
        id: 'under-min-flat',
        category: 'Food',
        name: `Food Package ${levelNum} (Flat bundle under 75 guests)`,
        unitPrice: flatTotal,
        quantity: 1,
        amount: flatTotal,
        formula: `Flat bundle under ${cfg.minPax} guests: ₱${flatTotal.toLocaleString('en-PH')}`,
        isTbc: false
      });
    }

    // Extra dishes in food booking
    const extraDishes = Array.isArray(input.extraDishes) ? input.extraDishes : [];
    if (extraDishes.length > 0) {
      let extraDishesTotal = 0;
      extraDishes.forEach(dish => {
        const cat = String(dish.category || dish.course || 'chicken').toLowerCase();
        if (cat === 'drinks' || cat === 'desserts' || cat === 'rice') return;
        const ratePer100 = cfg.extraDishPer100?.[cat] || 3000;
        const ratePerHead = Math.round(ratePer100 / 100);
        extraDishesTotal += pax * ratePerHead;
      });
      lines.push({
        id: 'extra-dishes',
        category: 'Extra Dish',
        name: `Extra dishes (${extraDishes.length})`,
        unitPrice: extraDishesTotal,
        quantity: extraDishes.length,
        amount: extraDishesTotal,
        formula: `${extraDishes.length} extra dish${extraDishes.length > 1 ? 'es' : ''}`,
        isTbc: false
      });
    }

    // Special dishes in food booking (price on request / to be quoted)
    const specialDishes = Array.isArray(input.special) ? input.special : (Array.isArray(input.specialDishes) ? input.specialDishes : []);
    if (specialDishes.length > 0) {
      hasTbc = true;
      lines.push({
        id: 'special-dishes',
        category: 'Special Dish',
        name: `Special dishes (${specialDishes.length})`,
        unitPrice: 0,
        quantity: specialDishes.length,
        amount: 0,
        formula: 'To be quoted by Dack\'s Catering',
        isTbc: true
      });
    }
  }

  // B) EVENT BOOKING (type === 'event') -> IGNORE TRAYS COMPLETELY
  if (isEvent) {
    const rawPackages = cfg.eventPackages || [];
    selectedEventPackage = rawPackages.find(p => p.id === input.packageId) ||
      rawPackages.find(p => p.occasion === eventType) ||
      rawPackages.find(p => p.id === 'party') ||
      rawPackages[0];

    if (selectedEventPackage?.priceStatus === 'estimate' || selectedEventPackage?.assumed) {
      usesEstimates = true;
    }

    const bundle = selectedEventPackage;
    const basePrice = bundle ? bundle.price : 55000;
    const basePax = bundle ? bundle.basePax : 100;
    const extraPerHead = bundle ? bundle.extraPerHead : 250;
    const pkgName = bundle ? bundle.name : 'Event Package';

    // 1. Base Package line
    lines.push({
      id: `package-${bundle?.id || 'event'}`,
      category: 'Package',
      name: `${pkgName} (Base up to ${basePax} guests)`,
      unitPrice: basePrice,
      quantity: 1,
      amount: basePrice,
      formula: `Base bundle up to ${basePax} guests: ₱${basePrice.toLocaleString('en-PH')}`,
      isTbc: false
    });

    // 2. Extra Guests beyond basePax
    if (pax > basePax) {
      const extraGuestsCount = pax - basePax;
      const extraGuestsTotal = extraGuestsCount * extraPerHead;
      lines.push({
        id: 'extra-guests',
        category: 'Package',
        name: `Extra guests (${extraGuestsCount} x ₱${extraPerHead})`,
        unitPrice: extraPerHead,
        quantity: extraGuestsCount,
        amount: extraGuestsTotal,
        formula: `${extraGuestsCount} extra guests x ₱${extraPerHead}`,
        isTbc: false
      });
    }

    // 3. Menu upgrade (+20/guest for L2, +50/guest for L3)
    const baseLevelData = cfg.levels[cfg.allIn.baseLevel - 1] || cfg.levels[0];
    const upgradePerHead = levelData.perHead - baseLevelData.perHead;
    if (upgradePerHead > 0) {
      const upgradeTotal = pax * upgradePerHead;
      lines.push({
        id: `food-upgrade-${levelNum}`,
        category: 'Food Upgrade',
        name: `Menu upgrade (${levelData.name}, +₱${upgradePerHead} per guest)`,
        unitPrice: upgradePerHead,
        quantity: pax,
        amount: upgradeTotal,
        formula: `${pax} guests x ₱${upgradePerHead} (${levelData.name} upgrade)`,
        isTbc: false
      });
    }

    // 4. Extra dishes
    const extraDishes = Array.isArray(input.extraDishes) ? input.extraDishes : [];
    if (extraDishes.length > 0) {
      let extraDishesTotal = 0;
      extraDishes.forEach(dish => {
        const cat = String(dish.category || dish.course || 'chicken').toLowerCase();
        if (cat === 'drinks' || cat === 'desserts' || cat === 'rice') return;
        const ratePer100 = cfg.extraDishPer100?.[cat] || 3000;
        const ratePerHead = Math.round(ratePer100 / 100);
        extraDishesTotal += pax * ratePerHead;
      });
      lines.push({
        id: 'extra-dishes',
        category: 'Extra Dish',
        name: `Extra dishes (${extraDishes.length})`,
        unitPrice: extraDishesTotal,
        quantity: extraDishes.length,
        amount: extraDishesTotal,
        formula: `${extraDishes.length} extra dish${extraDishes.length > 1 ? 'es' : ''}`,
        isTbc: false
      });
    }

    // Special dishes (price on request / to be quoted)
    const specialDishes = Array.isArray(input.special) ? input.special : (Array.isArray(input.specialDishes) ? input.specialDishes : []);
    if (specialDishes.length > 0) {
      hasTbc = true;
      lines.push({
        id: 'special-dishes',
        category: 'Special Dish',
        name: `Special dishes (${specialDishes.length})`,
        unitPrice: 0,
        quantity: specialDishes.length,
        amount: 0,
        formula: 'To be quoted by Dack\'s Catering',
        isTbc: true
      });
    }

    // 5. Stage set up
    lines.push({
      id: 'stage-included',
      category: 'Stage Set Up',
      name: 'Stage set up',
      unitPrice: 0,
      quantity: 1,
      amount: 0,
      formula: 'Included in Event Package (₱0)',
      isTbc: false,
      isIncluded: true
    });

    // 6. Add-ons
    const addOns = Array.isArray(input.addOns) ? input.addOns : (Array.isArray(input.addons) ? input.addons : []);
    const validAddons = addOns.filter(a => {
      if (typeof a === 'string') return true;
      return (Number(a.quantity ?? a.qty) || 1) > 0;
    });

    if (validAddons.length > 0) {
      let addOnsTotal = 0;
      validAddons.forEach(addon => {
        const addonId = typeof addon === 'string' ? addon : addon.id;
        const catalogItem = (cfg.addOns || []).find(a => a.id === addonId) ||
          (typeof addon === 'object' ? addon : { id: addonId, label: addonId, price: 0, type: 'flat' });
        const price = (typeof addon === 'object' && addon.price !== undefined && addon.price !== null)
          ? Number(addon.price)
          : (catalogItem.price ?? 0);
        const type = (typeof addon === 'object' && addon.type) || catalogItem.type || 'flat';
        let qty = (typeof addon === 'object' && (addon.quantity !== undefined || addon.qty !== undefined))
          ? Number(addon.quantity ?? addon.qty)
          : 1;
        let lineAmt = price * qty;
        if (type === 'per_head') {
          lineAmt = price * pax;
        }
        addOnsTotal += lineAmt;
      });

      lines.push({
        id: 'addons-group',
        category: 'Add-on',
        name: `Add-ons (${validAddons.length})`,
        unitPrice: addOnsTotal,
        quantity: validAddons.length,
        amount: addOnsTotal,
        formula: `${validAddons.length} add-on${validAddons.length > 1 ? 's' : ''}`,
        isTbc: false
      });
    }
  }

  // C) TRAYS BOOKING (type === 'trays') -> IGNORE PACKAGES COMPLETELY
  if (isTrays) {
    const trays = Array.isArray(input.trays) ? input.trays : [];
    const totalTraysQty = trays.reduce((sum, t) => sum + (Number(t.quantity ?? t.qty) || 1), 0);
    const traysTotal = trays.reduce((sum, t) => {
      const qty = Number(t.quantity ?? t.qty) || 1;
      const price = Number(t.price) || 0;
      return sum + (qty * price);
    }, 0);

    lines.push({
      id: 'food-trays-line',
      category: 'Food Tray',
      name: `Food trays (${totalTraysQty})`,
      unitPrice: totalTraysQty > 0 ? Math.round(traysTotal / totalTraysQty) : 0,
      quantity: totalTraysQty,
      amount: traysTotal,
      formula: `${totalTraysQty} tray${totalTraysQty > 1 ? 's' : ''}`,
      isTbc: false
    });
  }

  // D) OPTIONAL DISCOUNTS & ADJUSTMENTS
  if (input.discount && Number(input.discount) > 0) {
    const discountVal = Math.round(Number(input.discount));
    lines.push({
      id: 'organizer-discount',
      category: 'Adjustment',
      name: 'Organizer Special Discount',
      unitPrice: -discountVal,
      quantity: 1,
      amount: -discountVal,
      formula: `-₱${discountVal.toLocaleString('en-PH')}`,
      isTbc: false
    });
  }

  const manualLines = Array.isArray(input.manualLines) ? input.manualLines : [];
  manualLines.forEach((m, idx) => {
    const amount = Math.round(Number(m.amount) || 0);
    lines.push({
      id: `manual-line-${idx}`,
      category: 'Custom Adjustment',
      name: m.name || `Custom Line ${idx + 1}`,
      unitPrice: amount,
      quantity: 1,
      amount: amount,
      formula: `Custom adjustment: ₱${amount.toLocaleString('en-PH')}`,
      isTbc: false
    });
  });

  // SUM OF ALL LINES (Part 2.2)
  const total = Math.max(0, lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0));
  const dpInfo = computeDownpaymentAndBalance(total, bookingType, cfg);
  const downpayment = dpInfo.downpayment;
  const balance = dpInfo.balance;
  const paid = Math.round(Number(input.paidAmount) || 0);
  const balanceDue = isTrays ? 0 : Math.max(0, total - downpayment - paid);

  const quote = {
    knownTotal: total,
    total: total,
    subtotal: total,
    downpayment,
    downpaymentRequired: downpayment,
    downpaymentLabel: dpInfo.label,
    downpaymentPercent: dpInfo.pct,
    balance,
    balanceDue,
    paid,
    lines,
    type: bookingType,
    flags: {
      underMin,
      hasTbc,
      assumedRulesUsed,
      usesEstimates
    },
    plan,
    level: levelNum,
    pax,
    eventType: isFood ? 'food' : (isTrays ? 'trays' : eventType),
    package: selectedEventPackage
  };

  assertQuote(quote);
  return quote;
}

// Backwards-compatible alias for existing callers
export function calculateQuotation(params = {}) {
  const isTrays = params.type === 'trays' || (!params.type && params.plan === 'trays');
  const isFood = params.type === 'food' || params.plan === 'catering';
  const isEvent = params.type === 'event' || (!isFood && !isTrays);

  return computeQuote({
    type: isTrays ? 'trays' : (isFood ? 'food' : 'event'),
    eventType: params.eventType,
    pax: params.pax,
    plan: isEvent ? 'allin' : (isTrays ? 'trays' : 'catering'),
    packageId: params.packageObj?.id || params.packageId,
    level: params.level || 1,
    dishes: params.dishes,
    extraDishes: params.extraDishes,
    stageVariant: isEvent ? params.stageVariant : 'none',
    special: params.special,
    requested: params.requested || params.addons,
    addOns: isEvent ? (params.addOns || params.addons) : [],
    skippedInclusions: params.skippedInclusions,
    discount: params.manualDiscount,
    manualLines: params.organizerExtras,
    paidAmount: params.paidAmount,
    trays: params.trays
  });
}

export function getPackageAddOns(packageOrOccasion, cfg = getPricingConfig(), selectedAddOns = []) {
  const occasion = (typeof packageOrOccasion === 'string'
    ? packageOrOccasion
    : (packageOrOccasion?.occasion || packageOrOccasion?.id || 'all')).toLowerCase();
  const pkgId = typeof packageOrOccasion === 'object' ? packageOrOccasion.id : packageOrOccasion;
  const rawPackages = cfg.eventPackages || [];
  const pkg = rawPackages.find(p => p.id === pkgId || p.occasion === occasion) || null;
  const pkgInclusions = (pkg?.inclusions || []).map(inc => inc.toLowerCase());
  const allAddOns = cfg.addOns || [];

  const selectedIds = (selectedAddOns || []).map(a => typeof a === 'string' ? a : a.id);

  // Check if photobooth is included in package or selected as add-on
  const hasPhotobooth = pkgInclusions.some(inc => inc.includes('photobooth')) ||
    selectedIds.includes('photobooth-3h') ||
    selectedIds.includes('photobooth');

  return allAddOns.filter(item => {
    // 1. Check occasion suitability
    const occasions = item.occasions || [];
    const matchesOccasion = occasions.includes('all') || occasions.includes(occasion);
    if (!matchesOccasion) return false;

    // 2. Hide if already included in package
    if (item.hideIfIncluded) {
      if (item.id === 'invitation-20' && (occasion === 'wedding' || pkgInclusions.some(i => i.includes('invitation')))) {
        return false;
      }
      if (item.id === 'presidential-table' && (occasion === 'wedding' || pkgInclusions.some(i => i.includes('presidential table')))) {
        return false;
      }
      if (item.id === 'couch-upgrade' && (occasion === 'wedding' || occasion === 'corporate')) {
        return false;
      }
      if (item.id === 'clown-magician' && pkgInclusions.some(i => i.includes('clown'))) {
        return false;
      }
      if (item.id === 'photobooth-3h' && pkgInclusions.some(i => i.includes('photobooth'))) {
        return false;
      }
      if (item.id === 'cake-cupcakes' && pkgInclusions.some(i => i.includes('cake'))) {
        return false;
      }
      if (item.id === 'photographer' && pkgInclusions.some(i => i.includes('photographer'))) {
        return false;
      }
    }

    // 3. Matrix exclusions (X in matrix)
    if (occasion === 'wedding') {
      if (['clown-magician', 'invitation-20', 'presidential-table', 'couch-upgrade'].includes(item.id)) {
        return false;
      }
    }
    if (occasion === 'corporate') {
      if (['clown-magician', 'invitation-20', 'couch-upgrade'].includes(item.id)) {
        return false;
      }
    }

    // 4. Requires dependency check
    if (item.requires === 'photobooth' || item.id === 'extra-photobooth-hour') {
      if (!hasPhotobooth) return false;
    }

    return true;
  });
}

