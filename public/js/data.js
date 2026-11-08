// Default system data for Tikim Event Management and Booking System.
const TIKIM_DATA = {
  packages: [
    {
      id: "pkg-wedding",
      name: "Grand Royal Wedding",
      category: "Wedding",
      basePax: 150,
      basePrice: 165000,
      pricePerExtraPax: 950,
      image: "assets/gallery-wedding.jpg",
      tagline: "Romantic fairytale reception with full presidential styling",
      description: "Complete luxury wedding setup including bridal backdrop, fresh floral runners, VIP presidential tables, Tiffany chairs, chandelier accents, 5-course catering buffet, full sound and light system, and dedicated coordinator.",
      includedEquipment: ["wooden-chair", "balloon-arc", "photobooth", "lighting-rig", "round-table"],
      includedEntertainers: ["photographer", "host"],
      features: [
        "Presidential floral styling with fresh blooms",
        "5-Course premium Filipino fusion buffet",
        "Full lights and acoustic sound truss setup",
        "3-Hour unlimited photobooth with magnetic strips",
        "Tiffany or rustic wooden cross-back chairs for all guests"
      ]
    },
    {
      id: "pkg-birthday",
      name: "Kiddie & Debut Wonderland",
      category: "Birthday",
      basePax: 80,
      basePrice: 78000,
      pricePerExtraPax: 720,
      image: "assets/gallery-birthday.jpg",
      tagline: "Immersive thematic wonderland with custom 3D stage and character styling",
      description: "Vibrant birthday celebration package with personalized 3D styro backdrop name, entrance balloon arc, character theme props, party host, magician clown, unlimited photobooth, and child-and-adult friendly feast.",
      includedEquipment: ["styro-name", "character-theme", "balloon-arc", "photobooth", "wooden-chair"],
      includedEntertainers: ["host", "clown"],
      features: [
        "Personalized 3D styrofoam stage name and backdrop",
        "Grand organic balloon garland and entrance arch",
        "Professional party host and comedic magician clown",
        "Complete kids buffet and adult catering stations",
        "Unlimited instant souvenir photobooth"
      ]
    },
    {
      id: "pkg-corporate",
      name: "Corporate Gala & Summit",
      category: "Corporate",
      basePax: 120,
      basePrice: 135000,
      pricePerExtraPax: 880,
      image: "assets/gallery-corporate.jpg",
      tagline: "Prestigious banquet and conference staging with modern audiovisuals",
      description: "Sleek and polished corporate banquet package featuring LED stage backdrop support, premium round banquet tables with linen, high-lumen par spotlights, professional audio setup, executive plated or buffet service, and turnover checklist.",
      includedEquipment: ["lighting-rig", "round-table", "wooden-chair", "photobooth"],
      includedEntertainers: ["photographer", "host"],
      features: [
        "Executive stage lighting truss and crystal-clear audio system",
        "Formal round banquet tables with high-grade linens",
        "Comprehensive official turnover report for company procurement",
        "Official tax quotation and automated 50 percent downpayment invoice",
        "Seamless timetable coordination for seminars and award banquets"
      ]
    },
    {
      id: "pkg-reunion",
      name: "Salo-Salo Grand Reunion",
      category: "Reunion",
      basePax: 100,
      basePrice: 92000,
      pricePerExtraPax: 750,
      image: "assets/gallery-reunion.jpg",
      tagline: "Heartwarming family and alumni feast under warm festoon lights",
      description: "Generous traditional Filipino feast package ideal for clans, homecoming alumni, and festive reunions. Features rustic outdoor or indoor wooden seating, string canopy lighting, heritage buffet with whole lechon carving station, and souvenir photo booth.",
      includedEquipment: ["wooden-chair", "round-table", "lighting-rig", "photobooth"],
      includedEntertainers: ["photographer", "host"],
      features: [
        "Heritage Filipino catering buffet inspired by traditional flavors",
        "Warm festoon string lighting canopy for memorable outdoor ambiance",
        "Comfortable wooden cross-back seating setup",
        "Souvenir magnetic photobooth with custom family reunion template",
        "Digital agreement and easy family group downpayment split calculation"
      ]
    },
    {
      id: "pkg-party",
      name: "Intimate Fiesta & Social Party",
      category: "Party",
      basePax: 50,
      basePrice: 48000,
      pricePerExtraPax: 680,
      image: "assets/gallery-birthday.jpg",
      tagline: "Cozy celebration setup for anniversaries, milestones, and socials",
      description: "Flexible, stylish celebration package tailored for intimate milestones, bridal showers, and baptismal banquets. Comes with ambient mood lighting, tailored table settings, curated 4-course catering, and personalized balloon accents.",
      includedEquipment: ["balloon-arc", "wooden-chair", "round-table"],
      includedEntertainers: ["host"],
      features: [
        "Curated 4-course catering menu with complimentary welcome drinks",
        "Custom balloon backdrop and table centerpieces",
        "Comfortable rustic or modern chair setup",
        "Sound speaker package with wireless microphones",
        "Dedicated floor manager and turnover checklist"
      ]
    }
  ],

  equipment: [
    {
      id: "styro-name",
      name: "3D Styrofoam Name & Backdrop Cutout",
      category: "Backdrop & Styling",
      price: 6500,
      isPerPax: false,
      has360: false,
      image: "assets/gallery-birthday.jpg",
      description: "Custom sculpted lightweight high-density 3D styrofoam letters with glitter or matte enamel finish, integrated LED backlight accents.",
      stockTotal: 15,
      stockAvailable: 12,
      condition: "Excellent"
    },
    {
      id: "character-theme",
      name: "Life-Size Character Theme Props & Stage",
      category: "Backdrop & Styling",
      price: 8500,
      isPerPax: false,
      has360: false,
      image: "assets/gallery-birthday.jpg",
      description: "Custom thematic display including standees, custom 2.5D themed backdrops, fairy tale or superhero elements, and themed cake plinths.",
      stockTotal: 10,
      stockAvailable: 8,
      condition: "Good"
    },
    {
      id: "wooden-chair",
      name: "Rustic Wooden Cross-Back Chair",
      category: "Furniture & Seating",
      price: 85,
      isPerPax: true,
      has360: true,
      modelType: "chair",
      image: "assets/rental-chair.jpg",
      description: "Curved solid beechwood cross-back event chairs with padded ivory linen cushion. Ergonomic, elegant, and sturdy for outdoor and indoor venues.",
      stockTotal: 350,
      stockAvailable: 310,
      condition: "Excellent"
    },
    {
      id: "round-table",
      name: "60-Inch Round Banquet Table (10-Seater)",
      category: "Furniture & Seating",
      price: 450,
      isPerPax: false,
      has360: true,
      modelType: "table",
      image: "assets/rental-table.jpg",
      description: "Heavy duty commercial folding banquet table with floor-length luxury cloth, table runner, cutlery set, and minimalist floral centerpiece.",
      stockTotal: 40,
      stockAvailable: 34,
      condition: "Excellent"
    },
    {
      id: "balloon-arc",
      name: "Organic Balloon Garland & Entrance Arc",
      category: "Backdrop & Styling",
      price: 5500,
      isPerPax: false,
      has360: false,
      image: "assets/gallery-birthday.jpg",
      description: "Luxury matte chrome and pastel organic balloon installation for the welcome archway or stage framing with botanical faux greenery.",
      stockTotal: 25,
      stockAvailable: 22,
      condition: "Brand New"
    },
    {
      id: "photobooth",
      name: "Photobooth Station (3 Hours Unlimited)",
      category: "Entertainment & Media",
      price: 7500,
      isPerPax: false,
      has360: false,
      image: "assets/gallery-photobooth.jpg",
      description: "3 hours unlimited instant studio shots, high-speed thermal printing with premium laminated magnetic copies, custom border layout, and funny props.",
      stockTotal: 6,
      stockAvailable: 4,
      condition: "Excellent"
    },
    {
      id: "lighting-rig",
      name: "Pro Stage Lighting & Par Can Truss",
      category: "Lighting & Audio",
      price: 9500,
      isPerPax: false,
      has360: true,
      modelType: "lights",
      image: "assets/rental-lights.jpg",
      description: "High-power 18x12W RGBW LED Par spotlights, warm amber wash beam lights, aluminum truss mounts, and digital DMX controller console.",
      stockTotal: 8,
      stockAvailable: 6,
      condition: "Excellent"
    }
  ],

  entertainers: [
    {
      id: "photographer",
      name: "Lead Event Photographer & Videographer",
      role: "Media Coverage",
      price: 8500,
      description: "Full event coverage from ingress to program end. Includes edited high-res digital gallery, same-day preview teasers, and online backup.",
      assignedVendor: "PixelStory PH"
    },
    {
      id: "host",
      name: "Professional Master of Ceremonies (Host)",
      role: "Emcee",
      price: 7000,
      description: "Bilingual English and Filipino host who crafts seamless program flow, coordinates wedding/birthday games, and engages all guest generations.",
      assignedVendor: "VoiceWorks Talent Agency"
    },
    {
      id: "clown",
      name: "Kiddie Party Clown & Entertainer",
      role: "Entertainer",
      price: 6000,
      description: "Interactive comedy clown with balloon twisting, kid comedy skits, and game hosting. Choose between puppet show or stage magic specialty.",
      options: [
        { id: "magician", label: "Stage Magic Specialty", extraCost: 1500 },
        { id: "puppet", label: "Ventriloquist Puppet Show", extraCost: 1000 }
      ],
      assignedVendor: "HappyLaughs Entertainment"
    }
  ],

  menuCategories: [
    { id: "pampagana", name: "Pampagana (Appetizers)", description: "Savory Filipino starters to awaken the palate before the grand feast." },
    { id: "sabaw-ensalada", name: "Sabaw at Ensalada", description: "Comforting heritage broths and refreshing tropical vegetable salads." },
    { id: "ulam-baka", name: "Ulam: Beef Specials", description: "Slow-simmered, tender beef dishes prepared using timeless heirloom recipes." },
    { id: "ulam-baboy", name: "Ulam: Pork Classics", description: "Filipino fiesta centerpieces crisped to perfection and richly seasoned." },
    { id: "ulam-manok-dagat", name: "Manok at Lamang-Dagat", description: "Fresh catches from Philippine waters and aromatic roasted poultry." },
    { id: "merienda-kakanin", name: "Merienda at Kakanin", description: "Traditional clay-oven bibingka, puto bumbong, and merienda noodles inspired by Via Mare." },
    { id: "kanin-noodles", name: "Kanin at Noodles", description: "Fragrant pandan jasmine rice, garlic sinangag, and celebratory noodle platters." },
    { id: "panghimagas", name: "Panghimagas (Desserts)", description: "Decadent sweet endings featuring tropical coconut, ube, and caramel flan." },
    { id: "inumin", name: "Inumin (Beverages)", description: "Chilled tropical refreshments and native herbal coolers." }
  ],

  dishes: [
    // Pampagana
    {
      id: "dish-1",
      categoryId: "pampagana",
      name: "Crispy Calamares with Spiced Mayo",
      description: "Golden tender squid rings coated in seasoned batter, served with house-made calamansi tartar and spiced native vinegar dip.",
      pricePerHead: 140,
      trayPrice: 1950,
      isSignature: true,
      dietary: "Seafood"
    },
    {
      id: "dish-2",
      categoryId: "pampagana",
      name: "Lumpiang Ubod ng Niyog",
      description: "Delicate fresh crepe filled with braised young heart of palm, shrimp, minced pork, crushed peanuts, and sweet garlic glaze.",
      pricePerHead: 120,
      trayPrice: 1650,
      isSignature: true,
      dietary: "Heritage"
    },
    {
      id: "dish-3",
      categoryId: "pampagana",
      name: "Ensaladang Mangga at Bagoong Isda",
      description: "Crisp green mango slivers tossed with fresh native tomatoes, red onions, cilantro, and artisanal Pangasinan fish paste.",
      pricePerHead: 95,
      trayPrice: 1350,
      isSignature: false,
      dietary: "Vegetarian"
    },

    // Sabaw at Ensalada
    {
      id: "dish-4",
      categoryId: "sabaw-ensalada",
      name: "Sinigang na Salmon Belly sa Bayabas",
      description: "Silky salmon belly cuts gently simmered in a mildly sweet, aromatic ripe guava broth with river kangkong and string beans.",
      pricePerHead: 160,
      trayPrice: 2200,
      isSignature: true,
      dietary: "Seafood"
    },
    {
      id: "dish-5",
      categoryId: "sabaw-ensalada",
      name: "Bulalo Soup with Sweet Corn",
      description: "Prime beef shanks boiled for 6 hours until marrow turns buttery soft, complemented with sweet native corn and bok choy.",
      pricePerHead: 175,
      trayPrice: 2450,
      isSignature: true,
      dietary: "Hearty"
    },

    // Ulam: Beef
    {
      id: "dish-6",
      categoryId: "ulam-baka",
      name: "Slow-Braised Beef Caldereta Especial",
      description: "Melt-in-your-mouth beef brisket in rich liver spread and tomato stew with bell peppers, green olives, and grated queso de bola.",
      pricePerHead: 195,
      trayPrice: 2750,
      isSignature: true,
      dietary: "Chef Special"
    },
    {
      id: "dish-7",
      categoryId: "ulam-baka",
      name: "Tikim Heirloom Beef Kare-Kare",
      description: "Rich ground roasted peanut and annatto stew with fork-tender ox tripe and beef shank, paired with sauteed barrio bagoong alamang.",
      pricePerHead: 210,
      trayPrice: 2950,
      isSignature: true,
      dietary: "Fiesta Favorite"
    },
    {
      id: "dish-8",
      categoryId: "ulam-baka",
      name: "Roast Beef with Wild Mushroom Gravy",
      description: "Carved slow-roasted herb-crusted sirloin drizzled with creamy button and shiitake mushroom pan jus.",
      pricePerHead: 225,
      trayPrice: 3100,
      isSignature: false,
      dietary: "Banquet Classic"
    },

    // Ulam: Pork
    {
      id: "dish-9",
      categoryId: "ulam-baboy",
      name: "Crispy Bagnet Pork Belly with Liver Sauce",
      description: "Triple-cooked deep fried Ilocano pork belly slab with blistering crackling skin and tender juicy meat, served with liver dip.",
      pricePerHead: 185,
      trayPrice: 2600,
      isSignature: true,
      dietary: "Fiesta Favorite"
    },
    {
      id: "dish-10",
      categoryId: "ulam-baboy",
      name: "Pork Spareribs Barbecue in Dark Glaze",
      description: "Tender ribs grilled over coconut charcoal basting in our signature sweet garlic and brown sugar calamansi glaze.",
      pricePerHead: 170,
      trayPrice: 2400,
      isSignature: false,
      dietary: "Family Choice"
    },

    // Manok at Seafood
    {
      id: "dish-11",
      categoryId: "ulam-manok-dagat",
      name: "Bacolod Chicken Inasal with Annatto Butter",
      description: "Char-grilled boneless chicken quarters marinated in calamansi, lemongrass, sinamak vinegar, and glazed with golden achuete oil.",
      pricePerHead: 165,
      trayPrice: 2250,
      isSignature: true,
      dietary: "Crowd Pleaser"
    },
    {
      id: "dish-12",
      categoryId: "ulam-manok-dagat",
      name: "Baked Rellenong Bangus de Manila",
      description: "Whole deboned milkfish stuffed with minced fish meat, carrots, raisins, sweet peas, and roasted to golden perfection.",
      pricePerHead: 175,
      trayPrice: 2450,
      isSignature: true,
      dietary: "Heritage"
    },
    {
      id: "dish-13",
      categoryId: "ulam-manok-dagat",
      name: "Garlic Butter Black Tiger Prawns",
      description: "Jumbo prawns flash-seared in rich dairy butter, crushed garlic confit, and a hint of fresh chili flakes.",
      pricePerHead: 240,
      trayPrice: 3350,
      isSignature: true,
      dietary: "Premium Seafood"
    },

    // Merienda at Kakanin (Via Mare style)
    {
      id: "dish-14",
      categoryId: "merienda-kakanin",
      name: "Bibingka Especial with Salted Egg & Queso",
      description: "Traditional baked rice cake cooked in banana leaves with sliced duck salted egg, carabao cheese, and freshly grated coconut.",
      pricePerHead: 95,
      trayPrice: 1350,
      isSignature: true,
      dietary: "Via Mare Inspired"
    },
    {
      id: "dish-15",
      categoryId: "merienda-kakanin",
      name: "Puto Bumbong with Muscovado & Butter",
      description: "Steamed fragrant pirurutong purple heirloom rice served piping hot with dairy butter, muscovado sugar, and fresh coconut.",
      pricePerHead: 90,
      trayPrice: 1250,
      isSignature: true,
      dietary: "Via Mare Inspired"
    },
    {
      id: "dish-16",
      categoryId: "merienda-kakanin",
      name: "Pancit Luglog Tikim de Manila",
      description: "Thick rice noodles drenched in flavorful shrimp gravy, topped with chicharon, tinapa flakes, hard-boiled eggs, and calamansi.",
      pricePerHead: 110,
      trayPrice: 1550,
      isSignature: true,
      dietary: "Heritage Classic"
    },

    // Kanin at Noodles
    {
      id: "dish-17",
      categoryId: "kanin-noodles",
      name: "Fragrant Pandan Steamed Rice",
      description: "Fluffy premium jasmine rice infused with fresh pandan leaves for an inviting banquet aroma.",
      pricePerHead: 40,
      trayPrice: 600,
      isSignature: false,
      dietary: "Staple"
    },
    {
      id: "dish-18",
      categoryId: "kanin-noodles",
      name: "Sotanghon Guisado with Wood Ear Mushrooms",
      description: "Glass noodles braised in rich chicken and annatto stock with shredded chicken, shrimp, snow peas, and toasted garlic.",
      pricePerHead: 110,
      trayPrice: 1500,
      isSignature: false,
      dietary: "Celebration"
    },

    // Panghimagas
    {
      id: "dish-19",
      categoryId: "panghimagas",
      name: "Classic Creamy Leche Flan",
      description: "Silky rich egg yolk custard gently steamed and topped with golden caramelized amber syrup.",
      pricePerHead: 85,
      trayPrice: 1200,
      isSignature: true,
      dietary: "Dessert"
    },
    {
      id: "dish-20",
      categoryId: "panghimagas",
      name: "Tikim Halo-Halo Fiesta Station",
      description: "Shaved ice with ube halaya, sweet macapuno, leche flan, pinipig, sweetened saba, and carabao milk drizzle.",
      pricePerHead: 130,
      trayPrice: 1850,
      isSignature: true,
      dietary: "Signature Station"
    },

    // Inumin
    {
      id: "dish-21",
      categoryId: "inumin",
      name: "Native Sago at Gulaman Cooler",
      description: "Refreshing brown sugar and banana essence iced drink filled with chewy tapioca pearls and grass jelly cubes.",
      pricePerHead: 50,
      trayPrice: 700,
      isSignature: false,
      dietary: "Beverage"
    },
    {
      id: "dish-22",
      categoryId: "inumin",
      name: "Fresh Honey Calamansi Iced Juice",
      description: "Freshly squeezed Philippine calamansi citrus sweetened with raw mountain honey, served chilled with mint.",
      pricePerHead: 65,
      trayPrice: 900,
      isSignature: true,
      dietary: "Beverage"
    }
  ],

  // Booked dates to showcase double-booking prevention system.
  bookedDates: [
    {
      date: "2026-11-14",
      slot: "Full Day",
      eventName: "Reyes-Santos Golden Wedding",
      client: "Ma. Elena Santos",
      pax: 180,
      package: "Grand Royal Wedding",
      status: "Confirmed"
    },
    {
      date: "2026-11-21",
      slot: "Evening",
      eventName: "AstraTech Annual Gala",
      client: "Director Jerome Perez",
      pax: 150,
      package: "Corporate Gala & Summit",
      status: "Confirmed"
    },
    {
      date: "2026-12-05",
      slot: "Full Day",
      eventName: "Liam 7th Birthday Adventure",
      client: "Patricia Gomez",
      pax: 100,
      package: "Kiddie & Debut Wonderland",
      status: "Confirmed"
    },
    {
      date: "2026-12-18",
      slot: "Morning",
      eventName: "Garcia Grand Family Reunion",
      client: "Tito Jun Garcia",
      pax: 120,
      package: "Salo-Salo Grand Reunion",
      status: "Confirmed"
    }
  ],

  // Initial customer booking records for tracking and organizer view.
  initialBookings: [
    {
      bookingId: "TKM-2026-8801",
      customerName: "Camille Fernandez",
      contactNumber: "0917-844-3291",
      messenger: "camille.fernandez",
      eventDate: "2026-11-28",
      timeSlot: "Evening (5:00 PM - 10:00 PM)",
      eventType: "Wedding",
      packageName: "Grand Royal Wedding",
      pax: 150,
      totalAmount: 184500,
      downpaymentAmount: 92250,
      balanceAmount: 92250,
      paymentStatus: "Downpayment Confirmed",
      paymentMethod: "GCash",
      referenceNumber: "GC-98210488219",
      agreementSigned: true,
      smsSent: true,
      turnoverStatus: "Scheduled for Ingress",
      createdDate: "2026-10-18"
    },
    {
      bookingId: "TKM-2026-8802",
      customerName: "Architect Dennis Tan",
      contactNumber: "0920-555-1294",
      messenger: "dennis.tan",
      eventDate: "2026-12-12",
      timeSlot: "Morning (9:00 AM - 2:00 PM)",
      eventType: "Corporate",
      packageName: "Corporate Gala & Summit",
      pax: 120,
      totalAmount: 135000,
      downpaymentAmount: 67500,
      balanceAmount: 67500,
      paymentStatus: "Downpayment Confirmed",
      paymentMethod: "BDO Bank Transfer",
      referenceNumber: "BDO-5529104",
      agreementSigned: true,
      smsSent: true,
      turnoverStatus: "Checklist Prepared",
      createdDate: "2026-10-19"
    }
  ],

  vendors: [
    { id: "v-1", name: "PixelStory PH", type: "Photography & Cinema", contact: "0917-234-8891", status: "Active Partner" },
    { id: "v-2", name: "VoiceWorks Talent Agency", type: "Emcee & Hosting", contact: "0918-992-1044", status: "Active Partner" },
    { id: "v-3", name: "HappyLaughs Entertainment", type: "Clown, Magic & Puppetry", contact: "0922-384-9011", status: "Active Partner" },
    { id: "v-4", name: "Bulaklak Manila Florals", type: "Floral & Fresh Runners", contact: "0917-882-7711", status: "Active Partner" },
    { id: "v-5", name: "SoundVibe Pro Truss & Lights", type: "Audio, Staging & DMX", contact: "0919-441-2910", status: "Active Partner" }
  ]
};

// Expose state accessors with local storage synchronization.
const TikimStore = {
  get(key) {
    const stored = localStorage.getItem(`tikim_${key}`);
    if (stored) {
      try { return JSON.parse(stored); } catch (e) { return TIKIM_DATA[key]; }
    }
    return TIKIM_DATA[key];
  },
  set(key, val) {
    localStorage.setItem(`tikim_${key}`, JSON.stringify(val));
  },
  resetDefaults() {
    Object.keys(TIKIM_DATA).forEach(k => localStorage.removeItem(`tikim_${k}`));
  }
};
