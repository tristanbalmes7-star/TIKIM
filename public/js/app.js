// Main application script for Tikim Event Management and Booking System.
const TikimApp = {
  state: {
    selectedPackageId: "pkg-wedding",
    pax: 150,
    selectedEquipment: ["wooden-chair", "balloon-arc", "photobooth", "round-table"],
    selectedEntertainers: ["photographer", "host"],
    clownOption: "magician",
    selectedDishes: ["dish-1", "dish-6", "dish-9", "dish-14", "dish-17", "dish-19", "dish-22"],
    eventDate: "2026-11-28",
    timeSlot: "Evening (5:00 PM - 10:00 PM)",
    clientName: "Maria Clara",
    clientPhone: "0917-889-4421",
    clientMessenger: "mariaclara.events",
    specialRequests: "Prefer champagne linens and non-spicy caldereta for kids table.",
    currentRole: "customer", // 'customer' or 'organizer'
    activeGalleryFilter: "all",
    searchQuery: ""
  },

  init() {
    this.renderHeader();
    this.initSearch();
    this.initPackages();
    this.initViewer360();
    this.initBookingCustomizer();
    this.initViaMareMenu();
    this.initGallery();
    this.initOrganizerPortal();
    this.attachGlobalEvents();
    this.updatePriceCalculations();
  },

  // Header navigation matching user design with three categories on each side and centered logo.
  renderHeader() {
    const headerNav = document.getElementById("mainHeader");
    if (!headerNav) return;

    headerNav.innerHTML = `
      <div class="header-container">
        <!-- Left Side: 3 Features Categories -->
        <nav class="header-nav left-nav">
          <a href="#packages-section" class="nav-link">Packages & Styling</a>
          <a href="#rentals-section" class="nav-link">360° Rentals</a>
          <a href="#menu-section" class="nav-link">Via Mare Menu</a>
        </nav>

        <!-- Center: Brand Logo and Mascot -->
        <div class="header-brand">
          <a href="#" class="brand-link" title="Tikim Events and Dack's Catering">
            <img src="assets/tikim-ducky.png" alt="Tikim Ducky Mascot" class="brand-duck-icon" />
            <div class="brand-text-lockup">
              <span class="brand-title">DACK'S</span>
              <span class="brand-subtitle">CATERING & EVENTS</span>
            </div>
          </a>
        </div>

        <!-- Right Side: 3 Features Categories and Search -->
        <nav class="header-nav right-nav">
          <a href="#simulator-section" class="nav-link highlight-pill">Tikim FastPass</a>
          <a href="#booking-section" class="nav-link">Book Event</a>
          <button class="nav-btn organizer-toggle-btn" id="btnToggleOrganizer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            <span id="roleLabel">Organizer Hub</span>
          </button>
          
          <div class="header-search-wrapper">
            <button class="search-trigger-btn" id="searchTriggerBtn" title="Search Dishes, Packages, Equipment">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <div class="search-dropdown-box" id="searchDropdown">
              <div class="search-input-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="globalSearchInput" placeholder="Search menu dishes, packages, or equipment rentals..." />
                <button class="clear-search-btn" id="clearSearchBtn">&times;</button>
              </div>
              <div class="search-results-tray" id="searchResultsTray">
                <div class="search-hint">Type keywords like "Bibingka", "Kare-kare", "Photobooth", "Wedding"...</div>
              </div>
            </div>
          </div>

          <button class="quotation-floating-badge-btn" id="floatingQuoteBtn" title="View Real-Time Quotation">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span class="badge-count" id="headerItemsCount">0</span>
          </button>
        </nav>

        <!-- Mobile Hamburger Toggle -->
        <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Toggle Navigation">
          <span></span><span></span><span></span>
        </button>
      </div>

      <!-- Mobile Dropdown Navigation -->
      <div class="mobile-drawer" id="mobileDrawer">
        <a href="#packages-section" class="mobile-link">Packages & Styling</a>
        <a href="#rentals-section" class="mobile-link">360° Rentals</a>
        <a href="#menu-section" class="mobile-link">Via Mare Menu</a>
        <a href="#simulator-section" class="mobile-link">Tikim FastPass</a>
        <a href="#booking-section" class="mobile-link">Book Event</a>
        <a href="#gallery-section" class="mobile-link">Event Gallery</a>
        <button class="mobile-organizer-btn" id="btnMobileToggleOrganizer">Switch to Organizer Hub</button>
      </div>
    `;
  },

  // Live real-time search filtering dishes, packages, and equipment.
  initSearch() {
    const triggerBtn = document.getElementById("searchTriggerBtn");
    const dropdown = document.getElementById("searchDropdown");
    const searchInput = document.getElementById("globalSearchInput");
    const clearBtn = document.getElementById("clearSearchBtn");
    const resultsTray = document.getElementById("searchResultsTray");

    if (!triggerBtn || !dropdown || !searchInput) return;

    triggerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
      if (dropdown.classList.contains("open")) {
        searchInput.focus();
      }
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && e.target !== triggerBtn) {
        dropdown.classList.remove("open");
      }
    });

    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      resultsTray.innerHTML = `<div class="search-hint">Type keywords like "Bibingka", "Kare-kare", "Photobooth", "Wedding"...</div>`;
      this.clearSearchHighlights();
    });

    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      this.state.searchQuery = q;

      if (!q) {
        resultsTray.innerHTML = `<div class="search-hint">Type keywords like "Bibingka", "Kare-kare", "Photobooth", "Wedding"...</div>`;
        this.clearSearchHighlights();
        return;
      }

      const matchedDishes = TIKIM_DATA.dishes.filter(d => 
        d.name.toLowerCase().includes(q) || 
        d.description.toLowerCase().includes(q) || 
        d.dietary.toLowerCase().includes(q)
      );

      const matchedPackages = TIKIM_DATA.packages.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.category.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q)
      );

      const matchedEquipment = TIKIM_DATA.equipment.filter(eq => 
        eq.name.toLowerCase().includes(q) || 
        eq.category.toLowerCase().includes(q) || 
        eq.description.toLowerCase().includes(q)
      );

      let html = "";

      if (matchedDishes.length === 0 && matchedPackages.length === 0 && matchedEquipment.length === 0) {
        html = `<div class="search-no-results">No matches found for "<strong>${q}</strong>". Try another keyword!</div>`;
      } else {
        if (matchedDishes.length > 0) {
          html += `<div class="search-category-title">Via Mare Catering Menu (${matchedDishes.length})</div>`;
          matchedDishes.slice(0, 5).forEach(d => {
            html += `
              <div class="search-result-item" onclick="TikimApp.jumpToDish('${d.id}')">
                <span class="result-badge dish-tag">Menu Dish</span>
                <span class="result-name">${d.name}</span>
                <span class="result-price">₱${d.pricePerHead}/head</span>
              </div>
            `;
          });
        }

        if (matchedPackages.length > 0) {
          html += `<div class="search-category-title">Event Packages (${matchedPackages.length})</div>`;
          matchedPackages.forEach(p => {
            html += `
              <div class="search-result-item" onclick="TikimApp.selectPackage('${p.id}')">
                <span class="result-badge pkg-tag">${p.category}</span>
                <span class="result-name">${p.name}</span>
                <span class="result-price">₱${p.basePrice.toLocaleString()}</span>
              </div>
            `;
          });
        }

        if (matchedEquipment.length > 0) {
          html += `<div class="search-category-title">Equipment Rentals (${matchedEquipment.length})</div>`;
          matchedEquipment.forEach(eq => {
            html += `
              <div class="search-result-item" onclick="TikimApp.highlightEquipment('${eq.id}')">
                <span class="result-badge equip-tag">${eq.category}</span>
                <span class="result-name">${eq.name}</span>
                <span class="result-price">₱${eq.price.toLocaleString()}</span>
              </div>
            `;
          });
        }
      }

      resultsTray.innerHTML = html;
      this.highlightSearchOnPage(q);
    });
  },

  jumpToDish(dishId) {
    const el = document.getElementById(`dish-card-${dishId}`);
    const searchDropdown = document.getElementById("searchDropdown");
    if (searchDropdown) searchDropdown.classList.remove("open");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash-highlight");
      setTimeout(() => el.classList.remove("flash-highlight"), 2500);
    }
  },

  highlightEquipment(equipId) {
    const searchDropdown = document.getElementById("searchDropdown");
    if (searchDropdown) searchDropdown.classList.remove("open");
    const checkEl = document.getElementById(`equip-check-${equipId}`);
    if (checkEl) {
      checkEl.scrollIntoView({ behavior: "smooth", block: "center" });
      checkEl.parentElement.classList.add("flash-highlight");
      setTimeout(() => checkEl.parentElement.classList.remove("flash-highlight"), 2500);
    }
  },

  highlightSearchOnPage(q) {
    document.querySelectorAll(".dish-card").forEach(card => {
      const text = card.textContent.toLowerCase();
      if (text.includes(q)) {
        card.style.borderColor = "var(--primary-teal)";
        card.style.transform = "scale(1.02)";
      } else {
        card.style.borderColor = "";
        card.style.transform = "";
      }
    });
  },

  clearSearchHighlights() {
    document.querySelectorAll(".dish-card").forEach(card => {
      card.style.borderColor = "";
      card.style.transform = "";
    });
  },

  // Initialize 360 viewer component.
  initViewer360() {
    const container = document.getElementById("viewer360Container");
    if (container && window.TikimViewer360) {
      this.viewer360 = new TikimViewer360("viewer360Container");
    }
  },

  // Initialize event package cards.
  initPackages() {
    const grid = document.getElementById("packagesGrid");
    if (!grid) return;

    const packages = TikimStore.get("packages") || TIKIM_DATA.packages;

    grid.innerHTML = packages.map(pkg => `
      <div class="package-card ${pkg.id === this.state.selectedPackageId ? 'selected-card' : ''}" data-id="${pkg.id}">
        <div class="package-card-img-wrap">
          <img src="${pkg.image}" alt="${pkg.name}" class="package-img" loading="lazy" />
          <span class="package-badge">${pkg.category}</span>
          <div class="package-pax-badge">${pkg.basePax} Guests Included</div>
        </div>
        <div class="package-card-body">
          <h3 class="package-title">${pkg.name}</h3>
          <p class="package-tagline">${pkg.tagline}</p>
          <div class="package-pricing">
            <span class="pkg-base-price">₱${pkg.basePrice.toLocaleString()}</span>
            <span class="pkg-extra-rate">+₱${pkg.pricePerExtraPax}/extra pax</span>
          </div>
          <ul class="package-feature-list">
            ${pkg.features.map(f => `<li><span class="check-icon">&#10003;</span> ${f}</li>`).join('')}
          </ul>
          <div class="package-actions">
            <button class="btn-select-package ${pkg.id === this.state.selectedPackageId ? 'active' : ''}" onclick="TikimApp.selectPackage('${pkg.id}')">
              ${pkg.id === this.state.selectedPackageId ? '<svg class="icon" width="13" height="13" aria-hidden="true" style="vertical-align:middle; margin-right:4px;"><use href="assets/icons/sprite.svg#icon-check"></use></svg> Selected Package' : 'Select Package'}
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  selectPackage(pkgId) {
    this.state.selectedPackageId = pkgId;
    const pkg = TIKIM_DATA.packages.find(p => p.id === pkgId);
    if (pkg) {
      this.state.pax = Math.max(this.state.pax, pkg.basePax);
      // Auto-check package default equipment.
      this.state.selectedEquipment = [...new Set([...pkg.includedEquipment, ...this.state.selectedEquipment])];
      // Auto-check package default entertainers.
      this.state.selectedEntertainers = [...new Set([...pkg.includedEntertainers, ...this.state.selectedEntertainers])];
    }

    this.initPackages();
    this.syncBookingInputs();
    this.updatePriceCalculations();

    const bookingSec = document.getElementById("booking-section");
    if (bookingSec) {
      bookingSec.scrollIntoView({ behavior: "smooth" });
    }
  },

  // Setup booking customizer with real-time pax, equipment, and entertainers.
  initBookingCustomizer() {
    this.renderEquipmentSelectors();
    this.renderEntertainerSelectors();
    this.attachBookingListeners();
  },

  renderEquipmentSelectors() {
    const container = document.getElementById("equipmentChecklist");
    if (!container) return;

    container.innerHTML = TIKIM_DATA.equipment.map(eq => {
      const isChecked = this.state.selectedEquipment.includes(eq.id);
      return `
        <label class="custom-checkbox-item ${isChecked ? 'active' : ''}">
          <input 
            type="checkbox" 
            name="equipment" 
            value="${eq.id}" 
            id="equip-check-${eq.id}"
            ${isChecked ? 'checked' : ''} 
            onchange="TikimApp.toggleEquipment('${eq.id}')"
          />
          <div class="item-visual-thumb">
            <img src="${eq.image}" alt="${eq.name}" />
            ${eq.has360 ? '<span class="thumb-360-badge">360°</span>' : ''}
          </div>
          <div class="item-text-info">
            <span class="item-name">${eq.name}</span>
            <span class="item-desc">${eq.description}</span>
            <div class="item-meta-row">
              <span class="item-price-tag">₱${eq.price.toLocaleString()} ${eq.isPerPax ? '/ pax' : ''}</span>
              <span class="item-stock-tag">Stock: ${eq.stockAvailable} available</span>
            </div>
          </div>
        </label>
      `;
    }).join('');
  },

  renderEntertainerSelectors() {
    const container = document.getElementById("entertainersChecklist");
    if (!container) return;

    container.innerHTML = TIKIM_DATA.entertainers.map(ent => {
      const isChecked = this.state.selectedEntertainers.includes(ent.id);
      const isClown = ent.id === "clown";

      return `
        <div class="entertainer-card-option ${isChecked ? 'active' : ''}">
          <label class="custom-checkbox-item">
            <input 
              type="checkbox" 
              name="entertainer" 
              value="${ent.id}" 
              ${isChecked ? 'checked' : ''} 
              onchange="TikimApp.toggleEntertainer('${ent.id}')"
            />
            <div class="entertainer-info">
              <div class="entertainer-header">
                <span class="ent-role-tag">${ent.role}</span>
                <span class="ent-price-tag">+₱${ent.price.toLocaleString()}</span>
              </div>
              <h4 class="ent-name">${ent.name}</h4>
              <p class="ent-desc">${ent.description}</p>
            </div>
          </label>

          ${isClown ? `
            <div class="clown-suboptions ${isChecked ? 'visible' : ''}">
              <span class="suboption-label">Choose Speciality Act:</span>
              <div class="clown-radio-group">
                <label class="clown-radio">
                  <input 
                    type="radio" 
                    name="clownType" 
                    value="magician" 
                    ${this.state.clownOption === 'magician' ? 'checked' : ''} 
                    onchange="TikimApp.setClownOption('magician')"
                  />
                  <span>Stage Illusionist Magician (+₱1,500)</span>
                </label>
                <label class="clown-radio">
                  <input 
                    type="radio" 
                    name="clownType" 
                    value="puppet" 
                    ${this.state.clownOption === 'puppet' ? 'checked' : ''} 
                    onchange="TikimApp.setClownOption('puppet')"
                  />
                  <span>Ventriloquist Puppet Show (+₱1,000)</span>
                </label>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  attachBookingListeners() {
    const paxInput = document.getElementById("paxInput");
    const paxRange = document.getElementById("paxRange");
    const dateInput = document.getElementById("eventDateInput");
    const timeSlotSelect = document.getElementById("timeSlotSelect");

    if (paxInput && paxRange) {
      paxInput.addEventListener("input", (e) => {
        let val = parseInt(e.target.value) || 20;
        val = Math.max(20, Math.min(800, val));
        this.state.pax = val;
        paxRange.value = val;
        this.updatePriceCalculations();
      });

      paxRange.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        this.state.pax = val;
        paxInput.value = val;
        this.updatePriceCalculations();
      });
    }

    if (dateInput) {
      dateInput.value = this.state.eventDate;
      dateInput.addEventListener("change", (e) => {
        this.state.eventDate = e.target.value;
        this.checkDateAvailability();
      });
    }

    if (timeSlotSelect) {
      timeSlotSelect.addEventListener("change", (e) => {
        this.state.timeSlot = e.target.value;
        this.checkDateAvailability();
      });
    }

    // Set minimum date to today.
    const today = new Date().toISOString().split("T")[0];
    if (dateInput) dateInput.min = today;
  },

  toggleEquipment(id) {
    if (this.state.selectedEquipment.includes(id)) {
      this.state.selectedEquipment = this.state.selectedEquipment.filter(x => x !== id);
    } else {
      this.state.selectedEquipment.push(id);
    }
    this.renderEquipmentSelectors();
    this.updatePriceCalculations();
  },

  addRentalToBooking(itemKey) {
    const map = {
      chair: "wooden-chair",
      table: "round-table",
      lights: "lighting-rig"
    };
    const equipId = map[itemKey];
    if (equipId && !this.state.selectedEquipment.includes(equipId)) {
      this.state.selectedEquipment.push(equipId);
      this.renderEquipmentSelectors();
      this.updatePriceCalculations();
      this.showToast(`Added ${itemKey.toUpperCase()} rental to your event package quotation!`);
    } else {
      this.showToast(`${itemKey.toUpperCase()} is already in your selected equipment.`);
    }
  },

  toggleEntertainer(id) {
    if (this.state.selectedEntertainers.includes(id)) {
      this.state.selectedEntertainers = this.state.selectedEntertainers.filter(x => x !== id);
    } else {
      this.state.selectedEntertainers.push(id);
    }
    this.renderEntertainerSelectors();
    this.updatePriceCalculations();
  },

  setClownOption(opt) {
    this.state.clownOption = opt;
    this.updatePriceCalculations();
  },

  // Double-booking prevention algorithm checking existing confirmed dates and slots.
  checkDateAvailability() {
    const chosenDate = this.state.eventDate;
    const chosenSlot = this.state.timeSlot;
    const alertBox = document.getElementById("availabilityAlert");
    if (!alertBox) return;

    const booked = TIKIM_DATA.bookedDates.find(b => b.date === chosenDate);

    if (booked) {
      const isConflict = booked.slot === "Full Day" || chosenSlot === "Full Day" || booked.slot.toLowerCase().includes(chosenSlot.toLowerCase());

      if (isConflict) {
        alertBox.className = "availability-banner conflict";
        alertBox.innerHTML = `
          <div class="banner-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="banner-text">
            <strong>Date Conflict Detected!</strong>
            <span>${chosenDate} (${booked.slot}) is currently reserved for "${booked.eventName}". Please select another time slot or date to prevent double booking.</span>
          </div>
        `;
        return false;
      }
    }

    alertBox.className = "availability-banner available";
    alertBox.innerHTML = `
      <div class="banner-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="banner-text">
        <strong>Date & Time Slot Available!</strong>
        <span>${chosenDate} is 100% open for ${chosenSlot}. Lock this date immediately with 50% downpayment.</span>
      </div>
    `;
    return true;
  },

  // Via Mare inspired catering menu with smooth scroll categories and sync.
  initViaMareMenu() {
    this.renderMenuCategoriesNav();
    this.renderDishesList();
    this.initMenuScrollSpy();
  },

  renderMenuCategoriesNav() {
    const nav = document.getElementById("menuCategoryScrollNav");
    if (!nav) return;

    nav.innerHTML = TIKIM_DATA.menuCategories.map((cat, idx) => `
      <button 
        class="menu-category-btn ${idx === 0 ? 'active' : ''}" 
        data-cat="${cat.id}"
        onclick="TikimApp.scrollToCategory('${cat.id}')"
      >
        ${cat.name}
      </button>
    `).join('');
  },

  scrollToCategory(catId) {
    const target = document.getElementById(`section-cat-${catId}`);
    if (target) {
      const headerOffset = 140;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  },

  renderDishesList() {
    const container = document.getElementById("menuDishesContainer");
    if (!container) return;

    container.innerHTML = TIKIM_DATA.menuCategories.map(cat => {
      const categoryDishes = TIKIM_DATA.dishes.filter(d => d.categoryId === cat.id);
      if (categoryDishes.length === 0) return '';

      return `
        <div class="menu-category-block" id="section-cat-${cat.id}">
          <div class="category-block-header">
            <h3 class="category-headline">${cat.name}</h3>
            <p class="category-subtext">${cat.description}</p>
          </div>
          <div class="dishes-grid">
            ${categoryDishes.map(dish => {
              const isSelected = this.state.selectedDishes.includes(dish.id);
              return `
                <div class="dish-card ${isSelected ? 'selected-dish' : ''}" id="dish-card-${dish.id}">
                  <div class="dish-card-header">
                    <div class="dish-tags-row">
                      <span class="dietary-tag">${dish.dietary}</span>
                      ${dish.isSignature ? '<span class="signature-tag">Signature</span>' : ''}
                    </div>
                    <div class="dish-price-pill">
                      ₱${dish.pricePerHead}<span class="per-head">/head</span>
                    </div>
                  </div>
                  <h4 class="dish-title">${dish.name}</h4>
                  <p class="dish-description">${dish.description}</p>
                  <div class="dish-card-footer">
                    <span class="tray-spec">Catering Buffet & Tray Available (₱${dish.trayPrice.toLocaleString()})</span>
                    <button 
                      class="btn-dish-toggle ${isSelected ? 'in-plan' : ''}" 
                      onclick="TikimApp.toggleDishSelection('${dish.id}')"
                    >
                      ${isSelected ? '<svg class="icon" width="13" height="13" aria-hidden="true" style="vertical-align:middle; margin-right:4px;"><use href="assets/icons/sprite.svg#icon-check"></use></svg> In Menu Plan' : '+ Add to Tasting / Menu'}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  initMenuScrollSpy() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const catId = entry.target.id.replace("section-cat-", "");
          document.querySelectorAll(".menu-category-btn").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-cat") === catId);
          });
        }
      });
    }, { rootMargin: "-25% 0px -65% 0px" });

    document.querySelectorAll(".menu-category-block").forEach(block => {
      observer.observe(block);
    });
  },

  toggleDishSelection(dishId) {
    if (this.state.selectedDishes.includes(dishId)) {
      this.state.selectedDishes = this.state.selectedDishes.filter(id => id !== dishId);
    } else {
      this.state.selectedDishes.push(dishId);
    }
    this.renderDishesList();
    this.updatePriceCalculations();
  },

  // Real-time price computation with 50% downpayment requirement.
  computePricing() {
    const pkg = TIKIM_DATA.packages.find(p => p.id === this.state.selectedPackageId) || TIKIM_DATA.packages[0];
    const pax = this.state.pax;

    // 1. Package Base + Extra Pax
    let packageTotal = pkg.basePrice;
    const extraPax = Math.max(0, pax - pkg.basePax);
    const extraPaxCost = extraPax * pkg.pricePerExtraPax;
    packageTotal += extraPaxCost;

    // 2. Equipment Total
    let equipmentTotal = 0;
    const itemizedEquipment = [];

    this.state.selectedEquipment.forEach(eqId => {
      const eq = TIKIM_DATA.equipment.find(e => e.id === eqId);
      if (eq) {
        let cost = eq.price;
        let qty = 1;
        if (eq.isPerPax) {
          cost = eq.price * pax;
          qty = pax;
        } else if (eq.id === "round-table") {
          // 1 table for every 5 pax
          qty = Math.ceil(pax / 5);
          cost = eq.price * qty;
        }
        equipmentTotal += cost;
        itemizedEquipment.push({ ...eq, qty, totalCost: cost });
      }
    });

    // 3. Entertainers Total
    let entertainerTotal = 0;
    const itemizedEntertainers = [];

    this.state.selectedEntertainers.forEach(entId => {
      const ent = TIKIM_DATA.entertainers.find(e => e.id === entId);
      if (ent) {
        let cost = ent.price;
        let extraNote = "";
        if (ent.id === "clown") {
          if (this.state.clownOption === "magician") {
            cost += 1500;
            extraNote = " (with Stage Illusionist Magic)";
          } else {
            cost += 1000;
            extraNote = " (with Ventriloquist Puppet Show)";
          }
        }
        entertainerTotal += cost;
        itemizedEntertainers.push({ ...ent, totalCost: cost, extraNote });
      }
    });

    // 4. Menu Selection Cost (if customized above base inclusions)
    let dishesPerHeadTotal = 0;
    this.state.selectedDishes.forEach(dId => {
      const dish = TIKIM_DATA.dishes.find(d => d.id === dId);
      if (dish) dishesPerHeadTotal += dish.pricePerHead;
    });

    // Base package already covers standard buffet per pax. Extra dishes or premium tasting is factored.
    const cateringEstimatedValue = pax * (dishesPerHeadTotal || 650);

    // Grand Total & Downpayment
    const grandTotal = packageTotal + equipmentTotal + entertainerTotal;
    const downpaymentRequired = Math.round(grandTotal * 0.50);
    const remainingBalance = grandTotal - downpaymentRequired;

    return {
      pkg,
      pax,
      extraPax,
      extraPaxCost,
      packageTotal,
      itemizedEquipment,
      equipmentTotal,
      itemizedEntertainers,
      entertainerTotal,
      dishesCount: this.state.selectedDishes.length,
      cateringEstimatedValue,
      grandTotal,
      downpaymentRequired,
      remainingBalance
    };
  },

  updatePriceCalculations() {
    const p = this.computePricing();

    // Update real-time summary widget on sidebar and modal.
    const subtotalEl = document.getElementById("calcPackageSubtotal");
    const equipEl = document.getElementById("calcEquipmentTotal");
    const entEl = document.getElementById("calcEntertainerTotal");
    const grandEl = document.getElementById("calcGrandTotal");
    const downpayEl = document.getElementById("calcDownpaymentRequired");
    const balanceEl = document.getElementById("calcRemainingBalance");
    const itemsCountEl = document.getElementById("headerItemsCount");
    const paxSummaryEl = document.getElementById("summaryPaxDisplay");

    if (subtotalEl) subtotalEl.textContent = `₱${p.packageTotal.toLocaleString()}`;
    if (equipEl) equipEl.textContent = `₱${p.equipmentTotal.toLocaleString()}`;
    if (entEl) entEl.textContent = `₱${p.entertainerTotal.toLocaleString()}`;
    if (grandEl) grandEl.textContent = `₱${p.grandTotal.toLocaleString()}`;
    if (downpayEl) downpayEl.textContent = `₱${p.downpaymentRequired.toLocaleString()}`;
    if (balanceEl) balanceEl.textContent = `₱${p.remainingBalance.toLocaleString()}`;
    if (paxSummaryEl) paxSummaryEl.textContent = `${p.pax} Guests (${p.extraPax > 0 ? `+${p.extraPax} extra pax` : 'Base Pax'})`;

    const totalSelectedCount = this.state.selectedEquipment.length + this.state.selectedEntertainers.length + this.state.selectedDishes.length;
    if (itemsCountEl) itemsCountEl.textContent = totalSelectedCount;

    this.checkDateAvailability();
  },

  syncBookingInputs() {
    const paxInput = document.getElementById("paxInput");
    const paxRange = document.getElementById("paxRange");
    if (paxInput) paxInput.value = this.state.pax;
    if (paxRange) paxRange.value = this.state.pax;
    this.renderEquipmentSelectors();
    this.renderEntertainerSelectors();
  },

  // Event Gallery with filtering and lightbox preview.
  initGallery() {
    this.renderGalleryGrid();
  },

  renderGalleryGrid() {
    const grid = document.getElementById("galleryGrid");
    if (!grid) return;

    const galleryItems = [
      { id: "g1", title: "Royal Glasshouse Wedding", cat: "wedding", img: "assets/gallery-wedding.jpg", desc: "Long wooden rustic tables, hanging fairy wisteria lights and 5-course catering." },
      { id: "g2", title: "Whimsical 5th Birthday Wonderland", cat: "birthday", img: "assets/gallery-birthday.jpg", desc: "Custom 3D styro stage lettering, organic balloon entrance archway and kids buffet." },
      { id: "g3", title: "Philippine Leadership Gala & Awards", cat: "corporate", img: "assets/gallery-corporate.jpg", desc: "120-pax round banquet setup, DMX par spotlights, truss audio and executive dinner." },
      { id: "g4", title: "Alumni Homecoming Fiesta Reunion", cat: "reunion", img: "assets/gallery-reunion.jpg", desc: "Festoon canopy garden setup, carved whole lechon station, and family tables." },
      { id: "g5", title: "Instant Souvenir Photobooth Station", cat: "photobooth", img: "assets/gallery-photobooth.jpg", desc: "3 hours unlimited photo prints with magnetic backing and custom branding." },
      { id: "g6", title: "Rustic Beechwood Cross-Back Chairs", cat: "styling", img: "assets/rental-chair.jpg", desc: "Curved back design with high density padded cushions for comfort and grace." },
      { id: "g7", title: "Banquet Centerpiece and Table Setting", cat: "styling", img: "assets/rental-table.jpg", desc: "Floor length damask linen with crystal glassware and fresh white ranunculus." }
    ];

    const filtered = this.state.activeGalleryFilter === "all" 
      ? galleryItems 
      : galleryItems.filter(g => g.cat === this.state.activeGalleryFilter);

    grid.innerHTML = filtered.map(item => `
      <div class="gallery-item-card" onclick="TikimApp.openLightbox('${item.img}', '${item.title}', '${item.desc}')">
        <div class="gallery-thumb-wrap">
          <img src="${item.img}" alt="${item.title}" loading="lazy" />
          <div class="gallery-overlay">
            <span class="gallery-cat-badge">${item.cat.toUpperCase()}</span>
            <h4 class="gallery-title">${item.title}</h4>
            <p class="gallery-desc">${item.desc}</p>
            <span class="view-btn">View Photo & Details &rarr;</span>
          </div>
        </div>
      </div>
    `).join('');
  },

  filterGallery(cat) {
    this.state.activeGalleryFilter = cat;
    document.querySelectorAll(".gallery-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-cat") === cat);
    });
    this.renderGalleryGrid();
  },

  openLightbox(imgSrc, title, desc) {
    const modal = document.getElementById("galleryLightboxModal");
    if (!modal) return;
    document.getElementById("lightboxImage").src = imgSrc;
    document.getElementById("lightboxTitle").textContent = title;
    document.getElementById("lightboxDesc").textContent = desc;
    modal.classList.add("open");
  },

  closeLightbox() {
    const modal = document.getElementById("galleryLightboxModal");
    if (modal) modal.classList.remove("open");
  },

  // Organizer Hub Dashboard implementation.
  initOrganizerPortal() {
    this.renderOrganizerPackages();
    this.renderOrganizerInventory();
    this.renderOrganizerVendors();
    this.renderOrganizerBookings();
    this.renderOrganizerTurnover();
  },

  renderOrganizerPackages() {
    const table = document.getElementById("organizerPackagesTable");
    if (!table) return;

    const packages = TikimStore.get("packages") || TIKIM_DATA.packages;

    table.innerHTML = packages.map(pkg => `
      <tr>
        <td><strong>${pkg.name}</strong><br><small class="text-muted">${pkg.category}</small></td>
        <td>${pkg.basePax} Guests</td>
        <td>₱${pkg.basePrice.toLocaleString()}</td>
        <td>+₱${pkg.pricePerExtraPax}/pax</td>
        <td><span class="status-badge active">Active Online</span></td>
        <td>
          <button class="btn-table-action" onclick="TikimApp.editPackagePrice('${pkg.id}')">Edit Price</button>
        </td>
      </tr>
    `).join('');
  },

  editPackagePrice(pkgId) {
    const packages = TikimStore.get("packages") || TIKIM_DATA.packages;
    const pkg = packages.find(p => p.id === pkgId);
    if (!pkg) return;

    const newPrice = prompt(`Enter new Base Price for ${pkg.name}:`, pkg.basePrice);
    if (newPrice && !isNaN(newPrice)) {
      pkg.basePrice = parseFloat(newPrice);
      TikimStore.set("packages", packages);
      this.initPackages();
      this.renderOrganizerPackages();
      this.updatePriceCalculations();
      this.showToast(`Updated price for ${pkg.name} to ₱${pkg.basePrice.toLocaleString()}`);
    }
  },

  renderOrganizerInventory() {
    const table = document.getElementById("organizerInventoryTable");
    if (!table) return;

    table.innerHTML = TIKIM_DATA.equipment.map(eq => `
      <tr>
        <td>
          <div class="table-equip-cell">
            <img src="${eq.image}" class="table-mini-thumb" />
            <div>
              <strong>${eq.name}</strong><br>
              <small class="text-muted">${eq.category}</small>
            </div>
          </div>
        </td>
        <td>${eq.stockTotal}</td>
        <td><strong class="text-success">${eq.stockAvailable}</strong></td>
        <td>₱${eq.price.toLocaleString()} ${eq.isPerPax ? '/pax' : ''}</td>
        <td><span class="status-badge ${eq.stockAvailable > 0 ? 'available' : 'low-stock'}">${eq.condition}</span></td>
        <td>
          <button class="btn-table-action" onclick="TikimApp.adjustStock('${eq.id}')">Adjust Qty</button>
        </td>
      </tr>
    `).join('');
  },

  adjustStock(eqId) {
    const eq = TIKIM_DATA.equipment.find(e => e.id === eqId);
    if (!eq) return;

    const newTotal = prompt(`Adjust Total Stock for ${eq.name}:`, eq.stockTotal);
    if (newTotal && !isNaN(newTotal)) {
      eq.stockTotal = parseInt(newTotal);
      eq.stockAvailable = Math.min(eq.stockTotal, eq.stockAvailable);
      this.renderOrganizerInventory();
      this.renderEquipmentSelectors();
      this.showToast(`Updated inventory for ${eq.name}`);
    }
  },

  renderOrganizerVendors() {
    const list = document.getElementById("organizerVendorsList");
    if (!list) return;

    list.innerHTML = TIKIM_DATA.vendors.map(v => `
      <div class="vendor-card">
        <div class="vendor-card-header">
          <span class="vendor-type-badge">${v.type}</span>
          <span class="status-badge active">${v.status}</span>
        </div>
        <h4 class="vendor-name">${v.name}</h4>
        <div class="vendor-contact">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          ${v.contact}
        </div>
      </div>
    `).join('');
  },

  renderOrganizerBookings() {
    const tbody = document.getElementById("organizerBookingsTable");
    if (!tbody) return;

    const bookings = TikimStore.get("bookings") || TIKIM_DATA.initialBookings;

    tbody.innerHTML = bookings.map(b => `
      <tr>
        <td><strong>${b.bookingId}</strong><br><small class="text-muted">${b.createdDate}</small></td>
        <td>
          <strong>${b.customerName}</strong><br>
          <small>${b.contactNumber}</small>
        </td>
        <td>
          <span class="text-primary font-weight-bold">${b.eventDate}</span><br>
          <small>${b.timeSlot}</small>
        </td>
        <td>${b.packageName}<br><small>${b.pax} Pax</small></td>
        <td>
          <strong>₱${b.totalAmount.toLocaleString()}</strong><br>
          <small class="text-success">50% Downpayment: ₱${b.downpaymentAmount.toLocaleString()}</small>
        </td>
        <td>
          <span class="status-badge ${b.paymentStatus.includes('Confirmed') ? 'paid' : 'pending'}">${b.paymentStatus}</span>
        </td>
        <td>
          <button class="btn-table-action" onclick="TikimApp.openTurnoverReportModal('${b.bookingId}')">Turnover Sheet</button>
        </td>
      </tr>
    `).join('');
  },

  renderOrganizerTurnover() {
    const list = document.getElementById("turnoverEventsSummary");
    if (!list) return;

    const bookings = TikimStore.get("bookings") || TIKIM_DATA.initialBookings;
    list.innerHTML = bookings.map(b => `
      <div class="turnover-summary-card">
        <div class="turnover-header">
          <strong>${b.eventName || b.packageName}</strong>
          <span class="status-badge active">${b.turnoverStatus}</span>
        </div>
        <div class="turnover-meta">
          <span>Client: ${b.customerName}</span> | 
          <span>Date: ${b.eventDate}</span> | 
          <span>Pax: ${b.pax}</span>
        </div>
        <button class="btn-secondary btn-sm" onclick="TikimApp.openTurnoverReportModal('${b.bookingId}')">
          Open Ingress / Egress Inspection
        </button>
      </div>
    `).join('');
  },

  // Switch between customer interface and organizer portal.
  toggleRole() {
    this.state.currentRole = this.state.currentRole === "customer" ? "organizer" : "customer";
    const organizerHub = document.getElementById("organizerHubSection");
    const customerSections = document.querySelectorAll(".customer-view-section");
    const roleLabel = document.getElementById("roleLabel");
    const mobileBtn = document.getElementById("btnMobileToggleOrganizer");

    if (this.state.currentRole === "organizer") {
      if (organizerHub) organizerHub.classList.add("visible");
      customerSections.forEach(s => s.classList.add("organizer-hidden"));
      if (roleLabel) roleLabel.textContent = "Exit to Customer View";
      if (mobileBtn) mobileBtn.textContent = "Exit to Customer View";
      this.initOrganizerPortal();
      organizerHub.scrollIntoView({ behavior: "smooth" });
    } else {
      if (organizerHub) organizerHub.classList.remove("visible");
      customerSections.forEach(s => s.classList.remove("organizer-hidden"));
      if (roleLabel) roleLabel.textContent = "Organizer Hub";
      if (mobileBtn) mobileBtn.textContent = "Switch to Organizer Hub";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  },

  // Open Full Official Quotation Breakdown Modal.
  openQuotationModal() {
    const modal = document.getElementById("quotationModal");
    if (!modal) return;

    const p = this.computePricing();
    const date = this.state.eventDate;
    const timeSlot = this.state.timeSlot;

    document.getElementById("modalClientName").textContent = this.state.clientName || "Valued Client";
    document.getElementById("modalEventDate").textContent = `${date} (${timeSlot})`;
    document.getElementById("modalPackageName").textContent = p.pkg.name;
    document.getElementById("modalPax").textContent = `${p.pax} Guests`;

    const breakdownTbody = document.getElementById("quotationBreakdownBody");
    breakdownTbody.innerHTML = `
      <tr>
        <td><strong>${p.pkg.name} Base Package</strong><br><small class="text-muted">Includes ${p.pkg.basePax} guests, setup, styling, and standard service</small></td>
        <td>1 Package</td>
        <td>₱${p.pkg.basePrice.toLocaleString()}</td>
      </tr>
      ${p.extraPax > 0 ? `
        <tr>
          <td><strong>Additional Guests (${p.extraPax} Pax)</strong><br><small class="text-muted">₱${p.pkg.pricePerExtraPax} per additional attendee</small></td>
          <td>${p.extraPax} Pax</td>
          <td>₱${p.extraPaxCost.toLocaleString()}</td>
        </tr>
      ` : ''}
      ${p.itemizedEquipment.map(eq => `
        <tr>
          <td><strong>${eq.name}</strong><br><small class="text-muted">${eq.description}</small></td>
          <td>${eq.qty} unit(s)</td>
          <td>₱${eq.totalCost.toLocaleString()}</td>
        </tr>
      `).join('')}
      ${p.itemizedEntertainers.map(ent => `
        <tr>
          <td><strong>${ent.name}${ent.extraNote || ''}</strong><br><small class="text-muted">${ent.description}</small></td>
          <td>1 Service</td>
          <td>₱${ent.totalCost.toLocaleString()}</td>
        </tr>
      `).join('')}
      <tr>
        <td><strong>Via Mare Inspired Menu Courses (${this.state.selectedDishes.length} Selected)</strong><br><small class="text-muted">Tasting setup, chafing dishes, and dining service</small></td>
        <td>${p.pax} Pax</td>
        <td>Included in Package Plan</td>
      </tr>
    `;

    document.getElementById("modalGrandTotal").textContent = `₱${p.grandTotal.toLocaleString()}`;
    document.getElementById("modalDownpaymentRequired").textContent = `₱${p.downpaymentRequired.toLocaleString()}`;
    document.getElementById("modalRemainingBalance").textContent = `₱${p.remainingBalance.toLocaleString()}`;

    modal.classList.add("open");
  },

  closeQuotationModal() {
    const modal = document.getElementById("quotationModal");
    if (modal) modal.classList.remove("open");
  },

  // Open Downpayment Simulation and Booking Confirmation Dialog.
  openDownpaymentModal() {
    this.closeQuotationModal();
    const modal = document.getElementById("downpaymentModal");
    if (!modal) return;

    const p = this.computePricing();
    document.getElementById("downpayAmountText").textContent = `₱${p.downpaymentRequired.toLocaleString()}`;
    document.getElementById("downpayTotalText").textContent = `₱${p.grandTotal.toLocaleString()}`;
    modal.classList.add("open");
  },

  closeDownpaymentModal() {
    const modal = document.getElementById("downpaymentModal");
    if (modal) modal.classList.remove("open");
  },

  // Confirm booking with simulated 50% downpayment transaction.
  confirmDownpaymentBooking(paymentMethod) {
    const agreementCheck = document.getElementById("modalAgreementCheck");
    if (agreementCheck && !agreementCheck.checked) {
      alert("Please confirm your agreement to the Event Agreement Checklist (50% Downpayment policy and Turnover terms) before proceeding.");
      return;
    }

    const p = this.computePricing();
    const refNum = `${paymentMethod.substring(0, 3).toUpperCase()}-${Math.floor(100000000 + Math.random() * 900000000)}`;
    const newBookingId = `TKM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newBooking = {
      bookingId: newBookingId,
      customerName: this.state.clientName || "Maria Clara",
      contactNumber: this.state.clientPhone || "0917-889-4421",
      messenger: this.state.clientMessenger || "mariaclara.events",
      eventDate: this.state.eventDate,
      timeSlot: this.state.timeSlot,
      eventType: p.pkg.category,
      packageName: p.pkg.name,
      pax: p.pax,
      totalAmount: p.grandTotal,
      downpaymentAmount: p.downpaymentRequired,
      balanceAmount: p.remainingBalance,
      paymentStatus: "Downpayment Confirmed",
      paymentMethod: paymentMethod,
      referenceNumber: refNum,
      agreementSigned: true,
      smsSent: true,
      turnoverStatus: "Checklist Prepared",
      createdDate: new Date().toISOString().split("T")[0]
    };

    // Update persistent store.
    const bookings = TikimStore.get("bookings") || TIKIM_DATA.initialBookings;
    bookings.unshift(newBooking);
    TikimStore.set("bookings", bookings);

    // Also add to booked dates for double-booking prevention.
    TIKIM_DATA.bookedDates.push({
      date: newBooking.eventDate,
      slot: newBooking.timeSlot.includes("Evening") ? "Evening" : newBooking.timeSlot.includes("Morning") ? "Morning" : "Full Day",
      eventName: `${newBooking.customerName}'s ${newBooking.eventType}`,
      client: newBooking.customerName,
      pax: newBooking.pax,
      package: newBooking.packageName,
      status: "Confirmed"
    });

    this.closeDownpaymentModal();
    this.openSuccessModal(newBooking);
    this.renderOrganizerBookings();
    this.checkDateAvailability();
  },

  openSuccessModal(booking) {
    const modal = document.getElementById("bookingSuccessModal");
    if (!modal) return;

    document.getElementById("successBookingId").textContent = booking.bookingId;
    document.getElementById("successRefNum").textContent = booking.referenceNumber;
    document.getElementById("successDownpayAmount").textContent = `₱${booking.downpaymentAmount.toLocaleString()}`;
    document.getElementById("successBalanceAmount").textContent = `₱${booking.balanceAmount.toLocaleString()}`;
    document.getElementById("successDate").textContent = `${booking.eventDate} (${booking.timeSlot})`;

    modal.classList.add("open");
  },

  closeSuccessModal() {
    const modal = document.getElementById("bookingSuccessModal");
    if (modal) modal.classList.remove("open");
  },

  // Live SMS Reminders Simulation Dialog.
  showSmsReminderSimulation() {
    const modal = document.getElementById("smsSimulationModal");
    if (!modal) return;

    const p = this.computePricing();
    const phone = this.state.clientPhone || "0917-889-4421";
    const name = this.state.clientName || "Maria Clara";
    const date = this.state.eventDate;

    document.getElementById("smsPhoneTarget").textContent = phone;
    document.getElementById("smsMessageBody").innerHTML = `
      <strong>[DACK'S CATERING & TIKIM]</strong><br>
      Hi ${name}! Your event date for <strong>${date}</strong> (${p.pkg.name}) is officially <strong>LOCKED & CONFIRMED</strong>.<br><br>
      Payment Received: ₱${p.downpaymentRequired.toLocaleString()} (50% Downpayment Verified).<br>
      Remaining Balance: ₱${p.remainingBalance.toLocaleString()} due on event date upon turnover.<br><br>
      Your event coordinator will contact you 7 days before event for final ingress checklist. Salamat sa tiwala!
    `;

    modal.classList.add("open");
  },

  closeSmsSimulation() {
    const modal = document.getElementById("smsSimulationModal");
    if (modal) modal.classList.remove("open");
  },

  // Equipment Turnover Report and Checklist Modal.
  openTurnoverReportModal(bookingId) {
    const modal = document.getElementById("turnoverModal");
    if (!modal) return;

    const bookings = TikimStore.get("bookings") || TIKIM_DATA.initialBookings;
    const b = bookings.find(item => item.bookingId === bookingId) || bookings[0];

    document.getElementById("turnoverBookingId").textContent = b.bookingId;
    document.getElementById("turnoverClientName").textContent = b.customerName;
    document.getElementById("turnoverDate").textContent = b.eventDate;

    const tableBody = document.getElementById("turnoverItemsTable");
    tableBody.innerHTML = `
      <tr>
        <td>Rustic Wooden Cross-Back Chairs</td>
        <td>${b.pax} pcs</td>
        <td><span class="status-badge available">Ingress Passed</span></td>
        <td>Polished beechwood, padded cushions complete.</td>
      </tr>
      <tr>
        <td>60-Inch Round Banquet Tables</td>
        <td>${Math.ceil(b.pax / 10)} pcs</td>
        <td><span class="status-badge available">Ingress Passed</span></td>
        <td>Linen pressed and spotless, floral vases set.</td>
      </tr>
      <tr>
        <td>Stage Lighting Rig & Par Cans</td>
        <td>1 Set (4 fixtures)</td>
        <td><span class="status-badge available">Ingress Passed</span></td>
        <td>DMX cables, controller tested and calibrated.</td>
      </tr>
      <tr>
        <td>Photobooth Station & Camera Rig</td>
        <td>1 Unit</td>
        <td><span class="status-badge available">Ingress Passed</span></td>
        <td>Laminator, magnetic sticker paper 300+ loaded.</td>
      </tr>
      <tr>
        <td>Buffet Utensils & Stainless Chafing Dishes</td>
        <td>8 Sets</td>
        <td><span class="status-badge available">Ingress Passed</span></td>
        <td>Food warmers, ladles, dinnerware sanitized.</td>
      </tr>
    `;

    modal.classList.add("open");
  },

  closeTurnoverModal() {
    const modal = document.getElementById("turnoverModal");
    if (modal) modal.classList.remove("open");
  },

  // Unique Feature: Instant VIP Messenger FastPass export.
  exportMessengerFastPass() {
    const p = this.computePricing();
    const lockId = `TK-FAST-${Math.floor(100000 + Math.random() * 900000)}`;
    const msg = `Kumusta Dack's Catering & Tikim! Naka-lock na po ang aking online quotation:
- Reference Token: ${lockId}
- Package: ${p.pkg.name} (${p.pax} Pax)
- Date: ${this.state.eventDate} (${this.state.timeSlot})
- Computed Total: ₱${p.grandTotal.toLocaleString()}
- Ready for 50% Downpayment: ₱${p.downpaymentRequired.toLocaleString()}
Gusto ko na pong i-finalize ang agreement at turnover. Salamat po!`;

    navigator.clipboard.writeText(msg).then(() => {
      alert(`Tikim FastPass Token (${lockId}) copied to clipboard!\n\nYou can now paste it into Facebook Messenger or Viber without repeating pax count, items, or pricing.`);
    }).catch(() => {
      prompt("Copy your Tikim FastPass reservation summary:", msg);
    });
  },

  // Simple toast notification feedback.
  showToast(msg) {
    let toast = document.getElementById("tikimToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "tikimToast";
      toast.className = "tikim-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3200);
  },

  // Global event bindings and mobile drawer.
  attachGlobalEvents() {
    const toggleOrganizerBtn = document.getElementById("btnToggleOrganizer");
    const mobileOrganizerBtn = document.getElementById("btnMobileToggleOrganizer");
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const mobileDrawer = document.getElementById("mobileDrawer");
    const floatingQuoteBtn = document.getElementById("floatingQuoteBtn");

    if (toggleOrganizerBtn) {
      toggleOrganizerBtn.addEventListener("click", () => this.toggleRole());
    }

    if (mobileOrganizerBtn) {
      mobileOrganizerBtn.addEventListener("click", () => {
        this.toggleRole();
        if (mobileDrawer) mobileDrawer.classList.remove("open");
      });
    }

    if (mobileMenuBtn && mobileDrawer) {
      mobileMenuBtn.addEventListener("click", () => {
        mobileDrawer.classList.toggle("open");
      });

      document.querySelectorAll(".mobile-link").forEach(link => {
        link.addEventListener("click", () => {
          mobileDrawer.classList.remove("open");
        });
      });
    }

    if (floatingQuoteBtn) {
      floatingQuoteBtn.addEventListener("click", () => this.openQuotationModal());
    }

    // Client contact input sync.
    const nameInput = document.getElementById("clientNameInput");
    const phoneInput = document.getElementById("clientPhoneInput");
    const messengerInput = document.getElementById("clientMessengerInput");
    const notesInput = document.getElementById("specialNotesInput");

    if (nameInput) nameInput.addEventListener("input", e => this.state.clientName = e.target.value);
    if (phoneInput) phoneInput.addEventListener("input", e => this.state.clientPhone = e.target.value);
    if (messengerInput) messengerInput.addEventListener("input", e => this.state.clientMessenger = e.target.value);
    if (notesInput) notesInput.addEventListener("input", e => this.state.specialRequests = e.target.value);
  }
};

window.TikimApp = TikimApp;
