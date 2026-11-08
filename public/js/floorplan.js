/**
 * TIKIM 2D Top-Down SVG Venue Floor Planner (Revision 17C)
 * Single-space 100dvh layout, always-visible left palette, 5-seat round tables, 4-seat square tables,
 * floating action bar, corner flush clamping on rotated bounding box,
 * stable pointer-captured drag engine, inline SVG layout previews, and zero emojis.
 */

import { icon, plannerIcon } from './icons.js';
import { saveLayout, listLayouts, getLayout, deleteLayout } from './mockApi.js';
import { showConfirmDialog } from './draftStore.js';
import { renderLayoutPreviewSvg, generateSafeThumbnail } from './layoutPreview.js';
import { showToast } from './layout.js';

export class TikimFloorPlanner {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      pax: options.pax || (options.isMini ? 60 : 80),
      venuePreset: options.venuePreset || 'medium',
      onLayoutChange: options.onLayoutChange || (() => {}),
      onStateChange: options.onStateChange || (() => {}),
      syncWithQuote: options.syncWithQuote ?? true,
      initialItems: options.initialItems || null,
      isMini: options.isMini || false,
      isStudio: options.isStudio || false,
      layoutId: options.layoutId || null,
      layoutName: options.layoutName || null,
      ...options
    };

    this.presets = {
      small: { widthM: 10, heightM: 8, label: 'Small Hall (10 x 8 m)' },
      medium: { widthM: 15, heightM: 10, label: 'Standard Banquet (15 x 10 m)' },
      large: { widthM: 20, heightM: 12, label: 'Grand Ballroom (20 x 12 m)' },
      custom: { widthM: 15, heightM: 10, label: 'Custom Dimensions' }
    };

    this.currentPreset = this.options.venuePreset;
    const preset = this.presets[this.currentPreset] || this.presets.medium;
    this.venueWidthM = preset.widthM;
    this.venueHeightM = preset.heightM;

    // Meters to SVG scale: 1 meter = 40 SVG units
    this.scale = 40;
    this.venueWidth = this.venueWidthM * this.scale;
    this.venueHeight = this.venueHeightM * this.scale;
    this.gridSnap = 0.5 * this.scale; // 20 units = 0.5m
    this.snapEnabled = true;

    this.items = this.options.initialItems ? JSON.parse(JSON.stringify(this.options.initialItems)) : [];
    this.currentLayout = {
      id: this.options.layoutId || null,
      name: this.options.layoutName || null,
      units: this.items,
      venue: preset.label
    };
    this.isDirty = false;

    this.selectedItemId = null;
    this.dragTarget = null;
    this.dragOffset = { x: 0, y: 0 };
    this.activeHandle = null; // 'rotate', 'nw', 'ne', 'se', 'sw'
    this.handleStart = { x: 0, y: 0, angle: 0, w: 0, h: 0, scale: 1 };
    this.pax = this.options.pax;
    this.hasDragged = false;

    // Drag stability tracking
    this.capturedPointerId = null;
    this.draggedElement = null;
    this.isDraggingUnit = false;
    this.dragRafPending = false;
    this.pendingDragPos = null;

    // Zoom and pan state
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    // Undo / Redo history
    this.undoStack = [];
    this.redoStack = [];

    // Active palette category tab
    this.activeCategory = 'Tables';
    this.customFurnitureItems = [];

    this.init();
  }

  async init() {
    this.customFurnitureItems = [];
    this.render();

    if (!this.options.initialItems || this.options.initialItems.length === 0) {
      if (this.options.isMini) {
        this.loadMiniPreloadedLayout();
      } else {
        this.items = [];
      }
    }
    this.setupResponsiveObserver();
  }

  async loadMiniPreloadedLayout() {
    try {
      const res = await fetch('data/landing-layout.json');
      if (res.ok) {
        const layoutData = await res.json();
        if (layoutData && Array.isArray(layoutData.items)) {
          this.items = JSON.parse(JSON.stringify(layoutData.items));
          this.pax = layoutData.guests || 36;
          this.renderItems();
          this.updateSeatMeter();
          return;
        }
      }
    } catch (e) {}

    // Fallback if fetch fails
    this.items = [
      { id: 'landing-stage', type: 'stage', name: 'Stage Platform', category: 'Stage and decor', x: 180, y: 16, width: 240, height: 80, rotation: 0, seats: 0, symbol: 'sym-stage' },
      { id: 'landing-lights-rig', type: 'lights-rig', name: 'Lights Rig', category: 'Stage and decor', x: 180, y: 104, width: 240, height: 20, rotation: 0, seats: 0, symbol: 'sym-lights-rig' },
      { id: 'landing-dance-floor', type: 'dance-floor', name: 'Dance Floor', category: 'Stage and decor', x: 220, y: 148, width: 160, height: 136, rotation: 0, seats: 0, symbol: 'sym-dance-floor' },
      { id: 'landing-arch', type: 'entrance-arc', name: 'Entrance Arch', category: 'Stage and decor', x: 250, y: 368, width: 100, height: 20, rotation: 0, seats: 0, symbol: 'sym-entrance-arc' },
      { id: 'landing-t1', type: 'round-table', name: 'Table 1', category: 'Tables', x: 45, y: 109, width: 70, height: 70, rotation: 0, seats: 5, symbol: 'sym-round-table-5' },
      { id: 'landing-t2', type: 'round-table', name: 'Table 2', category: 'Tables', x: 45, y: 213, width: 70, height: 70, rotation: 0, seats: 5, symbol: 'sym-round-table-5' },
      { id: 'landing-t3', type: 'round-table', name: 'Table 3', category: 'Tables', x: 45, y: 317, width: 70, height: 70, rotation: 0, seats: 5, symbol: 'sym-round-table-5' },
      { id: 'landing-t4', type: 'round-table', name: 'Table 4', category: 'Tables', x: 485, y: 109, width: 70, height: 70, rotation: 0, seats: 5, symbol: 'sym-round-table-5' },
      { id: 'landing-t5', type: 'round-table', name: 'Table 5', category: 'Tables', x: 485, y: 213, width: 70, height: 70, rotation: 0, seats: 5, symbol: 'sym-round-table-5' },
      { id: 'landing-t6', type: 'round-table', name: 'Table 6', category: 'Tables', x: 485, y: 317, width: 70, height: 70, rotation: 0, seats: 5, symbol: 'sym-round-table-5' },
      { id: 'landing-c1', type: 'chair', name: 'Chair 1', category: 'Chairs', x: 48, y: 42, width: 22, height: 22, rotation: 0, seats: 1, symbol: 'sym-chair' },
      { id: 'landing-c2', type: 'chair', name: 'Chair 2', category: 'Chairs', x: 74, y: 42, width: 22, height: 22, rotation: 0, seats: 1, symbol: 'sym-chair' },
      { id: 'landing-c3', type: 'chair', name: 'Chair 3', category: 'Chairs', x: 100, y: 42, width: 22, height: 22, rotation: 0, seats: 1, symbol: 'sym-chair' },
      { id: 'landing-c4', type: 'chair', name: 'Chair 4', category: 'Chairs', x: 480, y: 42, width: 22, height: 22, rotation: 0, seats: 1, symbol: 'sym-chair' },
      { id: 'landing-c5', type: 'chair', name: 'Chair 5', category: 'Chairs', x: 506, y: 42, width: 22, height: 22, rotation: 0, seats: 1, symbol: 'sym-chair' },
      { id: 'landing-c6', type: 'chair', name: 'Chair 6', category: 'Chairs', x: 532, y: 42, width: 22, height: 22, rotation: 0, seats: 1, symbol: 'sym-chair' }
    ];
    this.pax = 36;
    this.renderItems();
    this.updateSeatMeter();
  }

  setPax(pax) {
    this.pax = Math.max(10, Number(pax) || 80);
    this.updateSeatMeter();
  }

  setPreset(presetKey, customW = null, customH = null) {
    this.recordState('Change venue size');
    this.currentPreset = presetKey;
    if (presetKey === 'custom' && customW && customH) {
      this.venueWidthM = Math.max(5, Math.min(60, Number(customW) || 15));
      this.venueHeightM = Math.max(5, Math.min(40, Number(customH) || 10));
    } else if (this.presets[presetKey]) {
      this.venueWidthM = this.presets[presetKey].widthM;
      this.venueHeightM = this.presets[presetKey].heightM;
    }
    this.venueWidth = this.venueWidthM * this.scale;
    this.venueHeight = this.venueHeightM * this.scale;

    // Re-clamp all items inside new venue boundaries
    this.items.forEach(item => this.clampItemToVenue(item));

    this.renderSvgViewbox();
    this.renderItems();
    this.notifyChange();
  }

  render() {
    if (this.options.isMini) {
      this.renderMini();
    } else {
      this.renderFull();
    }
    this.bindEvents();
    this.renderSvgViewbox();
    this.renderPaletteTiles();
    this.renderItems();
    this.updateSeatMeter();
    this.updateHistoryButtons();
  }

  renderMini() {
    this.container.innerHTML = `
      <div class="mini-planner-wrap" style="position: relative; background: #182227; border-radius: 12px; overflow: hidden; padding: 0.75rem;">
        <div class="mini-planner-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
          <div class="mini-chip-row" style="display: flex; gap: 0.4rem; align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7);">Quick add:</span>
            <button type="button" class="tool-btn mini-add-chip" data-type="round-table" style="height: 26px; font-size: 11px;">+ Round (5)</button>
            <button type="button" class="tool-btn mini-add-chip" data-type="square-table" style="height: 26px; font-size: 11px;">+ Square (4)</button>
            <button type="button" class="tool-btn mini-add-chip" data-type="photobooth" style="height: 26px; font-size: 11px;">+ Photobooth</button>
          </div>
          <div class="seat-meter-badge" id="plannerSeatBadge">
            <span class="mini-seat-text">60 / 60 guests</span>
          </div>
        </div>

        <div class="mini-canvas-container" style="position: relative; height: 320px; background: #e4dbcf; border-radius: 8px; overflow: hidden; touch-action: none;">
          <svg id="plannerSvg" class="mini-planner-svg" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; display: block;">
            <defs>
              <pattern id="miniGridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(33, 46, 52, 0.12)" stroke-width="1"/>
              </pattern>
              <pattern id="miniGridMajor" width="80" height="80" patternUnits="userSpaceOnUse">
                <rect width="80" height="80" fill="url(#miniGridPattern)"/>
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(33, 46, 52, 0.22)" stroke-width="1.5"/>
              </pattern>
            </defs>
            <rect id="venueBg" width="100%" height="100%" fill="url(#miniGridMajor)"/>
            <g id="plannerItemsGroup"></g>
          </svg>
        </div>
      </div>
    `;
  }

  renderFull() {
    this.container.innerHTML = `
      <div class="planner-app-shell planner-3col-layout" id="plannerShell">
        <!-- 1. LEFT PALETTE COLUMN (264px desktop / 200px tablet / bottom-sheet mobile) -->
        <aside class="planner-palette-col" id="plannerPaletteCol" aria-label="Floor plan palette">
          <div class="palette-sheet-header">
            <span class="palette-sheet-title">Venue Setup &amp; Items</span>
            <button type="button" class="btn-palette-sheet-close" id="btnPaletteSheetClose" aria-label="Close palette">&times;</button>
          </div>

          <!-- Top Block: Venue, Guests, Seat Meter -->
          <div class="palette-top-block">
            <div class="palette-field-group">
              <label for="plannerVenuePreset" class="palette-field-label">Venue</label>
              <select class="planner-select" id="plannerVenuePreset">
                <option value="small" ${this.currentPreset === 'small' ? 'selected' : ''}>Small Hall (10 x 8 m)</option>
                <option value="medium" ${this.currentPreset === 'medium' ? 'selected' : ''}>Banquet (15 x 10 m)</option>
                <option value="large" ${this.currentPreset === 'large' ? 'selected' : ''}>Ballroom (20 x 12 m)</option>
                <option value="custom" ${this.currentPreset === 'custom' ? 'selected' : ''}>Custom Size</option>
              </select>
            </div>

            <div class="palette-custom-dim" id="customSizeInputs" style="display: ${this.currentPreset === 'custom' ? 'flex' : 'none'};">
              <input type="number" id="customWidthInput" class="planner-input planner-input-num" min="5" max="60" value="${this.venueWidthM}" title="Width in meters">
              <span class="dim-sep">&times;</span>
              <input type="number" id="customHeightInput" class="planner-input planner-input-num" min="5" max="40" value="${this.venueHeightM}" title="Length in meters">
              <span class="dim-unit">m</span>
              <button type="button" class="btn-dim-apply" id="btnApplyCustomSize">Set</button>
            </div>

            <div class="palette-field-group">
              <label for="plannerGuestsInput" class="palette-field-label">Guests</label>
              <input type="number" id="plannerGuestsInput" class="planner-input" min="10" max="1000" step="5" value="${this.pax}">
            </div>

            <div class="seat-meter-badge" id="plannerSeatBadge">
              <span id="seatMeterText">0 seats for ${this.pax} guests</span>
            </div>
          </div>

          <!-- Collapsible Groups Accordion -->
          <div class="palette-accordion" id="paletteAccordion">
            <!-- Tables (open by default) -->
            <div class="palette-group is-open" data-category="Tables">
              <button type="button" class="palette-group-toggle" aria-expanded="true" data-cat="Tables">
                <span class="group-toggle-title">Tables</span>
                <span class="group-toggle-icon">${icon('chevron-down', { size: 14 })}</span>
              </button>
              <div class="palette-group-content">
                <div class="palette-tiles-grid" data-cat="Tables"></div>
              </div>
            </div>

            <!-- Chairs -->
            <div class="palette-group" data-category="Chairs">
              <button type="button" class="palette-group-toggle" aria-expanded="false" data-cat="Chairs">
                <span class="group-toggle-title">Chairs</span>
                <span class="group-toggle-icon">${icon('chevron-down', { size: 14 })}</span>
              </button>
              <div class="palette-group-content">
                <div class="palette-tiles-grid" data-cat="Chairs"></div>
              </div>
            </div>

            <!-- Stage and decor -->
            <div class="palette-group" data-category="Stage and decor">
              <button type="button" class="palette-group-toggle" aria-expanded="false" data-cat="Stage and decor">
                <span class="group-toggle-title">Stage &amp; decor</span>
                <span class="group-toggle-icon">${icon('chevron-down', { size: 14 })}</span>
              </button>
              <div class="palette-group-content">
                <div class="palette-tiles-grid" data-cat="Stage and decor"></div>
              </div>
            </div>

            <!-- Equipment -->
            <div class="palette-group" data-category="Equipment">
              <button type="button" class="palette-group-toggle" aria-expanded="false" data-cat="Equipment">
                <span class="group-toggle-title">Equipment</span>
                <span class="group-toggle-icon">${icon('chevron-down', { size: 14 })}</span>
              </button>
              <div class="palette-group-content">
                <div class="palette-tiles-grid" data-cat="Equipment"></div>
              </div>
            </div>
          </div>
        </aside>

        <!-- 2. CENTER EDITOR (the floor box, full height, 1fr) -->
        <main class="planner-canvas-box" id="canvasBox">
          <!-- Top bar with Layout Name & Unsaved dot -->
          <div class="planner-top-bar" id="plannerTopBar">
            <div class="planner-layout-indicator">
              <span class="planner-layout-name" id="plannerLayoutName">${this.currentLayout?.name || 'Untitled layout'}</span>
              <span class="planner-unsaved-dot" id="plannerUnsavedDot" style="display: ${this.isDirty ? 'inline-block' : 'none'};" title="Unsaved changes"></span>
            </div>
          </div>

          <div class="planner-viewport" id="plannerViewport">
            <svg id="plannerSvg" class="planner-svg-board" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="gridPatternMinor" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(33, 46, 52, 0.12)" stroke-width="1"/>
                </pattern>
                <pattern id="gridPatternMajor" width="80" height="80" patternUnits="userSpaceOnUse">
                  <rect width="80" height="80" fill="url(#gridPatternMinor)"/>
                  <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(33, 46, 52, 0.24)" stroke-width="1.5"/>
                </pattern>
              </defs>
              <rect id="venueBg" class="venue-floor-rect" x="0" y="0" width="${this.venueWidth}" height="${this.venueHeight}" fill="url(#gridPatternMajor)"/>
              <g id="plannerItemsGroup"></g>
              <g id="plannerHandlesGroup"></g>
            </svg>
          </div>

          <!-- Floating Action Bar for Selected Unit -->
          <div class="planner-floating-action-bar" id="plannerFloatingActionBar">
            <button type="button" class="action-bar-btn" data-action="rotate-left" title="Rotate left 15° (Shift for 1°)" aria-label="Rotate left">
              ${icon('rotate-left', { size: 15 })}
            </button>
            <button type="button" class="action-bar-btn" data-action="rotate-right" title="Rotate right 15° (Shift for 1°)" aria-label="Rotate right">
              ${icon('rotate-right', { size: 15 })}
            </button>
            <div class="action-bar-sep"></div>
            <button type="button" class="action-bar-btn" data-action="scale-down" title="Smaller (-10%)" aria-label="Smaller">
              ${icon('minus', { size: 14 })}
            </button>
            <button type="button" class="action-bar-btn" data-action="scale-up" title="Larger (+10%)" aria-label="Larger">
              ${icon('plus', { size: 14 })}
            </button>
            <div class="action-bar-sep"></div>
            <button type="button" class="action-bar-btn" data-action="duplicate" title="Duplicate (Ctrl+D)" aria-label="Duplicate">
              ${icon('copy', { size: 14 })}
            </button>
            <button type="button" class="action-bar-btn action-delete" data-action="delete" title="Delete (Del)" aria-label="Delete">
              ${icon('trash', { size: 14 })}
            </button>
          </div>

          <!-- Canvas Hints Overlay -->
          <div class="planner-canvas-overlay-hints" id="plannerCanvasOverlayHints">
            <span class="canvas-hint-pill">1 square = 0.5m</span>
            <span class="canvas-hint-pill" id="scaleHintSnap">Snap: 0.5m active</span>
            <span class="canvas-hint-pill" id="scaleHintDim">${this.venueWidthM} x ${this.venueHeightM}m</span>
          </div>
        </main>

        <!-- 3. RIGHT TOOLS COLUMN (64px desktop / 52px mobile) -->
        <aside class="planner-tools-col" id="plannerToolsCol" aria-label="Floor plan tools">
          <!-- Group 1: Undo / Redo -->
          <div class="tool-col-group">
            <button type="button" class="tool-col-btn" id="plannerUndoBtn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled>
              ${icon('undo', { size: 20 })}
            </button>
            <button type="button" class="tool-col-btn" id="plannerRedoBtn" title="Redo (Ctrl+Y)" aria-label="Redo" disabled>
              ${icon('redo', { size: 20 })}
            </button>
          </div>

          <div class="tool-col-sep"></div>

          <!-- Group 2: Fit, Zoom+, Zoom-, Snap -->
          <div class="tool-col-group">
            <button type="button" class="tool-col-btn" id="plannerFitBtn" title="Fit venue to screen" aria-label="Fit venue">
              ${icon('fit', { size: 20 })}
            </button>
            <button type="button" class="tool-col-btn" id="plannerZoomInBtn" title="Zoom in" aria-label="Zoom in">
              ${icon('zoom-in', { size: 20 })}
            </button>
            <button type="button" class="tool-col-btn" id="plannerZoomOutBtn" title="Zoom out" aria-label="Zoom out">
              ${icon('zoom-out', { size: 20 })}
            </button>
            <button type="button" class="tool-col-btn ${this.snapEnabled ? 'active' : ''}" id="plannerSnapToggle" title="Toggle 0.5m grid snap" aria-label="Toggle grid snap">
              ${icon('grid', { size: 20 })}
            </button>
          </div>

          <div class="tool-col-sep"></div>

          <!-- Group 3: Save, My layouts, Share -->
          <div class="tool-col-group">
            <button type="button" class="tool-col-btn" id="plannerSaveBtn" title="Save floor plan (Ctrl+S)" aria-label="Save floor plan">
              ${icon('save', { size: 20 })}
            </button>
            <button type="button" class="tool-col-btn" id="plannerMyLayoutsBtn" title="My layouts" aria-label="My saved layouts">
              ${icon('layers', { size: 20 })}
            </button>
            <button type="button" class="tool-col-btn" id="plannerShareBtn" title="Copy shareable link" aria-label="Share floor plan link">
              ${icon('share', { size: 20 })}
            </button>
          </div>
        </aside>
      </div>
    `;
  }

  renderSvgViewbox() {
    const svg = this.container.querySelector('#plannerSvg');
    const bg = this.container.querySelector('#venueBg');
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${this.venueWidth} ${this.venueHeight}`);
    }
    if (bg) {
      bg.setAttribute('width', this.venueWidth);
      bg.setAttribute('height', this.venueHeight);
    }
    const dimLabel = this.container.querySelector('#scaleHintDim');
    if (dimLabel) dimLabel.textContent = `${this.venueWidthM} x ${this.venueHeightM}m`;
  }

  /* --------------------------------------------------------------------------
     Palette Items Catalog & Rendering
     -------------------------------------------------------------------------- */
  getBaseCatalog() {
    return [
      // Tables
      { id: 'round-table', type: 'round-table', name: 'Round Table', category: 'Tables', width: 70, height: 70, seats: 5, symbol: 'sym-round-table-5', seatsTag: '5 seats' },
      { id: 'square-table', type: 'square-table', name: 'Square Table', category: 'Tables', width: 60, height: 60, seats: 4, symbol: 'sym-square-table-4', seatsTag: '4 seats' },
      { id: 'long-table', type: 'long-table', name: 'Long Table', category: 'Tables', width: 90, height: 45, seats: 6, symbol: 'sym-long-table', seatsTag: '6 seats' },
      { id: 'buffet-table', type: 'buffet-table', name: 'Buffet Table', category: 'Tables', width: 140, height: 50, seats: 0, symbol: 'sym-buffet-table', seatsTag: 'Buffet' },
      { id: 'presidential-table', type: 'presidential-table', name: 'Presidential Table', category: 'Tables', width: 140, height: 50, seats: 12, symbol: 'sym-presidential-table', seatsTag: 'VIP 12' },
      { id: 'cake-table', type: 'cake-table', name: 'Cake Table', category: 'Tables', width: 40, height: 40, seats: 0, symbol: 'sym-cake-table', seatsTag: 'Stand' },

      // Chairs
      { id: 'chair', type: 'chair', name: 'Single Chair', category: 'Chairs', width: 35, height: 35, seats: 1, symbol: 'sym-chair', seatsTag: '1 seat' },
      { id: 'wooden-chair', type: 'wooden-chair', name: 'Wooden Chair', category: 'Chairs', width: 35, height: 35, seats: 1, symbol: 'sym-wooden-chair', seatsTag: '1 seat' },
      { id: 'couch', type: 'couch', name: 'VIP Couch', category: 'Chairs', width: 80, height: 40, seats: 3, symbol: 'sym-couch', seatsTag: '3 seats' },

      // Stage & Decor
      { id: 'stage', type: 'stage', name: 'Stage Platform', category: 'Stage and decor', width: 180, height: 70, seats: 0, symbol: 'sym-stage', seatsTag: 'Stage' },
      { id: 'lights-rig', type: 'lights-rig', name: 'Lights Rig', category: 'Stage and decor', width: 120, height: 20, seats: 0, symbol: 'sym-lights-rig', seatsTag: 'Rig' },
      { id: 'dance-floor', type: 'dance-floor', name: 'Dance Floor', category: 'Stage and decor', width: 120, height: 120, seats: 0, symbol: 'sym-dance-floor', seatsTag: 'Floor' },
      { id: 'photobooth', type: 'photobooth', name: 'Photobooth', category: 'Stage and decor', width: 60, height: 60, seats: 0, symbol: 'sym-photobooth', seatsTag: 'Booth' },
      { id: 'entrance-arc', type: 'entrance-arc', name: 'Entrance Arc', category: 'Stage and decor', width: 80, height: 35, seats: 0, symbol: 'sym-entrance-arc', seatsTag: 'Archway' },
      { id: 'balloon-arch', type: 'balloon-arch', name: 'Balloon Arch', category: 'Stage and decor', width: 80, height: 35, seats: 0, symbol: 'sym-balloon-arch', seatsTag: 'Balloons' },
      { id: 'backdrop', type: 'backdrop', name: 'Backdrop Wall', category: 'Stage and decor', width: 90, height: 30, seats: 0, symbol: 'sym-backdrop', seatsTag: 'Wall' },
      { id: 'styro-board', type: 'styro-board', name: 'Styro Board', category: 'Stage and decor', width: 80, height: 35, seats: 0, symbol: 'sym-styro-board', seatsTag: 'Lettering' },

      // Equipment
      { id: 'sound-system', type: 'sound-system', name: 'Sound Rig', category: 'Equipment', width: 45, height: 45, seats: 0, symbol: 'sym-speaker', seatsTag: 'Audio' },
      { id: 'light-stand', type: 'light-stand', name: 'Light Stand', category: 'Equipment', width: 50, height: 50, seats: 0, symbol: 'sym-light-stand', seatsTag: 'Lighting' }
    ];
  }

  getItemDef(type) {
    const catalog = this.getBaseCatalog();
    const found = catalog.find(i => i.type === type || i.id === type);
    if (found) return { ...found };

    // Check custom furniture items
    const custom = this.customFurnitureItems.find(c => c.id === type || c.plannerSymbol === type);
    if (custom) {
      const wSvg = custom.sizeCm ? Math.round(custom.sizeCm.w * 0.4) : 60;
      const hSvg = custom.sizeCm ? Math.round(custom.sizeCm.d * 0.4) : 60;
      return {
        id: custom.id,
        type: custom.id,
        name: custom.name,
        category: custom.category || 'Tables',
        width: wSvg,
        height: hSvg,
        seats: custom.seats || 0,
        symbol: custom.plannerSymbol || 'sym-round-table-5',
        seatsTag: custom.seats ? `${custom.seats} seats` : '',
        coverPhoto: custom.coverPhoto || null
      };
    }

    return { name: 'Item', width: 50, height: 50, seats: 0, symbol: 'sym-round-table-5', category: 'Tables' };
  }

  renderPaletteTiles() {
    // Merge base catalog with custom furniture
    const base = this.getBaseCatalog();
    const customConverted = this.customFurnitureItems.filter(c => !base.some(b => b.id === c.id)).map(c => {
      const wSvg = c.sizeCm ? Math.round(c.sizeCm.w * 0.4) : 60;
      const hSvg = c.sizeCm ? Math.round(c.sizeCm.d * 0.4) : 60;
      return {
        id: c.id,
        type: c.id,
        name: c.name,
        category: c.category || 'Tables',
        width: wSvg,
        height: hSvg,
        seats: c.seats || 0,
        symbol: c.plannerSymbol || 'sym-round-table-5',
        seatsTag: c.seats ? `${c.seats} seats` : '',
        coverPhoto: c.coverPhoto || null
      };
    });

    const allItems = [...base, ...customConverted];
    const categories = ['Tables', 'Chairs', 'Stage and decor', 'Equipment'];

    categories.forEach(cat => {
      const grid = this.container.querySelector(`.palette-tiles-grid[data-cat="${cat}"]`);
      if (!grid) return;

      const itemsInCat = allItems.filter(item => item.category === cat);
      grid.innerHTML = itemsInCat.map(item => {
        const iconHtml = item.coverPhoto
          ? `<img src="${item.coverPhoto}" alt="" class="tile-thumb-img" draggable="false">`
          : plannerIcon(item.symbol.replace('sym-', ''), { size: 36, className: 'tile-icon-svg' });

        return `
          <div class="palette-tile" data-type="${item.type}" draggable="true" title="Click to add or drag into venue" role="button" tabindex="0">
            <div class="tile-icon-wrap">${iconHtml}</div>
            <span class="tile-name">${item.name}</span>
            ${item.seatsTag ? `<span class="tile-seats-badge">${item.seatsTag}</span>` : ''}
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.palette-tile').forEach(tile => {
        const type = tile.dataset.type;
        tile.addEventListener('click', () => this.addItem(type));

        tile.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', type);
          e.dataTransfer.effectAllowed = 'copy';
        });

        tile.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.addItem(type);
          }
        });
      });
    });
  }

  /* --------------------------------------------------------------------------
     Event Binding
     -------------------------------------------------------------------------- */
  bindEvents() {
    // Venue preset change
    const presetSelect = this.container.querySelector('#plannerVenuePreset');
    const customDiv = this.container.querySelector('#customSizeInputs');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (customDiv) customDiv.style.display = val === 'custom' ? 'flex' : 'none';
        if (val !== 'custom') {
          this.setPreset(val);
        }
      });
    }

    const applyCustomBtn = this.container.querySelector('#btnApplyCustomSize');
    if (applyCustomBtn) {
      applyCustomBtn.addEventListener('click', () => {
        const w = Number(this.container.querySelector('#customWidthInput')?.value) || 15;
        const h = Number(this.container.querySelector('#customHeightInput')?.value) || 10;
        this.setPreset('custom', w, h);
      });
    }

    // Guests input
    const guestsInput = this.container.querySelector('#plannerGuestsInput');
    if (guestsInput) {
      guestsInput.addEventListener('input', (e) => this.setPax(e.target.value));
    }

    // Accordion group toggles
    this.container.querySelectorAll('.palette-group-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.palette-group');
        if (!group) return;
        const isOpen = group.classList.contains('is-open');
        group.classList.toggle('is-open', !isOpen);
        btn.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });
    });

    // Mobile Bottom Sheet open/close
    const addBtn = this.container.querySelector('#btnPlannerAddItem');
    const paletteCol = this.container.querySelector('#plannerPaletteCol');
    const backdrop = this.container.querySelector('#plannerSheetBackdrop');
    const closeBtn = this.container.querySelector('#btnPaletteSheetClose');

    const openSheet = () => {
      if (paletteCol) paletteCol.classList.add('is-sheet-open');
      if (backdrop) backdrop.classList.add('is-active');
    };
    const closeSheet = () => {
      if (paletteCol) paletteCol.classList.remove('is-sheet-open');
      if (backdrop) backdrop.classList.remove('is-active');
    };

    if (addBtn) addBtn.addEventListener('click', openSheet);
    if (closeBtn) closeBtn.addEventListener('click', closeSheet);
    if (backdrop) backdrop.addEventListener('click', closeSheet);

    // Undo / Redo buttons
    const undoBtn = this.container.querySelector('#plannerUndoBtn');
    if (undoBtn) undoBtn.addEventListener('click', () => this.undo());

    const redoBtn = this.container.querySelector('#plannerRedoBtn');
    if (redoBtn) redoBtn.addEventListener('click', () => this.redo());

    // Fit button
    const fitBtn = this.container.querySelector('#plannerFitBtn');
    if (fitBtn) fitBtn.addEventListener('click', () => this.resetZoomAndFit());

    // Zoom in / Zoom out buttons
    const zoomInBtn = this.container.querySelector('#plannerZoomInBtn');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.zoomIn());

    const zoomOutBtn = this.container.querySelector('#plannerZoomOutBtn');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.zoomOut());

    // Snap toggle button
    const snapBtn = this.container.querySelector('#plannerSnapToggle');
    if (snapBtn) {
      snapBtn.addEventListener('click', () => {
        this.snapEnabled = !this.snapEnabled;
        snapBtn.classList.toggle('active', this.snapEnabled);
        const hint = this.container.querySelector('#scaleHintSnap');
        if (hint) hint.textContent = this.snapEnabled ? 'Snap: 0.5m active' : 'Snap: Free movement';
      });
    }

    // Save button
    const saveBtn = this.container.querySelector('#plannerSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveLayoutHandler(false));
    }

    // Save As button
    const saveAsBtn = this.container.querySelector('#plannerSaveAsBtn');
    if (saveAsBtn) {
      saveAsBtn.addEventListener('click', () => this.saveLayoutHandler(true));
    }

    // My Layouts button
    const myLayoutsBtn = this.container.querySelector('#plannerMyLayoutsBtn');
    if (myLayoutsBtn) {
      myLayoutsBtn.addEventListener('click', () => this.openMyLayoutsDialog());
    }

    // Multi-tab sync via storage and custom sync events
    window.addEventListener('storage', (e) => {
      if (e.key === 'tikim.layouts' || !e.key) {
        if (typeof this.refreshMyLayoutsList === 'function') {
          this.refreshMyLayoutsList();
        }
      }
    });
    window.addEventListener('tikim:sync', (e) => {
      if (e.detail?.type === 'layout_saved' || e.detail?.type === 'layout_deleted') {
        if (typeof this.refreshMyLayoutsList === 'function') {
          this.refreshMyLayoutsList();
        }
      }
    });

    // Share button
    const shareBtn = this.container.querySelector('#plannerShareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const layout = this.exportLayout();
        const jsonStr = JSON.stringify({ items: layout.items, venuePreset: layout.venuePreset, venueWidthM: this.venueWidthM, venueHeightM: this.venueHeightM });
        const b64 = btoa(jsonStr);
        const shareUrl = `${window.location.origin}${window.location.pathname}#layout=${b64}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          alert('Shareable layout link copied to clipboard!');
        }).catch(() => {
          prompt('Copy this shareable floor plan link:', shareUrl);
        });
      });
    }

    // HTML5 Drag & Drop onto SVG canvas
    const canvasBox = this.container.querySelector('#canvasBox') || this.container.querySelector('#plannerCanvasBox');
    if (canvasBox) {
      canvasBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      canvasBox.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/plain');
        if (type) {
          const coords = this.getSvgCoords(e);
          const def = this.getItemDef(type);
          this.addItem(type, coords.x - def.width / 2, coords.y - def.height / 2);
        }
      });
    }

    // Pointer events on SVG with stable capture and cancel recovery
    const svg = this.container.querySelector('#plannerSvg');
    if (svg) {
      svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      window.addEventListener('pointermove', (e) => this.onPointerMove(e));
      window.addEventListener('pointerup', (e) => this.onPointerUp(e));
      window.addEventListener('pointercancel', (e) => this.onPointerCancel(e));
      svg.addEventListener('lostpointercapture', (e) => this.onPointerCancel(e));

      // Zoom via wheel (Ctrl+wheel or two-finger pinch)
      svg.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
          this.setZoom(this.zoomLevel + zoomDelta, e);
        }
      }, { passive: false });
    }

    // Floating action bar button actions
    const bar = this.container.querySelector('#plannerFloatingActionBar');
    if (bar) {
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.action-bar-btn');
        if (!btn || !this.selectedItemId) return;
        const action = btn.dataset.action;
        const isShift = e.shiftKey;

        if (action === 'rotate-left') this.rotateSelected(-15, isShift ? -1 : -15);
        if (action === 'rotate-right') this.rotateSelected(15, isShift ? 1 : 15);
        if (action === 'scale-down') this.scaleSelected(-0.1);
        if (action === 'scale-up') this.scaleSelected(0.1);
        if (action === 'duplicate') this.duplicateSelected();
        if (action === 'delete') this.deleteSelected();
      });
    }

    // Keyboard shortcuts: R rotate, [ and ] resize, Ctrl+D duplicate, Delete, arrows nudge, Ctrl+Z/Y
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in text input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveLayoutHandler(false);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }

      if (!this.selectedItemId) return;
      const item = this.items.find(i => i.id === this.selectedItemId);
      if (!item) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelected();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 15;
        this.rotateSelected(15, step);
      } else if (e.key === '[') {
        e.preventDefault();
        this.scaleSelected(-0.1);
      } else if (e.key === ']') {
        e.preventDefault();
        this.scaleSelected(0.1);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.duplicateSelected();
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? this.gridSnap : (this.snapEnabled ? this.gridSnap : 4);
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;

        this.recordState('Nudge unit');
        item.x += dx;
        item.y += dy;
        this.clampItemToVenue(item);
        this.renderItems();
        this.updateFloatingBarPosition();
        this.notifyChange();
      }
    });

    // Window resize: re-fit SVG viewBox cleanly
    window.addEventListener('resize', () => {
      this.updateFloatingBarPosition();
    });
  }

  /* --------------------------------------------------------------------------
     Item Management & Geometry
     -------------------------------------------------------------------------- */
  addItem(type, customX = null, customY = null) {
    this.recordState('Add item');
    const id = 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const def = this.getItemDef(type);

    const x = customX !== null ? customX : (this.venueWidth / 2 - def.width / 2);
    const y = customY !== null ? customY : (this.venueHeight / 2 - def.height / 2);

    const newItem = {
      id,
      type,
      name: def.name,
      x,
      y,
      width: def.width,
      height: def.height,
      rotation: 0,
      scale: 1.0,
      seats: def.seats || 0,
      symbol: def.symbol || 'sym-round-table-5',
      coverPhoto: def.coverPhoto || null
    };

    this.clampItemToVenue(newItem);
    this.items.push(newItem);
    this.selectedItemId = id;
    this.renderItems();
    this.updateSeatMeter();
    this.notifyChange();
  }

  /* Rotated Bounding Box Clamping (E5)
     Grid runs edge-to-edge in the box with NO padding.
     Units can be dragged flush against any edge and into all 4 corners.
     Clamps on the unit's rotated bounding box, NOT its centre. */
  getRotatedBounds(item) {
    const rad = ((item.rotation || 0) % 360) * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const effScale = item.scale || 1.0;
    const w = item.width * effScale;
    const h = item.height * effScale;
    const halfW = w / 2;
    const halfH = h / 2;

    const hwRot = halfW * cos + halfH * sin;
    const hhRot = halfW * sin + halfH * cos;

    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;

    return {
      cx, cy,
      hwRot, hhRot,
      wRot: hwRot * 2,
      hRot: hhRot * 2,
      minX: cx - hwRot,
      maxX: cx + hwRot,
      minY: cy - hhRot,
      maxY: cy + hhRot
    };
  }

  clampItemToVenue(item) {
    const rad = ((item.rotation || 0) % 360) * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const effScale = item.scale || 1.0;
    const w = item.width * effScale;
    const h = item.height * effScale;
    const halfW = w / 2;
    const halfH = h / 2;

    const hwRot = halfW * cos + halfH * sin;
    const hhRot = halfW * sin + halfH * cos;

    let cx = item.x + item.width / 2;
    let cy = item.y + item.height / 2;

    // Clamp cx & cy so rotated bounding box is strictly within [0, venueWidth] and [0, venueHeight]
    cx = Math.max(hwRot, Math.min(this.venueWidth - hwRot, cx));
    cy = Math.max(hhRot, Math.min(this.venueHeight - hhRot, cy));

    item.x = cx - item.width / 2;
    item.y = cy - item.height / 2;
  }

  /* Dev test: assert unit touches all four corners flush */
  testCornerClamping(itemOrId = null) {
    const item = itemOrId ? (typeof itemOrId === 'string' ? this.items.find(i => i.id === itemOrId) : itemOrId) : this.items[0];
    if (!item) return { success: false, message: 'No item to test' };

    const rad = ((item.rotation || 0) % 360) * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const effScale = item.scale || 1.0;
    const hw = (item.width * effScale) / 2;
    const hh = (item.height * effScale) / 2;
    const hwRot = hw * cos + hh * sin;
    const hhRot = hw * sin + hh * cos;

    // Corner 1: Top-Left (minX=0, minY=0)
    item.x = hwRot - item.width / 2;
    item.y = hhRot - item.height / 2;
    this.clampItemToVenue(item);
    const b1 = this.getRotatedBounds(item);
    const c1Pass = Math.abs(b1.minX - 0) < 0.01 && Math.abs(b1.minY - 0) < 0.01;

    // Corner 2: Top-Right (maxX=venueWidth, minY=0)
    item.x = (this.venueWidth - hwRot) - item.width / 2;
    item.y = hhRot - item.height / 2;
    this.clampItemToVenue(item);
    const b2 = this.getRotatedBounds(item);
    const c2Pass = Math.abs(b2.maxX - this.venueWidth) < 0.01 && Math.abs(b2.minY - 0) < 0.01;

    // Corner 3: Bottom-Left (minX=0, maxY=venueHeight)
    item.x = hwRot - item.width / 2;
    item.y = (this.venueHeight - hhRot) - item.height / 2;
    this.clampItemToVenue(item);
    const b3 = this.getRotatedBounds(item);
    const c3Pass = Math.abs(b3.minX - 0) < 0.01 && Math.abs(b3.maxY - this.venueHeight) < 0.01;

    // Corner 4: Bottom-Right (maxX=venueWidth, maxY=venueHeight)
    item.x = (this.venueWidth - hwRot) - item.width / 2;
    item.y = (this.venueHeight - hhRot) - item.height / 2;
    this.clampItemToVenue(item);
    const b4 = this.getRotatedBounds(item);
    const c4Pass = Math.abs(b4.maxX - this.venueWidth) < 0.01 && Math.abs(b4.maxY - this.venueHeight) < 0.01;

    return {
      success: c1Pass && c2Pass && c3Pass && c4Pass,
      details: { c1Pass, c2Pass, c3Pass, c4Pass }
    };
  }

  /* --------------------------------------------------------------------------
     Item Rendering on SVG Canvas
     -------------------------------------------------------------------------- */
  renderItems() {
    const group = this.container.querySelector('#plannerItemsGroup');
    const handlesGroup = this.container.querySelector('#plannerHandlesGroup');
    if (!group) return;

    group.innerHTML = this.items.map(item => {
      const isSelected = item.id === this.selectedItemId;
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      const rot = item.rotation || 0;
      const scale = item.scale || 1.0;
      const transform = `translate(${cx}, ${cy}) rotate(${rot}) scale(${scale}) translate(${-item.width / 2}, ${-item.height / 2})`;

      let graphic = '';
      if (item.coverPhoto) {
        graphic = `
          <rect x="0" y="0" width="${item.width}" height="${item.height}" rx="6" fill="#f5efe6" stroke="#212e34" stroke-width="2"/>
          <image href="${item.coverPhoto}" x="2" y="2" width="${item.width - 4}" height="${item.height - 4}" preserveAspectRatio="xMidYMid slice" rx="4"/>
        `;
      } else {
        const symId = item.symbol || 'sym-round-table-5';
        graphic = `<use href="assets/icons/planner-sprite.svg#${symId}" x="0" y="0" width="${item.width}" height="${item.height}"/>`;
      }

      const outline = isSelected ? `
        <rect class="selection-outline" x="-4" y="-4" width="${item.width + 8}" height="${item.height + 8}" rx="6"/>
      ` : '';

      return `
        <g class="floor-item-group ${isSelected ? 'selected' : ''}" data-id="${item.id}" data-type="${item.type}" transform="${transform}">
          ${outline}
          ${graphic}
        </g>
      `;
    }).join('');

    // Render interactive handles for selected item
    if (handlesGroup) {
      if (this.selectedItemId) {
        const selItem = this.items.find(i => i.id === this.selectedItemId);
        if (selItem) {
          const cx = selItem.x + selItem.width / 2;
          const cy = selItem.y + selItem.height / 2;
          const rot = selItem.rotation || 0;
          const scale = selItem.scale || 1.0;
          const w = selItem.width * scale;
          const h = selItem.height * scale;
          const halfW = w / 2;
          const halfH = h / 2;
          const transform = `translate(${cx}, ${cy}) rotate(${rot})`;

          handlesGroup.innerHTML = `
            <g transform="${transform}">
              <!-- Rotation stem and handle on top -->
              <line x1="0" y1="${-halfH}" x2="0" y2="${-halfH - 24}" stroke="#4fa49d" stroke-width="1.5" stroke-dasharray="2,2"/>
              <circle class="canvas-handle handle-rotate" data-handle="rotate" cx="0" cy="${-halfH - 24}" r="7" fill="#4fa49d" stroke="#ffffff" stroke-width="2"/>

              <!-- 4 Corner resize handles -->
              <rect class="canvas-handle handle-nwse" data-handle="nw" x="${-halfW - 4}" y="${-halfH - 4}" width="8" height="8" rx="2" fill="#ffffff" stroke="#4fa49d" stroke-width="2"/>
              <rect class="canvas-handle handle-nesw" data-handle="ne" x="${halfW - 4}" y="${-halfH - 4}" width="8" height="8" rx="2" fill="#ffffff" stroke="#4fa49d" stroke-width="2"/>
              <rect class="canvas-handle handle-nwse" data-handle="se" x="${halfW - 4}" y="${halfH - 4}" width="8" height="8" rx="2" fill="#ffffff" stroke="#4fa49d" stroke-width="2"/>
              <rect class="canvas-handle handle-nesw" data-handle="sw" x="${-halfW - 4}" y="${halfH - 4}" width="8" height="8" rx="2" fill="#ffffff" stroke="#4fa49d" stroke-width="2"/>
            </g>
          `;
        }
      } else {
        handlesGroup.innerHTML = '';
      }
    }

    this.updateFloatingBarPosition();
  }

  /* --------------------------------------------------------------------------
     Floating Action Bar Positioning
     -------------------------------------------------------------------------- */
  updateFloatingBarPosition() {
    const bar = this.container.querySelector('#plannerFloatingActionBar');
    if (!bar) return;

    if (!this.selectedItemId) {
      bar.style.display = 'none';
      return;
    }

    const item = this.items.find(i => i.id === this.selectedItemId);
    const svg = this.container.querySelector('#plannerSvg');
    const box = this.container.querySelector('#plannerCanvasBox');
    if (!item || !svg || !box) {
      bar.style.display = 'none';
      return;
    }

    const bounds = this.getRotatedBounds(item);
    const boxRect = box.getBoundingClientRect();

    // Map SVG coordinates to screen coordinates
    const ptTop = svg.createSVGPoint();
    ptTop.x = bounds.cx;
    ptTop.y = bounds.minY;
    const screenTop = ptTop.matrixTransform(svg.getScreenCTM());

    const ptBottom = svg.createSVGPoint();
    ptBottom.x = bounds.cx;
    ptBottom.y = bounds.maxY;
    const screenBottom = ptBottom.matrixTransform(svg.getScreenCTM());

    bar.style.display = 'flex';

    // Flip below unit near the top edge
    const topRelY = screenTop.y - boxRect.top;
    if (topRelY < 55) {
      bar.style.left = `${screenBottom.x - boxRect.left}px`;
      bar.style.top = `${screenBottom.y - boxRect.top + 10}px`;
    } else {
      bar.style.left = `${screenTop.x - boxRect.left}px`;
      bar.style.top = `${screenTop.y - boxRect.top - 46}px`;
    }
  }

  renderSelectionOutlineOnly() {
    const itemsGroup = this.container.querySelector('#plannerItemsGroup');
    const handlesGroup = this.container.querySelector('#plannerHandlesGroup');
    if (!itemsGroup) return;

    itemsGroup.querySelectorAll('.floor-item-group').forEach(el => {
      const isSel = el.dataset.id === this.selectedItemId;
      el.classList.toggle('selected', isSel);
      let outline = el.querySelector('.selection-outline');
      if (isSel) {
        if (!outline) {
          const item = this.items.find(i => i.id === el.dataset.id);
          if (item) {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('class', 'selection-outline');
            rect.setAttribute('x', '-4');
            rect.setAttribute('y', '-4');
            rect.setAttribute('width', (item.width + 8).toString());
            rect.setAttribute('height', (item.height + 8).toString());
            rect.setAttribute('rx', '6');
            el.insertBefore(rect, el.firstChild);
          }
        }
      } else if (outline) {
        outline.remove();
      }
    });

    if (handlesGroup) {
      if (this.selectedItemId) {
        const selItem = this.items.find(i => i.id === this.selectedItemId);
        if (selItem) {
          const cx = selItem.x + selItem.width / 2;
          const cy = selItem.y + selItem.height / 2;
          const rot = selItem.rotation || 0;
          const scale = selItem.scale || 1.0;
          const w = selItem.width * scale;
          const h = selItem.height * scale;
          const halfW = w / 2;
          const halfH = h / 2;
          const transform = `translate(${cx}, ${cy}) rotate(${rot})`;

          handlesGroup.innerHTML = `
            <g transform="${transform}">
              <!-- Rotation stem and handle on top -->
              <line x1="0" y1="${-halfH}" x2="0" y2="${-halfH - 24}" stroke="#4fa49d" stroke-width="1.5" stroke-dasharray="2,2"/>
              <circle class="canvas-handle handle-rotate" data-handle="rotate" cx="0" cy="${-halfH - 24}" r="7" fill="#4fa49d" stroke="#ffffff" stroke-width="2"/>

              <!-- 4 Corner resize handles -->
              <rect class="canvas-handle handle-nwse" data-handle="nw" x="${-halfW - 4}" y="${-halfH - 4}" width="8" height="8" rx="2" fill="#ffffff" stroke="#4fa49d" stroke-width="2"/>
              <rect class="canvas-handle handle-nesw" data-handle="ne" x="${halfW - 4}" y="${-halfH - 4}" width="8" height="8" rx="2" fill="#ffffff" stroke="#4fa49d" stroke-width="2"/>
              <rect class="canvas-handle handle-nwse" data-handle="se" x="${halfW - 4}" y="${halfH - 4}" width="8" height="8" rx="2" fill="#ffffff" stroke="#4fa49d" stroke-width="2"/>
              <rect class="canvas-handle handle-nesw" data-handle="sw" x="${-halfW - 4}" y="${halfH - 4}" width="8" height="8" rx="2" fill="#ffffff" stroke="#4fa49d" stroke-width="2"/>
            </g>
          `;
        }
      } else {
        handlesGroup.innerHTML = '';
      }
    }

    this.updateFloatingBarPosition();
  }

  /* --------------------------------------------------------------------------
     Pointer Events (Drag, Rotation, Resize, Pan)
     -------------------------------------------------------------------------- */
  onPointerDown(e) {
    if (!this.hasDragged) {
      this.hasDragged = true;
    }

    // Check if clicked an on-canvas handle
    const handleEl = e.target.closest('.canvas-handle');
    if (handleEl && this.selectedItemId) {
      const handleType = handleEl.dataset.handle;
      const item = this.items.find(i => i.id === this.selectedItemId);
      if (item) {
        this.activeHandle = handleType;
        const coords = this.getSvgCoords(e);
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        const currentAngle = Math.atan2(coords.y - cy, coords.x - cx) * 180 / Math.PI;

        this.handleStart = {
          x: coords.x,
          y: coords.y,
          cx,
          cy,
          initialRotation: item.rotation || 0,
          initialAngle: currentAngle,
          initialScale: item.scale || 1.0,
          dist: Math.hypot(coords.x - cx, coords.y - cy)
        };
        e.stopPropagation();
        return;
      }
    }

    // Check if clicked a floor unit
    const group = e.target.closest('.floor-item-group');
    if (group) {
      const id = group.dataset.id;
      this.selectedItemId = id;
      const item = this.items.find(i => i.id === id);
      if (item) {
        this.dragTarget = item;
        this.draggedElement = group;
        this.isDraggingUnit = true;
        const coords = this.getSvgCoords(e);
        this.dragOffset = {
          x: coords.x - item.x,
          y: coords.y - item.y
        };

        // Capture pointer to guarantee mouse events are received
        try {
          group.setPointerCapture(e.pointerId);
          this.capturedPointerId = e.pointerId;
        } catch (err) {}

        group.classList.add('is-dragging');

        // Hide floating action bar during drag
        const bar = this.container.querySelector('#plannerFloatingActionBar');
        if (bar) bar.classList.add('is-hidden');
      }

      // Update selection outline without destroying DOM node identity
      this.renderSelectionOutlineOnly();
      e.stopPropagation();
      return;
    }

    // Clicked background: pan or deselect
    if (e.target.id === 'venueBg' || e.target.id === 'plannerSvg') {
      if (this.zoomLevel > 1.0) {
        this.isPanning = true;
        this.panStart = { x: e.clientX - this.panOffset.x, y: e.clientY - this.panOffset.y };
      } else {
        this.selectedItemId = null;
        this.renderItems();
      }
    }
  }

  onPointerMove(e) {
    // 1. Interactive rotation or resize via handles
    if (this.activeHandle && this.selectedItemId) {
      const item = this.items.find(i => i.id === this.selectedItemId);
      if (!item) return;

      const coords = this.getSvgCoords(e);

      if (this.activeHandle === 'rotate') {
        const currentAngle = Math.atan2(coords.y - this.handleStart.cy, coords.x - this.handleStart.cx) * 180 / Math.PI;
        let delta = currentAngle - this.handleStart.initialAngle;
        let newRot = Math.round(this.handleStart.initialRotation + delta);
        if (e.shiftKey) {
          item.rotation = (newRot % 360 + 360) % 360;
        } else {
          item.rotation = (Math.round(newRot / 15) * 15 % 360 + 360) % 360;
        }
        this.clampItemToVenue(item);
        this.renderItems();
      } else {
        const currentDist = Math.hypot(coords.x - this.handleStart.cx, coords.y - this.handleStart.cy);
        const scaleFactor = currentDist / Math.max(1, this.handleStart.dist);
        let newScale = Math.round((this.handleStart.initialScale * scaleFactor) * 10) / 10;
        newScale = Math.max(0.4, Math.min(3.0, newScale));
        item.scale = newScale;
        this.clampItemToVenue(item);
        this.renderItems();
      }
      return;
    }

    // 2. Dragging a unit with corner-flush clamping and RAF transform
    if (this.isDraggingUnit && this.dragTarget && this.draggedElement) {
      const coords = this.getSvgCoords(e);
      let rawX = coords.x - this.dragOffset.x;
      let rawY = coords.y - this.dragOffset.y;

      const effScale = this.dragTarget.scale || 1.0;
      const halfW = (this.dragTarget.width * effScale) / 2;
      const halfH = (this.dragTarget.height * effScale) / 2;

      let cx = rawX + this.dragTarget.width / 2;
      let cy = rawY + this.dragTarget.height / 2;

      if (this.snapEnabled) {
        cx = Math.round(cx / this.gridSnap) * this.gridSnap;
        cy = Math.round(cy / this.gridSnap) * this.gridSnap;
      }

      const rad = ((this.dragTarget.rotation || 0) % 360) * Math.PI / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const hwRot = halfW * cos + halfH * sin;
      const hhRot = halfW * sin + halfH * cos;

      cx = Math.max(hwRot, Math.min(this.venueWidth - hwRot, cx));
      cy = Math.max(hhRot, Math.min(this.venueHeight - hhRot, cy));

      this.pendingDragPos = { cx, cy };

      if (!this.dragRafPending) {
        this.dragRafPending = true;
        requestAnimationFrame(() => {
          this.dragRafPending = false;
          if (this.isDraggingUnit && this.dragTarget && this.draggedElement && this.pendingDragPos) {
            const { cx, cy } = this.pendingDragPos;
            const rot = this.dragTarget.rotation || 0;
            const scale = this.dragTarget.scale || 1.0;
            const transform = `translate(${cx}, ${cy}) rotate(${rot}) scale(${scale}) translate(${-this.dragTarget.width / 2}, ${-this.dragTarget.height / 2})`;
            this.draggedElement.setAttribute('transform', transform);
          }
        });
      }
      return;
    }

    // 3. Panning while zoomed
    if (this.isPanning) {
      this.panOffset.x = e.clientX - this.panStart.x;
      this.panOffset.y = e.clientY - this.panStart.y;
      this.applyViewportTransform();
      this.updateFloatingBarPosition();
    }
  }

  onPointerUp(e) {
    if (this.activeHandle) {
      this.activeHandle = null;
      this.recordState('Transform unit');
      this.isDirty = true;
      this.updateLayoutIndicator();
      this.notifyChange();
    }

    if (this.isDraggingUnit && this.dragTarget) {
      if (this.pendingDragPos) {
        this.dragTarget.x = this.pendingDragPos.cx - this.dragTarget.width / 2;
        this.dragTarget.y = this.pendingDragPos.cy - this.dragTarget.height / 2;
        this.clampItemToVenue(this.dragTarget);
        this.pendingDragPos = null;
        this.recordState('Move unit');
        this.isDirty = true;
        this.updateLayoutIndicator();
        this.notifyChange();
      }

      if (this.capturedPointerId !== null && this.draggedElement) {
        try {
          this.draggedElement.releasePointerCapture(this.capturedPointerId);
        } catch (err) {}
        this.capturedPointerId = null;
      }

      if (this.draggedElement) {
        this.draggedElement.classList.remove('is-dragging');
        this.draggedElement = null;
      }

      this.dragTarget = null;
      this.isDraggingUnit = false;

      const bar = this.container.querySelector('#plannerFloatingActionBar');
      if (bar) bar.classList.remove('is-hidden');

      this.renderItems();
    }

    if (this.isPanning) {
      this.isPanning = false;
    }
  }

  onPointerCancel(e) {
    this.onPointerUp(e);
  }

  getSvgCoords(e) {
    const svg = this.container.querySelector('#plannerSvg');
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* --------------------------------------------------------------------------
     Unit Actions (Rotate, Scale, Duplicate, Delete)
     -------------------------------------------------------------------------- */
  rotateSelected(amount = 15, customStep = null) {
    const item = this.items.find(i => i.id === this.selectedItemId);
    if (!item) return;
    this.recordState('Rotate unit');
    const step = customStep !== null ? customStep : amount;
    item.rotation = (((item.rotation || 0) + step) % 360 + 360) % 360;
    this.clampItemToVenue(item);
    this.renderItems();
    this.notifyChange();
  }

  scaleSelected(delta = 0.1) {
    const item = this.items.find(i => i.id === this.selectedItemId);
    if (!item) return;
    this.recordState('Resize unit');
    let s = (item.scale || 1.0) + delta;
    s = Math.round(s * 10) / 10;
    item.scale = Math.max(0.4, Math.min(3.0, s));
    this.clampItemToVenue(item);
    this.renderItems();
    this.notifyChange();
  }

  duplicateSelected() {
    const item = this.items.find(i => i.id === this.selectedItemId);
    if (!item) return;
    this.recordState('Duplicate unit');
    const copy = JSON.parse(JSON.stringify(item));
    copy.id = 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    // Offset by one cell (0.5m = 20 units)
    copy.x += this.gridSnap;
    copy.y += this.gridSnap;
    this.clampItemToVenue(copy);
    this.items.push(copy);
    this.selectedItemId = copy.id;
    this.renderItems();
    this.updateSeatMeter();
    this.notifyChange();
  }

  deleteSelected() {
    if (!this.selectedItemId) return;
    this.recordState('Delete unit');
    this.items = this.items.filter(i => i.id !== this.selectedItemId);
    this.selectedItemId = null;
    this.renderItems();
    this.updateSeatMeter();
    this.notifyChange();
  }

  /* --------------------------------------------------------------------------
     Undo / Redo System
     -------------------------------------------------------------------------- */
  recordState(desc = 'Action') {
    this.undoStack.push(JSON.stringify(this.items));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(JSON.stringify(this.items));
    const previous = this.undoStack.pop();
    this.items = JSON.parse(previous);
    this.renderItems();
    this.updateSeatMeter();
    this.updateHistoryButtons();
    this.notifyChange();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(JSON.stringify(this.items));
    const next = this.redoStack.pop();
    this.items = JSON.parse(next);
    this.renderItems();
    this.updateSeatMeter();
    this.updateHistoryButtons();
    this.notifyChange();
  }

  updateHistoryButtons() {
    const undoBtn = this.container.querySelector('#plannerUndoBtn');
    const redoBtn = this.container.querySelector('#plannerRedoBtn');
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }

  /* --------------------------------------------------------------------------
     Zoom & Fit
     -------------------------------------------------------------------------- */
  zoomIn() {
    this.setZoom(this.zoomLevel + 0.2);
  }

  zoomOut() {
    this.setZoom(this.zoomLevel - 0.2);
  }

  setZoom(level, e = null) {
    this.zoomLevel = Math.max(0.6, Math.min(3.0, Math.round(level * 10) / 10));
    if (this.zoomLevel === 1.0) {
      this.panOffset = { x: 0, y: 0 };
    }
    this.applyViewportTransform();
    this.updateFloatingBarPosition();
  }

  resetZoomAndFit() {
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.applyViewportTransform();
    this.updateFloatingBarPosition();
  }

  applyViewportTransform() {
    const vp = this.container.querySelector('#plannerViewport');
    if (vp) {
      vp.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${this.zoomLevel})`;
      vp.style.transformOrigin = 'center center';
    }
  }

  setupResponsiveObserver() {
    // Media queries in CSS handle palette responsiveness across all viewports
  }

  /* --------------------------------------------------------------------------
     Seat Meter & State Sync
     -------------------------------------------------------------------------- */
  updateSeatMeter() {
    // Round 5, Square 4, Chair 1, Couch 3, Long 6, Presidential 12
    const totalSeats = this.items.reduce((sum, item) => sum + (item.seats || 0), 0);
    const badge = this.container.querySelector('#plannerSeatBadge');
    const textEl = this.container.querySelector('#seatMeterText') || this.container.querySelector('.mini-seat-text');

    if (textEl) {
      textEl.textContent = `${totalSeats} seats for ${this.pax} guests`;
    }

    if (badge) {
      if (totalSeats >= this.pax) {
        badge.classList.add('is-covered');
      } else {
        badge.classList.remove('is-covered');
      }
    }
  }

  updateLayoutIndicator() {
    const nameEl = this.container.querySelector('#plannerLayoutName');
    const dotEl = this.container.querySelector('#plannerUnsavedDot');
    if (nameEl) {
      nameEl.textContent = this.currentLayout?.name || 'Untitled layout';
    }
    if (dotEl) {
      dotEl.style.display = this.isDirty ? 'inline-block' : 'none';
    }
  }

  notifyChange() {
    this.isDirty = true;
    this.updateSeatMeter();
    this.updateLayoutIndicator();
    const layout = this.exportLayout();

    if (typeof this.options.onLayoutChange === 'function') {
      this.options.onLayoutChange(layout);
    }
    if (typeof this.options.onStateChange === 'function') {
      this.options.onStateChange(layout);
    }
  }

  getItemCounts() {
    const counts = {};
    this.items.forEach(item => {
      counts[item.type] = (counts[item.type] || 0) + 1;
    });
    return counts;
  }

  exportLayout() {
    return {
      id: this.currentLayout?.id || null,
      name: this.currentLayout?.name || null,
      venuePreset: this.currentPreset,
      venueDimensions: { widthM: this.venueWidthM, heightM: this.venueHeightM },
      venueWidth: this.venueWidth,
      venueHeight: this.venueHeight,
      items: this.items,
      units: this.items,
      pax: this.pax,
      counts: this.getItemCounts()
    };
  }

  exportJsonFile(filename = 'dacks-venue-layout.json') {
    const data = this.exportLayout();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportPngThumbnail(filename = 'dacks-floor-plan.png') {
    const svgEl = this.container.querySelector('#plannerSvg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = this.venueWidth;
    canvas.height = this.venueHeight;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      a.click();
    };
    img.src = url;
  }

  async saveLayoutHandler(askName = false) {
    const existing = await listLayouts();
    if (!this.currentLayout.id || askName) {
      const defaultName = askName
        ? `${this.currentLayout.name || 'Layout'} (Copy)`
        : (this.currentLayout.name || `Layout ${existing.length + 1}`);
      const name = prompt('Name your floor layout:', defaultName);
      if (!name || !name.trim()) return;

      const newId = 'layout-' + Date.now();
      const newName = name.trim();
      const saved = await saveLayout({
        id: newId,
        name: newName,
        venue: this.presets[this.currentPreset]?.label || 'Standard Hall',
        units: this.items
      });
      this.currentLayout = {
        id: saved.id,
        name: saved.name,
        units: this.items,
        venue: saved.venue
      };
      this.isDirty = false;
      this.updateLayoutIndicator();

      try {
        const draft = JSON.parse(localStorage.getItem('tikim.draft') || '{}');
        draft.layoutId = saved.id;
        draft.floorPlan = { units: saved.units, venue: saved.venue, name: saved.name };
        localStorage.setItem('tikim.draft', JSON.stringify(draft));
        window.dispatchEvent(new CustomEvent('tikim:draft-updated'));
      } catch (e) {}

      showToast(`Layout "${newName}" saved successfully!`, 'success');
    } else {
      const saved = await saveLayout({
        id: this.currentLayout.id,
        name: this.currentLayout.name || 'My Venue Layout',
        venue: this.presets[this.currentPreset]?.label || 'Standard Hall',
        units: this.items
      });
      this.isDirty = false;
      this.updateLayoutIndicator();

      try {
        const draft = JSON.parse(localStorage.getItem('tikim.draft') || '{}');
        draft.layoutId = saved.id;
        draft.floorPlan = { units: saved.units, venue: saved.venue, name: saved.name };
        localStorage.setItem('tikim.draft', JSON.stringify(draft));
        window.dispatchEvent(new CustomEvent('tikim:draft-updated'));
      } catch (e) {}

      showToast(`Layout "${this.currentLayout.name}" updated successfully!`, 'success');
    }
  }

  async openMyLayoutsDialog() {
    let layouts = await listLayouts();
    let modal = document.getElementById('myLayoutsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'myLayoutsModal';
      modal.className = 'my-layouts-modal';
      document.body.appendChild(modal);
    }

    const onEsc = (e) => {
      if (e.key === 'Escape') {
        const confirmModal = document.getElementById('plannerConfirmModal');
        if (confirmModal) {
          confirmModal.remove();
        } else {
          closeModal();
        }
      }
    };

    const closeModal = () => {
      modal.style.display = 'none';
      window.removeEventListener('keydown', onEsc);
    };

    const showCenteredConfirm = ({ title, desc, cancelText = 'Cancel', confirmText = 'Delete', onConfirm }) => {
      let confirmModal = document.getElementById('plannerConfirmModal');
      if (confirmModal) confirmModal.remove();

      confirmModal = document.createElement('div');
      confirmModal.id = 'plannerConfirmModal';
      confirmModal.className = 'planner-confirm-modal';
      confirmModal.innerHTML = `
        <div class="planner-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirmModalTitle">
          <h3 class="planner-confirm-title" id="confirmModalTitle">${title}</h3>
          <p class="planner-confirm-desc">${desc}</p>
          <div class="planner-confirm-actions">
            <button type="button" class="btn btn-confirm-cancel" id="btnConfirmCancel">${cancelText}</button>
            <button type="button" class="btn btn-confirm-danger" id="btnConfirmOk">${confirmText}</button>
          </div>
        </div>
      `;
      document.body.style.overflow = 'hidden';
      document.body.appendChild(confirmModal);

      const closeConfirm = () => {
        document.body.style.overflow = '';
        if (confirmModal) confirmModal.remove();
      };

      confirmModal.querySelector('#btnConfirmCancel').addEventListener('click', closeConfirm);
      confirmModal.querySelector('#btnConfirmOk').addEventListener('click', async () => {
        closeConfirm();
        if (typeof onConfirm === 'function') await onConfirm();
      });
    };

    const renderList = () => {
      modal.innerHTML = `
        <div class="my-layouts-backdrop" id="closeLayoutsBackdrop"></div>
        <div class="my-layouts-card" role="dialog" aria-modal="true" aria-labelledby="layoutsModalTitle">
          <div class="my-layouts-header">
            <h3 id="layoutsModalTitle" style="margin:0; font-family:var(--font-heading, 'Fraunces', serif); color:#212e34; font-size:1.25rem;">My Saved Layouts (${layouts.length})</h3>
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <button type="button" class="btn btn-xs btn-outline" id="btnClearLayoutInsideModal" style="color:#ab4b2e; border-color:rgba(171,75,46,0.35);">Clear Layout</button>
              <button type="button" class="my-layouts-close" id="closeLayoutsBtn" aria-label="Close dialog">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div class="my-layouts-body">
            ${layouts.length === 0 ? '<p style="color:#212e34; font-size:1rem; padding:2rem; text-align:center;">No saved layouts yet.</p>' : `
              <div class="my-layouts-grid">
                ${layouts.map(l => `
                  <div class="my-layout-item-card" data-id="${l.id}">
                    <div class="layout-thumb-wrap">
                      ${renderLayoutPreviewSvg({ units: l.units || [], venueWidth: this.venueWidth, venueHeight: this.venueHeight })}
                    </div>
                    <div class="layout-item-info">
                      <strong class="layout-item-title">${l.name}</strong>
                      <span class="layout-item-meta">${l.venue || 'Standard Hall'} &bull; ${(l.units || []).length} units</span>
                    </div>
                    <div class="layout-item-actions">
                      <button type="button" class="btn btn-xs btn-primary btn-load-layout" data-id="${l.id}">Open</button>
                      <button type="button" class="btn btn-xs btn-outline btn-rename-layout" data-id="${l.id}">Rename</button>
                      <button type="button" class="btn btn-xs btn-outline btn-dup-layout" data-id="${l.id}">Duplicate</button>
                      <button type="button" class="btn btn-xs btn-outline btn-del-layout" data-id="${l.id}" style="color:#ab4b2e; border-color:rgba(171,75,46,0.3);">&times;</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;

      modal.style.display = 'flex';
      window.addEventListener('keydown', onEsc);

      modal.querySelector('#closeLayoutsBtn')?.addEventListener('click', closeModal);
      modal.querySelector('#closeLayoutsBackdrop')?.addEventListener('click', closeModal);

      modal.querySelector('#btnClearLayoutInsideModal')?.addEventListener('click', () => {
        showCenteredConfirm({
          title: 'Clear the floor?',
          desc: 'This will remove all items from your current floor layout. Are you sure?',
          cancelText: 'Cancel',
          confirmText: 'Clear floor',
          onConfirm: () => {
            this.recordState('Clear layout');
            this.items = [];
            this.selectedItemId = null;
            this.currentLayout = { id: null, name: null, units: [], venue: this.presets[this.currentPreset]?.label || 'Standard Hall' };
            this.isDirty = false;
            this.renderItems();
            this.updateSeatMeter();
            this.updateLayoutIndicator();
            this.notifyChange();
            closeModal();
          }
        });
      });

      modal.querySelectorAll('.btn-load-layout').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const target = layouts.find(l => l.id === id);
          if (target) {
            this.recordState('Load layout');
            this.items = JSON.parse(JSON.stringify(target.units || []));
            const isCopy = !!this.options.isStudio;
            this.currentLayout = {
              id: isCopy ? null : target.id,
              name: isCopy ? null : target.name,
              units: this.items,
              venue: target.venue || this.presets[this.currentPreset]?.label || 'Standard Hall'
            };
            this.isDirty = false;
            this.renderItems();
            this.updateSeatMeter();
            this.updateLayoutIndicator();
            this.notifyChange();

            // Sync with studio draft if in booking flow
            try {
              const draft = JSON.parse(localStorage.getItem('tikim.draft') || '{}');
              draft.layoutId = target.id;
              draft.floorPlan = { units: this.items, venue: target.venue, name: target.name };
              localStorage.setItem('tikim.draft', JSON.stringify(draft));
              window.dispatchEvent(new CustomEvent('tikim:draft-updated'));
            } catch (e) {}

            closeModal();
          }
        });
      });

      modal.querySelectorAll('.btn-rename-layout').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const target = layouts.find(l => l.id === id);
          if (target) {
            const newName = prompt('Enter new layout name:', target.name);
            if (newName && newName.trim()) {
              target.name = newName.trim();
              await saveLayout(target);
              if (this.currentLayout.id === target.id) {
                this.currentLayout.name = target.name;
                this.updateLayoutIndicator();
              }
              renderList();
            }
          }
        });
      });

      modal.querySelectorAll('.btn-dup-layout').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const target = layouts.find(l => l.id === id);
          if (target) {
            const copy = {
              ...target,
              id: 'layout-' + Date.now(),
              name: `${target.name} (Copy)`
            };
            await saveLayout(copy);
            layouts.unshift(copy);
            renderList();
          }
        });
      });

      modal.querySelectorAll('.btn-del-layout').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const target = layouts.find(l => l.id === id);
          const layoutName = target ? target.name : 'This layout';

          showCenteredConfirm({
            title: 'Delete this saved layout?',
            desc: `${layoutName} will be removed from your saved layouts. Bookings that already used it keep their own copy.`,
            cancelText: 'Cancel',
            confirmText: 'Delete',
            onConfirm: async () => {
              await deleteLayout(id);
              const idx = layouts.findIndex(l => l.id === id);
              if (idx >= 0) layouts.splice(idx, 1);
              if (this.currentLayout.id === id) {
                this.currentLayout.id = null;
                this.currentLayout.name = null;
                this.isDirty = true;
                this.updateLayoutIndicator();
              }
              renderList();
            }
          });
        });
      });
    };

    this.refreshMyLayoutsList = async () => {
      layouts = await listLayouts();
      renderList();
    };

    renderList();
  }
}
