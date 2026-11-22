/* EngDraft — aplicación, interfaz y flujos de trabajo */
(function (ED) {
  'use strict';

  var App = {
    booted: false,
    view: '2d',
    viewMode: 'plan',
    devicePref: 'auto',
    device: 'desktop',
    viewsData: null,
    viewsZoom: 1,
    viewsPan: { x: 0, y: 0 },
    sectionPosPct: 50,
    tab: 'props',
    activeTool: 'select',
    lastFurnitureId: null,
    libCat: 'todos',
    libQuery: '',
    selectedSheetId: null,
    options3d: { roof: false, furniture: true, labels: true, ground: true, dimensions: false, levels: 'all' },
    preset3d: 'iso',
    store: null,
    editor: null,
    view3d: null,
    view3dReady: false,
    modalOpen: false,
    last3dShot: null,
    saveFallbackTimer: null,
    threeTimer: null,
    sheetTimer: null,
    lastCursor: { x: 0, y: 0 },
    fontScale: 'normal',
    fontMenuOpen: false,
    rail: 'expanded',
    inspector: 'open',
    flight: false,
    url3d: null,
    _dropDepth: 0
  };
  ED.App = App;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function n(v, d) {
    var x = Number(v);
    return isFinite(x) ? x : (d || 0);
  }
  function fnum(v, dec) {
    var x = Number(v);
    if (!isFinite(x)) return '0';
    var s = x.toFixed(dec == null ? 2 : dec);
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }
  function safeName(s) {
    return String(s || 'proyecto').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'proyecto';
  }

  var AUTHOR = 'Prof. Raymond Rosa Ávila';

  function unitSys() {
    return (App.store && App.store.project.settings && App.store.project.settings.units) || 'm';
  }
  function unitLen(mm, dec) {
    return ED.Geo.formatLengthShort(mm, unitSys(), dec == null ? 2 : dec);
  }
  function unitLenInput(mm) {
    return ED.Geo.lengthInput(mm, unitSys(), 2);
  }
  function unitLenLabel() {
    return ED.Geo.unitLengthLabel(unitSys());
  }
  function unitSizeInput(mm) {
    return ED.Geo.sizeInput(mm, unitSys());
  }
  function unitSizeLabel() {
    return ED.Geo.unitSizeLabel(unitSys());
  }
  function unitArea(mm2) {
    return ED.Geo.formatArea(mm2, unitSys());
  }
  function areaValue(mm2) {
    return unitSys() === 'ft' ? Number(mm2) / 92930.4 : Number(mm2) / 1e6;
  }
  function lengthValue(mm) {
    return unitSys() === 'ft' ? Number(mm) / 304.8 : Number(mm) / 1000;
  }
  function parseLenInput(value) {
    return ED.Geo.parseLengthInput(value, unitSys());
  }
  function parseSizeInput(value) {
    return ED.Geo.parseSizeInput(value, unitSys());
  }
  function unitsBadge() {
    return unitSys() === 'ft' ? 'ft · ft²' : 'm · m²';
  }

  // ============================================================ tamaño de letra
  var FONT_KEY = 'engdraft.ui.font';
  var FONT_ORDER = ['normal', 'grande', 'xl'];
  var FONT_LABELS = { normal: 'Normal', grande: 'Grande', xl: 'Muy grande' };

  function storedFontScale() {
    var v = null;
    try { v = localStorage.getItem(FONT_KEY); } catch (e) { v = null; }
    return FONT_LABELS[v] ? v : 'normal';
  }

  function applyFontScale(scale, opts) {
    opts = opts || {};
    var s = FONT_LABELS[scale] ? scale : 'normal';
    App.fontScale = s;
    try { document.documentElement.setAttribute('data-font', s); } catch (e) { /* sin DOM */ }
    if (opts.persist !== false) {
      try { localStorage.setItem(FONT_KEY, s); } catch (e) { /* sin almacenamiento */ }
    }
    var btn = $('#btnFontScale');
    if (btn) {
      btn.title = 'Tamaño de letra de la interfaz: ' + FONT_LABELS[s] + ' (clic para cambiar)';
      btn.setAttribute('aria-label', 'Tamaño de letra: ' + FONT_LABELS[s]);
    }
    markFontMenu();
  }

  function ensureFontMenu() {
    var menu = $('#fontMenu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'fontMenu';
    menu.className = 'ui-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.innerHTML = '<div class="ui-menu-title">Tamaño de letra</div>' +
      FONT_ORDER.map(function (s) {
        return '<button type="button" class="ui-menu-item" role="menuitemradio" data-font-scale="' + s + '">' +
          '<span class="ui-menu-check">✓</span><span>' + FONT_LABELS[s] + '</span></button>';
      }).join('');
    document.body.appendChild(menu);
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-font-scale]');
      if (!b) return;
      applyFontScale(b.getAttribute('data-font-scale'));
      toast('Tamaño de letra: ' + FONT_LABELS[App.fontScale], 'success', 1800);
      closeFontMenu();
    });
    return menu;
  }

  function markFontMenu() {
    var menu = $('#fontMenu');
    if (!menu) return;
    $$('[data-font-scale]', menu).forEach(function (b) {
      var on = b.getAttribute('data-font-scale') === App.fontScale;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function openFontMenu() {
    var btn = $('#btnFontScale');
    if (!btn) return;
    var menu = ensureFontMenu();
    markFontMenu();
    menu.hidden = false;
    App.fontMenuOpen = true;
    var r = btn.getBoundingClientRect();
    var mw = menu.offsetWidth || 220;
    var mh = menu.offsetHeight || 180;
    var left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8));
    var top = r.top - mh - 8;
    if (top < 8) top = r.bottom + 8;
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(top) + 'px';
    btn.setAttribute('aria-expanded', 'true');
  }

  function closeFontMenu() {
    var menu = $('#fontMenu');
    if (menu) menu.hidden = true;
    App.fontMenuOpen = false;
    var btn = $('#btnFontScale');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleFontMenu() {
    if (App.fontMenuOpen) closeFontMenu();
    else openFontMenu();
  }

  // ============================================================ paneles laterales
  var RAIL_KEY = 'engdraft.ui.rail';
  var INSPECTOR_KEY = 'engdraft.ui.inspector';

  function storedUiState(key, fallback, allowed) {
    var v = null;
    try { v = localStorage.getItem(key); } catch (e) { v = null; }
    return allowed.indexOf(v) >= 0 ? v : fallback;
  }

  function applyRailState(state, opts) {
    opts = opts || {};
    var next = state === 'compact' ? 'compact' : 'expanded';
    App.rail = next;
    var app = $('#app');
    if (app) app.setAttribute('data-rail', next);
    var btn = $('#btnRailToggle');
    if (btn) {
      btn.title = next === 'expanded' ? 'Ocultar el menú de opciones' : 'Mostrar el menú de opciones';
      btn.setAttribute('aria-expanded', next === 'expanded' ? 'true' : 'false');
    }
    if (opts.persist !== false) {
      try { localStorage.setItem(RAIL_KEY, next); } catch (e) { /* sin almacenamiento */ }
    }
  }

  function toggleRail() {
    applyRailState(App.rail === 'expanded' ? 'compact' : 'expanded');
  }

  function applyInspectorState(state, opts) {
    opts = opts || {};
    var next = state === 'closed' ? 'closed' : 'open';
    App.inspector = next;
    var app = $('#app');
    if (app) app.setAttribute('data-inspector', next);
    var reopen = $('#btnInspectorReopen');
    if (reopen) reopen.hidden = next === 'open';
    var btn = $('#btnInspectorToggle');
    if (btn) {
      btn.title = next === 'open' ? 'Ocultar el panel de ajustes' : 'Mostrar el panel de ajustes';
      btn.setAttribute('aria-expanded', next === 'open' ? 'true' : 'false');
    }
    if (opts.persist !== false) {
      try { localStorage.setItem(INSPECTOR_KEY, next); } catch (e) { /* sin almacenamiento */ }
    }
    // El lienzo cambia de tamaño al plegar; el editor se reajusta.
    setTimeout(function () {
      if (App.view === '2d' && App.editor) { App.editor._resize(); App.editor.render(); }
      else if (App.view === '3d' && App.view3d && App.view3d.resize) {
        try { App.view3d.resize(); App.view3d.render(); } catch (e) { /* ignore */ }
      }
    }, 240);
  }

  function toggleInspector() {
    applyInspectorState(App.inspector === 'open' ? 'closed' : 'open');
  }

  // ==================================================================== rejilla
  function gridSettings() {
    var s = (App.store && App.store.project.settings) || {};
    var size = Number(s.grid);
    var major = Math.round(Number(s.gridMajor));
    var step = Number(s.snapStep);
    var ox = Number(s.gridOriginX);
    var oy = Number(s.gridOriginY);
    return {
      size: isFinite(size) && size > 0 ? size : 250,
      major: isFinite(major) && major >= 2 ? major : 4,
      step: isFinite(step) && step > 0 ? step : 0,
      originX: isFinite(ox) ? ox : 0,
      originY: isFinite(oy) ? oy : 0,
      style: s.gridStyle === 'dots' ? 'dots' : 'lines',
      adaptive: s.gridAdaptive !== false,
      axes: s.showAxes !== false
    };
  }

  function gridLabel(mm) {
    var v = Number(mm);
    if (!isFinite(v)) return '—';
    if (ED.Geo.isImperial(unitSys())) {
      var inches = v / 25.4;
      if (Math.abs(inches) < 12) {
        var sign = inches < 0 ? '-' : '';
        var q = Math.round(Math.abs(inches) * 4) / 4;
        var whole = Math.floor(q);
        var frac = Math.round((q - whole) * 4);
        var fracTxt = frac === 1 ? ' 1/4' : frac === 2 ? ' 1/2' : frac === 3 ? ' 3/4' : '';
        return sign + whole + fracTxt + '"';
      }
      return ED.Geo.formatLength(v, 'ft');
    }
    if (Math.abs(v) < 1000) return fnum(v / 10, 2) + ' cm';
    return fnum(v / 1000, 2) + ' m';
  }

  function gridTooltip() {
    var g = gridSettings();
    return 'Rejilla: ' + gridLabel(g.size) +
      ' · línea maestra cada ' + g.major +
      ' · ajuste: ' + (g.step ? gridLabel(g.step) : 'igual a la rejilla') +
      ' · origen: ' + gridLabel(g.originX) + ', ' + gridLabel(g.originY) +
      ' · ' + (g.style === 'dots' ? 'puntos' : 'líneas') +
      (g.adaptive ? ' · adaptativa' : '');
  }

  function updateGridChips() {
    if (!App.store) return;
    var g = gridSettings();
    var label = gridLabel(g.size);
    var chip = $('#gridChipLabel');
    if (chip) chip.textContent = label;
    var status = $('#statusGrid');
    if (status) status.textContent = 'Rejilla ' + label;
    var tip = gridTooltip();
    var setup = $('#btnGridSetup');
    if (setup) setup.title = tip + ' · Clic para configurar (Shift+G)';
    var statusBtn = $('#btnGridStatus');
    if (statusBtn) statusBtn.title = tip + ' · Clic para configurar (Shift+G)';
  }

  function applyGridToEditor() {
    if (!App.editor) return;
    var g = gridSettings();
    App.editor.setSnap({
      grid: App.editor.snap.grid,
      snapping: App.editor.snap.snapping,
      ortho: App.editor.snap.ortho,
      gridSize: g.size,
      gridMajor: g.major,
      snapStep: g.step,
      gridOriginX: g.originX,
      gridOriginY: g.originY,
      gridStyle: g.style,
      gridAdaptive: g.adaptive,
      showAxes: g.axes
    });
    updateGridChips();
  }

  var ICON = {
    cursor: '<path d="M4.5 3.2 15 9.4l-4.7 1.5-1.7 4.6L4.5 3.2Z" stroke-width="1.4" stroke-linejoin="round"/>',
    hand: '<path d="M7 9V5.2a1.3 1.3 0 0 1 2.6 0V9m0-1.2V4.3a1.3 1.3 0 0 1 2.6 0V9m0-1.4V5.2a1.3 1.3 0 0 1 2.6 0v6.1c0 2.7-1.8 4.5-4.4 4.5-2.2 0-3.4-1-4.3-2.8L4 10.1c-.6-1.2.9-2.3 1.9-1.3L7 9.9" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    wall: '<path d="M3 5.5h14v9H3z" stroke-width="1.3"/><path d="M3 8h14M8.5 5.5v2.5M12.5 8v2.5M7 10.5V13M10.5 10.5V13M14 10.5V13" stroke-width="1"/>',
    door: '<path d="M4 3.5h7.5v13H4z" stroke-width="1.3"/><path d="M11.5 6.5h4v10h-4" stroke-width="1.3"/><path d="M7.2 10.3h.1" stroke-width="2" stroke-linecap="round"/><path d="M12 6.5v10" stroke-width="1" opacity=".5"/>',
    window: '<path d="M3 5h14v10H3z" stroke-width="1.3"/><path d="M3 10h14M10 5v10" stroke-width="1"/>',
    room: '<path d="M4 4h12v12H4z" stroke-width="1.3"/><path d="M7 7h6v6H7z" stroke-width="1" opacity=".45"/><circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none"/>',
    furniture: '<path d="M4 10.5V7.2A1.7 1.7 0 0 1 5.7 5.5h8.6A1.7 1.7 0 0 1 16 7.2v3.3" stroke-width="1.3"/><path d="M4 9.5h12a1.5 1.5 0 0 1 1.5 1.5v3.5H2.5V11A1.5 1.5 0 0 1 4 9.5Z" stroke-width="1.3"/><path d="M4.5 14.5v1.7M15.5 14.5v1.7" stroke-width="1.3" stroke-linecap="round"/>',
    text: '<path d="M4 5h12M10 5v11" stroke-width="1.5" stroke-linecap="round"/><path d="M7 16h6" stroke-width="1.3" stroke-linecap="round"/>',
    dim: '<path d="M3 13.5h14M3 11v5M17 11v5" stroke-width="1.3" stroke-linecap="round"/><path d="M7 10.2 5 13.5l2 3.3M13 10.2l2 3.3-2 3.3" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
    erase: '<path d="m4 13.2 6.4-6.4a1.4 1.4 0 0 1 2 0l3.2 3.2a1.4 1.4 0 0 1 0 2L11 16.5H6.8L4 13.2Z" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.5 7.5 14 12M8 16.5h8" stroke-width="1.2" stroke-linecap="round"/>',
    plus: '<path d="M10 4v12M4 10h12" stroke-width="1.6" stroke-linecap="round"/>',
    minus: '<path d="M4 10h12" stroke-width="1.6" stroke-linecap="round"/>',
    fit: '<path d="M3 6.5V3h3.5M11.5 3H15v3.5M15 11.5V15h-3.5M6.5 15H3v-3.5" stroke-width="1.3" stroke-linecap="round"/>',
    trash: '<path d="M4 6h12M8 6V3.6h4V6M6 6l.7 11h6.6L14 6M8.5 9v5M11.5 9v5" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
    duplicate: '<rect x="6.5" y="6.5" width="9" height="9" rx="1.4" stroke-width="1.2"/><path d="M4.5 12.5V5.4A1.4 1.4 0 0 1 5.9 4h7.1" stroke-width="1.2" stroke-linecap="round"/>',
    rotate: '<path d="M14.8 8.2A5.6 5.6 0 1 0 16 13" stroke-width="1.4" stroke-linecap="round"/><path d="M15.5 4v4.5H11" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    search: '<circle cx="9" cy="9" r="4.5" stroke-width="1.3"/><path d="m12.5 12.5 3.5 3.5" stroke-width="1.4" stroke-linecap="round"/>',
    eye: '<path d="M2.5 10s2.5-4 7.5-4 7.5 4 7.5 4-2.5 4-7.5 4-7.5-4-7.5-4Z" stroke-width="1.2"/><circle cx="10" cy="10" r="1.8" stroke-width="1.2"/>',
    eyeoff: '<path d="M3 3l14 14" stroke-width="1.3" stroke-linecap="round"/><path d="M7.2 6.5C4.6 7.6 2.5 10 2.5 10s2.5 4 7.5 4c1.4 0 2.6-.3 3.7-.9M12.4 12.4c2.3-1.1 4.1-2.4 5.1-2.4 0 0-2.5-4-7.5-4-.7 0-1.4.1-2 .2" stroke-width="1.2" stroke-linecap="round"/>',
    lock: '<rect x="5" y="9" width="10" height="8" rx="1.5" stroke-width="1.2"/><path d="M7.2 9V6.8a2.8 2.8 0 0 1 5.6 0V9" stroke-width="1.2"/>',
    unlock: '<rect x="5" y="9" width="10" height="8" rx="1.5" stroke-width="1.2"/><path d="M7.2 9V6.8a2.8 2.8 0 0 1 5.3-1.2" stroke-width="1.2" stroke-linecap="round"/>',
    layers: '<path d="m10 3 7 4-7 4-7-4 7-4Z" stroke-width="1.2" stroke-linejoin="round"/><path d="m3 10 7 4 7-4M3 13.2l7 4 7-4" stroke-width="1.2" stroke-linejoin="round"/>',
    pdf: '<path d="M5 2.8h7l3.5 3.5v10.9H5V2.8Z" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 8h4M8 10.6h4M8 13.2h2.5" stroke-width="1.1" stroke-linecap="round"/>',
    dwg: '<path d="M4 3h9l3 3v11H4z" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 8v5M6.5 13H8a2.5 2.5 0 0 0 0-5H6.5M11 8l1.5 5L14 8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>',
    help: '<circle cx="10" cy="10" r="7.2" stroke-width="1.2"/><path d="M8.1 7.8c.1-1.2 1-2 2-2 1.2 0 2 .8 2 1.9 0 1.4-1.8 1.5-2 2.8" stroke-width="1.3" stroke-linecap="round"/><circle cx="10" cy="13.8" r=".9" fill="currentColor" stroke="none"/>',
    camera: '<path d="M3.5 7.5h3l1.2-2h4.6l1.2 2h3v8h-13z" stroke-width="1.2" stroke-linejoin="round"/><circle cx="10" cy="11.5" r="2.4" stroke-width="1.2"/>',
    sheet: '<rect x="3" y="2.8" width="14" height="14.4" rx="1.2" stroke-width="1.2"/><path d="M3 13.2h14M12 13.2v4M5 6h4M5 8.5h6" stroke-width="1" stroke-linecap="round"/>',
    cube: '<path d="m10 2.8 7 3.9v6.7l-7 3.9-7-3.9V6.7l7-3.9Z" stroke-width="1.2" stroke-linejoin="round"/><path d="m3.2 6.8 6.8 3.8 6.8-3.8M10 10.6v6.5" stroke-width="1.2" stroke-linejoin="round"/>',
    floor: '<path d="M3 6h14M3 10h14M3 14h14M6.5 6v8M13.5 6v8" stroke-width="1" opacity=".8"/>',
    roof: '<path d="M2.5 9.5 10 3.5l7.5 6" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 8.5v8h11v-8" stroke-width="1.2" stroke-linejoin="round"/>',
    labels: '<path d="M3 5h8M3 9h6M3 13h4" stroke-width="1.2" stroke-linecap="round"/><path d="M12 14.5V9.5h4.5v5H12Z" stroke-width="1.1"/><path d="M13.5 8.2h.1" stroke-width="2" stroke-linecap="round"/>',
    close: '<path d="m5 5 10 10M15 5 5 15" stroke-width="1.5" stroke-linecap="round"/>',
    info: '<circle cx="10" cy="10" r="7.2" stroke-width="1.2"/><path d="M10 9v5" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="6.5" r=".9" fill="currentColor" stroke="none"/>',
    grid: '<path d="M3 3h14v14H3zM3 8h14M3 13h14M8 3v14M13 3v14" stroke-width="1.1"/>',
    sparkle: '<path d="M10 3v4M10 13v4M3 10h4M13 10h4M5.2 5.2l2.6 2.6M12.2 12.2l2.6 2.6M14.8 5.2l-2.6 2.6M7.8 12.2l-2.6 2.6" stroke-width="1.2" stroke-linecap="round"/>',
    measure: '<path d="M3 12.5 12.5 3l4.5 4.5L7.5 17 3 12.5Z" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 9.2l1.8 1.8M9 6.7l1.8 1.8M11.5 4.2l1.8 1.8" stroke-width="1.1" stroke-linecap="round"/>',
    level: '<path d="M3 16h14M3 13h14M3 10h14M3 7h14M3 4h14" stroke-width="1.2" stroke-linecap="round"/>',
    wallArc: '<path d="M3 15A10 10 0 0 1 13 5" stroke-width="1.4" stroke-linecap="round"/><path d="M3 15h10" stroke-width="1.2" opacity=".45"/><circle cx="3" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="13" cy="5" r="1.5" fill="currentColor" stroke="none"/>',
    wallSpline: '<path d="M3 15c3-7 5 4 8-3s4-2 6-3" stroke-width="1.4" stroke-linecap="round"/><circle cx="3" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="17" cy="9" r="1.5" fill="currentColor" stroke="none"/>',
    palette: '<circle cx="10" cy="10" r="7.1" stroke-width="1.3"/><circle cx="7" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="13" cy="7.4" r="1.3" fill="currentColor" stroke="none"/><circle cx="12.4" cy="13" r="1.3" fill="currentColor" stroke="none"/>',
    drone: '<rect x="7.2" y="8" width="5.6" height="4" rx="1.3" stroke-width="1.3"/><path d="M7.2 9 3.6 5.4M12.8 9l3.6-3.6M7.2 11 3.6 14.6M12.8 11l3.6 3.6" stroke-width="1.3" stroke-linecap="round"/><circle cx="3.2" cy="5" r="1.5" stroke-width="1.1"/><circle cx="16.8" cy="5" r="1.5" stroke-width="1.1"/><circle cx="3.2" cy="15" r="1.5" stroke-width="1.1"/><circle cx="16.8" cy="15" r="1.5" stroke-width="1.1"/>',
    sun: '<circle cx="10" cy="10" r="3.4" stroke-width="1.3"/><path d="M10 2.4v2.1M10 15.5v2.1M2.4 10h2.1M15.5 10h2.1M4.7 4.7l1.5 1.5M13.8 13.8l1.5 1.5M15.3 4.7l-1.5 1.5M6.2 13.8l-1.5 1.5" stroke-width="1.3" stroke-linecap="round"/>',
    texture: '<rect x="3" y="3" width="14" height="14" rx="2" stroke-width="1.2"/><path d="M3 7.5h14M3 12.5h14M7.5 3v14M12.5 3v14" stroke-width="1" opacity=".55"/>',
    tree: '<path d="M10 3.2 4.6 11h3l-2.4 4h9.6l-2.4-4h3L10 3.2Z" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 15v2.8" stroke-width="1.3" stroke-linecap="round"/>',
    garden: '<path d="M3 15c0-6 3-9 7-9s7 3 7 9" stroke-width="1.2" stroke-linecap="round" opacity=".5"/><circle cx="10" cy="9" r="2.6" stroke-width="1.3"/><path d="M10 11.6V16M6.5 16h7" stroke-width="1.2" stroke-linecap="round"/>',
    road: '<path d="M7 16 5.6 4M13 16l1.4-12" stroke-width="1.4" stroke-linecap="round"/><path d="M10 5.5v2M10 9.5v2M10 13.5v2" stroke-width="1.2" stroke-linecap="round"/>',
    folder: '<path d="M2.8 5.8h5l1.5 1.8h7.9v7.9a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1V5.8Z" stroke-width="1.3" stroke-linejoin="round"/><path d="M2.8 8.4h14.4" stroke-width="1.1"/>',
    save: '<path d="M4 3.5h9.2L17 7.3v9.2H4V3.5Z" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 3.5v5h6v-5M7 13.5h6" stroke-width="1.2"/>',
    undo: '<path d="M7.4 6.2 3.6 10l3.8 3.8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10h7.2a4 4 0 0 1 0 8H8.5" stroke-width="1.4" stroke-linecap="round"/>',
    line: '<path d="M3.5 16.5 16.5 3.5" stroke-width="1.5" stroke-linecap="round"/><circle cx="3.5" cy="16.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.5" cy="3.5" r="1.6" fill="currentColor" stroke="none"/>',
    curve: '<path d="M3.5 15.5c2.5-8 10.5-8 13 0" stroke-width="1.5" stroke-linecap="round"/><circle cx="3.5" cy="15.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.5" cy="15.5" r="1.6" fill="currentColor" stroke="none"/>',
    scale: '<path d="M4 16V9M4 16h7M4 9l5-5M4 16l7-7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 3.5h5v5" stroke-width="1.3" stroke-linecap="round"/>'
  };

  function icon(name, size) {
    var s = size || 20;
    return '<svg viewBox="0 0 20 20" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || ICON.info) + '</svg>';
  }

  // ================================================================== boot
  function boot() {
    if (App.booted) return;
    App.booted = true;

    var bootParams = null;
    try { bootParams = new URLSearchParams(window.location.search); } catch (e) { bootParams = null; }
    var fontParam = bootParams ? bootParams.get('font') : null;
    applyFontScale(fontParam || storedFontScale(), { persist: false });

    // Estados de paneles y ajustes 3D de apoyo para verificación por URL.
    var railParam = bootParams ? bootParams.get('rail') : null;
    var inspectorParam = bootParams ? bootParams.get('inspector') : null;
    App.url3d = {
      render: bootParams ? bootParams.get('render') : null,
      roof: bootParams ? bootParams.get('roof') : null,
      flight: !!bootParams && bootParams.get('flight') === '1'
    };
    applyRailState(railParam || storedUiState(RAIL_KEY, 'expanded', ['expanded', 'compact']), { persist: false });
    applyInspectorState(inspectorParam || storedUiState(INSPECTOR_KEY, 'open', ['open', 'closed']), { persist: false });

    var project = null;
    var restored = false;
    var saved = null;
    try {
      var raw = localStorage.getItem(ED.Store && ED.Store.STORAGE_KEY ? ED.Store.STORAGE_KEY : 'engdraft.autosave.v1');
      if (raw) saved = JSON.parse(raw);
    } catch (e) { saved = null; }

    if (saved) {
      try {
        ED.Store.normalizeProject(saved);
        project = saved;
        restored = true;
      } catch (e) {
        console.warn('Autoguardado inválido, se carga la demo.', e);
      }
    }
    if (!project) {
      try {
        project = (ED.Templates && ED.Templates.demo) ? ED.Templates.demo() : fallbackProject();
      } catch (e) {
        console.error('No se pudo crear la demo:', e);
        project = fallbackProject();
      }
    }

    // El ejemplo antiguo traía datos de una persona inventada; al cargar un
    // autoguardado con esos valores exactos se sustituyen por datos genéricos.
    if (project && project.meta) {
      if (project.meta.engineer === 'Ing. Ana Martínez') project.meta.engineer = 'Ing. Proyecto';
      if (project.meta.license === 'CIP 12-3456') project.meta.license = '***';
      if (project.meta.email === 'ana.martinez@estudioaurora.com') project.meta.email = 'contacto@estudioaurora.com';
    }

    App.store = new ED.Store(project);
    ED.store = App.store;
    registerProjectAssets(project);

    injectShell();
    bindStatic();
    initEditor();
    initStoreEvents();
    App.selectedSheetId = App.store.project.sheets.length ? App.store.project.sheets[0].id : null;

    refreshHeader();
    refreshLevelTabs();
    refreshUndo();
    setSaveState('saved');
    // Modo de pantalla guardado (automático por defecto): computadora/tableta/celular.
    var storedDevice = 'auto';
    try { storedDevice = localStorage.getItem('engdraft.deviceMode') || 'auto'; } catch (e) { storedDevice = 'auto'; }
    App.device = 'desktop';
    applyDeviceMode(storedDevice);
    setView('2d');
    App.editor.fitToContent();
    App.editor.render();
    refreshProps();
    refreshLayers();
    renderLibrary();
    updateZoomStatus();
    sync3DQuickControls();
    syncCanvasToggles();
    syncSnapChips();
    initLanguage();

    setTimeout(function () {
      App.editor._resize();
      App.editor.fitToContent();
      App.editor.render();
    }, 60);

    if (restored) toast('Sesión restaurada desde este navegador.', 'success', 3200);
    else toast('Residencia Aurora cargada. Explora el plano 2D, la vista 3D y las láminas.', 'info', 5200);
    try {
      var viewParam = bootParams ? bootParams.get('view') : null;
      if (viewParam === '3d') {
        setTimeout(function () {
          setView('3d');
          if (App.url3d && App.url3d.flight) setTimeout(function () { setFlight(true); }, 900);
        }, 160);
      } else if (viewParam === 'sheets') setTimeout(function () { setView('sheets'); }, 160);
      var dialogParam = bootParams ? bootParams.get('dialog') : null;
      if (dialogParam === 'grid') setTimeout(function () { showGridDialog(); }, 260);
      else if (dialogParam === 'help') setTimeout(function () { showHelp(); }, 260);
      else if (dialogParam === 'scene') {
        setTimeout(function () {
          applyInspectorState('open');
          setInspectorTab('scene');
        }, 300);
      }
    } catch (e) { /* URLSearchParams no disponible */ }
    if (!window.ResizeObserver) console.warn('ResizeObserver no disponible');
  }

  function fallbackProject() {
    var p = {
      schema: 'engdraft/v1',
      meta: { name: 'Proyecto nuevo', client: '', location: '', engineer: '', license: '', phone: '', email: '', date: '2026-11-18', revision: 'A', description: '', notes: '' },
      settings: {
        units: 'm', grid: 250, wallThickness: 150, wallHeight: 2700,
        floorHeight: 2800, northAngle: 0, autoDim: true,
        gridMajor: 4, gridOriginX: 0, gridOriginY: 0, snapStep: 0,
        gridAdaptive: true, gridStyle: 'lines', showAxes: true,
        roof: { style: 'flat', height: 1200, overhang: 400, ridge: 'auto', profile: null },
        materials: {
          wall: { color: '#f3eee2', texture: 'stucco' },
          roof: { color: '#b49a7c', texture: 'tile' },
          trim: { color: '#fdfaf2' },
          ground: { color: '#c9d3ab', texture: 'grass' }
        },
        render: { mode: 'schematic', shadows: true, textures: true, sunAngle: 135 }
      },
      layers: [
        { id: 'walls', name: 'Muros', color: '#263238', visible: true, locked: false },
        { id: 'openings', name: 'Aberturas', color: '#2e7d8f', visible: true, locked: false },
        { id: 'furniture', name: 'Mobiliario', color: '#6b7c93', visible: true, locked: false },
        { id: 'rooms', name: 'Ambientes', color: '#6aa89a', visible: true, locked: false },
        { id: 'annotation', name: 'Anotaciones', color: '#1f2937', visible: true, locked: false },
        { id: 'dimensions', name: 'Cotas', color: '#b5651d', visible: true, locked: false }
      ],
      levels: [{ id: 'l0', name: 'Planta', elevation: 0, height: 2800 }],
      walls: [], rooms: [], items: [], texts: [], dims: [],
      sheets: [{ id: 's_blank', name: 'Planta', size: 'A3', orientation: 'landscape', template: 'modern', scale: 100, content: 'plan', levelId: 'l0', sheetNo: 'A-01', title: 'PLANTA', notes: '', showDims: true, showFurniture: true, showRooms: true, showGrid: false }]
    };
    return p;
  }

  // ================================================================== shell
  var VIEW_MODES = [
    { id: 'plan', label: 'Planta', abbr: 'P' },
    { id: 'front', label: 'Frontal', abbr: 'F' },
    { id: 'rear', label: 'Posterior', abbr: 'PO' },
    { id: 'right', label: 'Lateral der.', abbr: 'LD' },
    { id: 'left', label: 'Lateral izq.', abbr: 'LI' },
    { id: 'sectionX', label: 'Sección transversal', abbr: 'ST' },
    { id: 'sectionY', label: 'Sección longitudinal', abbr: 'SL' }
  ];

  var SNAP_MODES = [
    { id: 'endpoint', label: 'Extremo' },
    { id: 'midpoint', label: 'Medio' },
    { id: 'center', label: 'Centro' },
    { id: 'quadrant', label: 'Cuadrante' },
    { id: 'tangent', label: 'Tangente' },
    { id: 'perpendicular', label: 'Perp.' }
  ];

  var TOGGLE_ICONS = {
    grid: '<path d="M3 3h12v12H3zM3 7.5h12M3 12h12M7.5 3v12M12 3v12" stroke-width="1.2"/>',
    snapping: '<circle cx="9" cy="9" r="3" stroke-width="1.3"/><path d="M9 1.5v3M9 13.5v3M1.5 9h3M13.5 9h3" stroke-width="1.3"/>',
    ortho: '<path d="M3 15V4h11" stroke-width="1.4" stroke-linecap="round"/><path d="M3 10h5V4" stroke-width="1.2" opacity=".55"/>'
  };

  function viewModeInfo(id) {
    for (var i = 0; i < VIEW_MODES.length; i++) if (VIEW_MODES[i].id === id) return VIEW_MODES[i];
    return VIEW_MODES[0];
  }

  // Modos de pantalla: automático (según el tamaño), computadora, tableta o celular.
  var DEVICE_MODES = [
    { id: 'auto', label: 'Automático' },
    { id: 'desktop', label: 'Computadora' },
    { id: 'tablet', label: 'Tableta' },
    { id: 'mobile', label: 'Celular' }
  ];

  function deviceIcon(id) {
    if (id === 'desktop') return '<rect x="2.5" y="4" width="15" height="9.5" rx="1.2" stroke-width="1.4"/><path d="M7 16.5h6M10 13.5v3" stroke-width="1.4" stroke-linecap="round"/>';
    if (id === 'tablet') return '<rect x="4.5" y="2.8" width="11" height="14.4" rx="1.6" stroke-width="1.4"/><circle cx="10" cy="15" r="0.9" fill="currentColor"/>';
    if (id === 'mobile') return '<rect x="6" y="2.8" width="8" height="14.4" rx="1.8" stroke-width="1.4"/><path d="M9 5.2h2" stroke-width="1.3" stroke-linecap="round"/><circle cx="10" cy="15" r="0.8" fill="currentColor"/>';
    return '<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" stroke-width="1.3" stroke-linecap="round"/><circle cx="7.5" cy="5.5" r="1.8" fill="currentColor"/><circle cx="12.5" cy="10" r="1.8" fill="currentColor"/><circle cx="8.5" cy="14.5" r="1.8" fill="currentColor"/>';
  }

  function detectDevice() {
    var w = Math.min(
      window.innerWidth || 99999,
      document.documentElement.clientWidth || 99999
    );
    if (!isFinite(w) || w <= 0) w = 1200;
    var coarse = false;
    try { coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { coarse = false; }
    if (w <= 720 || (coarse && w <= 900)) return 'mobile';
    if (w <= 1120) return 'tablet';
    return 'desktop';
  }

  function resolvedDevice() {
    return App.devicePref === 'auto' ? detectDevice() : App.devicePref;
  }

  function applyDeviceMode(pref, opts) {
    opts = opts || {};
    var valid = pref === 'auto' || pref === 'desktop' || pref === 'tablet' || pref === 'mobile';
    App.devicePref = valid ? pref : 'auto';
    try { localStorage.setItem('engdraft.deviceMode', App.devicePref); } catch (e) { /* sin almacenamiento */ }
    var next = resolvedDevice();
    var prev = App.device;
    App.device = next;
    var app = $('#app');
    if (app) app.setAttribute('data-device', next);
    document.documentElement.setAttribute('data-device', next);
    $$('#toolList [data-device-mode]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-device-mode') === App.devicePref);
    });
    var devSelect = $('#deviceModeSelect');
    if (devSelect && devSelect.value !== App.devicePref) devSelect.value = App.devicePref;
    if (!opts.silent && next !== prev) {
      if (next === 'mobile') {
        applyRailState('compact', { silent: true, persist: false });
        applyInspectorState('closed', { silent: true, persist: false });
      } else if (prev === 'mobile') {
        applyRailState('expanded', { silent: true, persist: false });
        applyInspectorState('open', { silent: true, persist: false });
      }
    }
    clearTimeout(App.deviceTimer);
    App.deviceTimer = setTimeout(function () {
      if (App.editor) {
        try { App.editor._resize(); App.editor.render(); } catch (e) { /* tolerar */ }
      }
      if (App.viewMode !== 'plan') renderViews();
    }, 90);
  }

  function injectShell() {
    var list = $('#toolList');
    if (!list) return;
    var tools = [
      { id: 'select', label: 'Seleccionar', key: 'V', icon: 'cursor' },
      { id: 'pan', label: 'Mover', key: 'H', icon: 'hand' },
      { sep: true },
      { id: 'wall', label: 'Muro', key: 'M', icon: 'wall', title: 'Muro recto encadenado' },
      { id: 'wallArc', label: 'Arco', key: 'C', icon: 'wallArc', title: 'Muro en arco' },
      { id: 'wallSpline', label: 'Spline', key: 'K', icon: 'wallSpline', title: 'Muro spline' },
      { id: 'line', label: 'Línea', key: 'L', icon: 'line', title: 'Líneas encadenadas' },
      { id: 'curve', label: 'Curva', key: 'B', icon: 'curve', title: 'Curva por tres puntos' },
      { id: 'door', label: 'Puerta', key: 'P', icon: 'door' },
      { id: 'window', label: 'Ventana', key: 'N', icon: 'window' },
      { id: 'room', label: 'Ambiente', key: 'A', icon: 'room' },
      { sep: true },
      { id: 'furniture', label: 'Muebles', key: 'F', icon: 'furniture', title: 'Muebles, plantas y vías' },
      { id: 'text', label: 'Texto', key: 'T', icon: 'text' },
      { id: 'dim', label: 'Cota', key: 'D', icon: 'dim' },
      { id: 'scale', label: 'Escalar', key: 'X', icon: 'scale', title: 'Escalar la selección' },
      { sep: true },
      { id: 'erase', label: 'Borrar', key: 'E', icon: 'erase' }
    ];
    var toolsHtml = tools.map(function (t) {
      if (t.sep) return '<div class="tool-sep"></div>';
      var full = t.title || t.label;
      return '<button class="tool-btn' + (t.id === 'select' ? ' active' : '') + '" data-tool="' + t.id + '" title="' + esc(full) + ' (' + t.key + ')">' +
        icon(t.icon) + '<small>' + esc(t.label) + '</small><span class="key">' + t.key + '</span></button>';
    }).join('');

    var toggleNames = { grid: 'Rejilla', snapping: 'Snap', ortho: 'Orto' };
    var toggleKeys = { grid: 'G', snapping: 'S', ortho: 'O' };
    var toggleHtml = ['grid', 'snapping', 'ortho'].map(function (k) {
      return '<button class="rail-toggle' + (App.editor && App.editor.snap[k] ? ' on' : '') + '" data-toggle="' + k + '" title="' +
        toggleNames[k] + ' (' + toggleKeys[k] + ')">' +
        '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true">' + TOGGLE_ICONS[k] + '</svg>' +
        '<span>' + toggleNames[k] + '</span></button>';
    }).join('');

    var viewButtons = VIEW_MODES.map(function (v) {
      return '<button class="rail-view-btn' + (v.id === App.viewMode ? ' active' : '') + '" data-view-mode="' + v.id + '" title="' + esc(v.label) + '">' +
        '<b class="rail-view-abbr">' + v.abbr + '</b><span>' + esc(v.label) + '</span></button>';
    }).join('');

    list.innerHTML =
      '<div class="rail-section rail-project"><div class="rail-section-title">Proyecto</div><div class="rail-project-grid">' +
      '<button class="rail-action" id="btnRailOpen" title="Abrir proyecto (Ctrl+O)">' + icon('folder', 14) + '<span>Abrir</span></button>' +
      '<button class="rail-action" id="btnRailSave" title="Guardar proyecto (Ctrl+S)">' + icon('save', 14) + '<span>Guardar</span></button>' +
      '<button class="rail-action" id="btnRailNew" title="Nuevo proyecto (Ctrl+N)">' + icon('plus', 14) + '<span>Nuevo</span></button>' +
      '<button class="rail-action" id="btnRailUndo" title="Deshacer (Ctrl+Z)">' + icon('undo', 14) + '<span>Deshacer</span></button>' +
      '</div></div>' +
      '<div class="rail-section"><div class="rail-section-title">Herramientas</div>' + toolsHtml + '</div>' +
      '<div class="rail-section"><div class="rail-section-title">Dibujo</div>' +
      '<div class="rail-toggle-row">' + toggleHtml + '</div>' +
      '<button id="btnGridSetup" class="grid-chip rail-grid-chip" type="button" title="Configurar rejilla (Shift+G)">' +
      '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 3h12v12H3zM3 7.5h12M3 12h12M7.5 3v12M12 3v12" stroke="currentColor" stroke-width="1.2"/></svg>' +
      '<b id="gridChipLabel">25 cm</b>' +
      '<svg class="grid-chip-caret" viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="snap-chip-grid">' + SNAP_MODES.map(function (m) {
        return '<button class="snap-chip' + (App.editor && App.editor.snapModes && App.editor.snapModes[m.id] !== false ? ' on' : '') + '" type="button" data-snap-mode="' + m.id + '" title="Snap: ' + m.label + '">' + m.label + '</button>';
      }).join('') + '</div></div>' +
      '<div class="rail-section"><div class="rail-section-title">Vista</div><div class="rail-action-row">' +
      '<button class="rail-action" id="btnFit2d" title="Ajustar a la vista (Shift+F)">' + icon('fit', 15) + '<span>Ajustar</span></button>' +
      '<button class="rail-action" id="zoomIn" title="Acercar"><b>+</b></button>' +
      '<button class="rail-action" id="zoomOut" title="Alejar"><b>−</b></button>' +
      '</div></div>' +
      '<div class="rail-section"><div class="rail-section-title">Vistas</div><div class="rail-view-grid">' + viewButtons + '</div></div>';
    var head = $('.rail-head');
    if (head) {
      var oldSys = head.querySelector('.rail-head-tools');
      if (oldSys) oldSys.remove();
      head.insertAdjacentHTML('beforeend',
        '<div class="rail-head-tools">' +
        '<button id="btnUnitsRail" class="rail-chip" type="button" title="Sistema de unidades (métrico / imperial)"><span>m · m²</span></button>' +
        '<button id="langToggle" class="rail-chip" type="button" title="Idioma / Language"><span class="lang-opt active">ES</span><span class="lang-sep">/</span><span class="lang-opt">EN</span></button>' +
        '<div class="rail-device-row"><span class="rail-select-label">Pantalla</span>' +
        '<select id="deviceModeSelect" class="rail-device-select" title="Modo de pantalla">' +
        DEVICE_MODES.map(function (m) {
          return '<option value="' + m.id + '"' + (App.devicePref === m.id ? ' selected' : '') + '>' + m.label + '</option>';
        }).join('') + '</select></div>' +
        '</div>');
    }
  }

  function bindStatic() {
    $('#btnNew').addEventListener('click', showTemplateModal);
    $('#btnOpen').addEventListener('click', function () { $('#fileInput').click(); });
    $('#btnSave').addEventListener('click', downloadProject);
    $('#btnUndo').addEventListener('click', function () { if (App.store.undo()) { afterHistory('Deshacer'); } });
    $('#btnRedo').addEventListener('click', function () { if (App.store.redo()) { afterHistory('Rehacer'); } });
    $('#btnExportPdf').addEventListener('click', function () { exportPDF(); });
    $('#btnExportDxf').addEventListener('click', showDXFModal);
    $('#btnHelp').addEventListener('click', showHelp);
    $('#btnHelpStatus').addEventListener('click', showHelp);
    if ($('#btnUnitsRail')) $('#btnUnitsRail').addEventListener('click', toggleUnits);
    if ($('#btnRailOpen')) $('#btnRailOpen').addEventListener('click', function () { $('#fileInput').click(); });
    if ($('#btnRailSave')) $('#btnRailSave').addEventListener('click', downloadProject);
    if ($('#btnRailNew')) $('#btnRailNew').addEventListener('click', showTemplateModal);
    if ($('#btnRailUndo')) $('#btnRailUndo').addEventListener('click', function () { if (App.store.undo()) afterHistory('Deshacer'); });
    if ($('#langToggle')) $('#langToggle').addEventListener('click', toggleLanguage);
    if ($('#deviceModeSelect')) $('#deviceModeSelect').addEventListener('change', function (e) {
      applyDeviceMode(e.target.value);
      renderScenePanel();
      var info = null;
      for (var di = 0; di < DEVICE_MODES.length; di++) if (DEVICE_MODES[di].id === e.target.value) info = DEVICE_MODES[di];
      toast('Modo de pantalla: ' + (info ? info.label : e.target.value) + '.', 'info', 2400);
    });
    $('#projectNameBtn').addEventListener('click', showProjectInfo);
    if ($('#btnGridSetup')) $('#btnGridSetup').addEventListener('click', function (e) { e.preventDefault(); showGridDialog(); });
    if ($('#btnFontScale')) $('#btnFontScale').addEventListener('click', function (e) { e.stopPropagation(); toggleFontMenu(); });
    document.addEventListener('click', function (e) {
      if (!App.fontMenuOpen) return;
      if (e.target.closest && (e.target.closest('#fontMenu') || e.target.closest('#btnFontScale'))) return;
      closeFontMenu();
    });
    window.addEventListener('resize', closeFontMenu);
    // Menú lateral y panel de ajustes colapsables.
    if ($('#btnRailToggle')) $('#btnRailToggle').addEventListener('click', toggleRail);
    if ($('#btnInspectorToggle')) $('#btnInspectorToggle').addEventListener('click', toggleInspector);
    if ($('#btnInspectorReopen')) $('#btnInspectorReopen').addEventListener('click', function () { applyInspectorState('open'); });
    // Botones de pantalla móvil: abren el menú lateral o el panel de ajustes como cajones.
    if ($('#btnMobileRail')) $('#btnMobileRail').addEventListener('click', function () {
      applyRailState(App.rail === 'expanded' ? 'compact' : 'expanded');
      if (App.inspector === 'open') applyInspectorState('closed', { silent: true });
      if (App.editor) setTimeout(function () { App.editor._resize(); App.editor.render(); }, 220);
    });
    if ($('#btnMobileInspector')) $('#btnMobileInspector').addEventListener('click', function () {
      applyInspectorState(App.inspector === 'open' ? 'closed' : 'open');
      if (App.rail === 'expanded') applyRailState('compact', { silent: true });
    });
    // Panel Escena (materiales, techo, render y vuelo de dron).
    var scenePanel = $('#panelScene');
    if (scenePanel) {
      scenePanel.addEventListener('change', onSceneChange);
      scenePanel.addEventListener('input', onSceneInput);
      scenePanel.addEventListener('click', onSceneClick);
    }
    var canvas3dEl = $('#canvas3d');
    if (canvas3dEl) canvas3dEl.addEventListener('pointerdown', function () {
      if (App.flight) setFlight(false, { silent: true });
    });
    // Controles rápidos de la vista 3D: techo, modo y acceso a materiales.
    if ($('#roofQuick')) $('#roofQuick').addEventListener('change', function (e) { setRoofQuick(e.target.value); });
    if ($('#modeQuick')) $('#modeQuick').addEventListener('change', function (e) { setRenderMode(e.target.value); });
    if ($('#btnSceneQuick')) $('#btnSceneQuick').addEventListener('click', openSceneMaterials);

    $$('#viewTabs button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
    });
    $$('#inspectorTabs button').forEach(function (b) {
      b.addEventListener('click', function () { setInspectorTab(b.getAttribute('data-tab')); });
    });
    if ($('#btnFit2d')) $('#btnFit2d').addEventListener('click', function () { fitActiveView(); });
    if ($('#zoomIn')) $('#zoomIn').addEventListener('click', function () { zoomActiveView(1.25); });
    if ($('#zoomOut')) $('#zoomOut').addEventListener('click', function () { zoomActiveView(0.8); });
    // Canvas de vistas generadas (alzados y secciones): zoom con rueda y paneo con arrastre.
    var viewsCanvas = $('#viewsCanvas');
    if (viewsCanvas) {
      var vTouches = {};
      var vPinchDist = 0;
      viewsCanvas.addEventListener('wheel', function (e) {
        if (App.viewMode === 'plan') return;
        e.preventDefault();
        zoomActiveView(e.deltaY < 0 ? 1.12 : 0.9);
      }, { passive: false });
      var vDrag = null;
      var vTap = null;
      viewsCanvas.addEventListener('pointerdown', function (e) {
        if (App.viewMode === 'plan') return;
        if (e.pointerType === 'touch') {
          vTouches[e.pointerId] = { x: e.clientX, y: e.clientY };
          var ids = Object.keys(vTouches);
          if (ids.length === 2) {
            var a = vTouches[ids[0]], b = vTouches[ids[1]];
            vPinchDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
            vDrag = null;
            return;
          }
        }
        vDrag = { x: e.clientX, y: e.clientY, panX: App.viewsPan.x, panY: App.viewsPan.y };
        vTap = { x: e.clientX, y: e.clientY, moved: false };
        try { viewsCanvas.setPointerCapture(e.pointerId); } catch (err) { /* tolerar */ }
        viewsCanvas.style.cursor = 'grabbing';
      });
      viewsCanvas.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch' && vTouches[e.pointerId]) {
          vTouches[e.pointerId] = { x: e.clientX, y: e.clientY };
          var ids = Object.keys(vTouches);
          if (ids.length === 2) {
            var a = vTouches[ids[0]], b = vTouches[ids[1]];
            var dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
            if (vPinchDist > 0) {
              var factor = dist / vPinchDist;
              if (factor > 1.02 || factor < 0.98) {
                App.viewsZoom = ED.Geo.clamp((App.viewsZoom || 1) * factor, 0.2, 8);
                vPinchDist = dist;
                renderViews();
              }
            }
            return;
          }
        }
        if (!vDrag) return;
        if (vTap && Math.abs(e.clientX - vTap.x) + Math.abs(e.clientY - vTap.y) > 4) vTap.moved = true;
        App.viewsPan.x = vDrag.panX + (e.clientX - vDrag.x);
        App.viewsPan.y = vDrag.panY + (e.clientY - vDrag.y);
        renderViews();
      });
      var endVDrag = function (e) {
        if (e && e.pointerType === 'touch') {
          delete vTouches[e.pointerId];
          if (Object.keys(vTouches).length < 2) vPinchDist = 0;
        }
        if (vTap && !vTap.moved && App.viewMode !== 'plan') {
          var src = viewsHitTest(vTap.x, vTap.y);
          if (src) selectViewsPrimitive(src);
          else { App.viewSelection = null; App.store.setSelection([]); renderViews(); }
        }
        vTap = null;
        vDrag = null;
        viewsCanvas.style.cursor = App.viewMode === 'plan' ? 'grab' : 'crosshair';
      };
      viewsCanvas.addEventListener('pointerup', endVDrag);
      viewsCanvas.addEventListener('pointercancel', endVDrag);
      viewsCanvas.addEventListener('pointerleave', function (e) { if (vDrag) endVDrag(e); });
      viewsCanvas.addEventListener('dblclick', function () {
        if (App.viewMode === 'plan') return;
        zoomActiveView(App.viewsZoom > 1.3 ? 0.5 : 1.6);
      });
      viewsCanvas.style.cursor = 'grab';
    }
    $('#fileInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) openFile(e.target.files[0]);
      e.target.value = '';
    });

    $('#toolrail').addEventListener('click', function (e) {
      var sc = e.target.closest('[data-snap-mode]');
      if (sc) {
        var modeId = sc.getAttribute('data-snap-mode');
        var patch = {};
        patch[modeId] = !(App.editor && App.editor.snapModes && App.editor.snapModes[modeId] !== false);
        if (App.editor && App.editor.setSnapModes) App.editor.setSnapModes(patch);
        syncSnapChips();
        return;
      }
      var vm = e.target.closest('[data-view-mode]');
      if (vm) { setViewMode(vm.getAttribute('data-view-mode')); return; }
      var toggleBtn = e.target.closest('[data-toggle]');
      if (toggleBtn) { toggleSnap(toggleBtn.getAttribute('data-toggle')); return; }
      var btn = e.target.closest('[data-tool]');
      if (!btn) return;
      var tool = btn.getAttribute('data-tool');
      if (tool === 'fit') { fitActiveView(); return; }
      chooseTool(tool);
    });
    $('#levelTabs').addEventListener('click', function (e) {
      var add = e.target.closest('[data-level-add]');
      if (add) { showLevelModal(); return; }
      var rem = e.target.closest('[data-level-remove]');
      if (rem) { confirmDeleteLevel(); return; }
      var tab = e.target.closest('[data-level]');
      if (tab) {
        App.store.setActiveLevel(tab.getAttribute('data-level'));
        App.editor.render();
        refreshProps();
        updateZoomStatus();
      }
    });
    $('#stageActions').addEventListener('click', onStageAction);
    $('#stageActions').addEventListener('input', onStageInput);
    $('#sheetGallery').addEventListener('click', function (e) {
      var add = e.target.closest('[data-add-sheet]');
      if (add) { addSheet(); return; }
      var card = e.target.closest('[data-sheet-id]');
      if (card) {
        App.selectedSheetId = card.getAttribute('data-sheet-id');
        markSelectedSheet();
        refreshProps();
      }
    });
    $('#panelProps').addEventListener('change', onPropChange);
    $('#panelProps').addEventListener('click', onPropClick);
    $('#panelLayers').addEventListener('click', onLayerClick);
    $('#panelLibrary').addEventListener('input', function (e) {
      if (e.target.id === 'libSearch') {
        App.libQuery = e.target.value || '';
        renderLibraryGrid();
      }
    });
    $('#panelLibrary').addEventListener('click', function (e) {
      if (e.target.closest('[data-lib-action="import"]')) { showImportModal(); return; }
      var chip = e.target.closest('[data-cat]');
      if (chip) {
        App.libCat = chip.getAttribute('data-cat');
        $$('.cat-chip', $('#panelLibrary')).forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-cat') === App.libCat); });
        renderLibraryGrid();
        return;
      }
      var card = e.target.closest('[data-lib-id]');
      if (card) selectLibraryItem(card.getAttribute('data-lib-id'));
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('dragenter', function (e) {
      if (e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) {
        e.preventDefault();
        App._dropDepth++;
        $('#dropOverlay').classList.add('show');
      }
    });
    document.addEventListener('dragleave', function () {
      App._dropDepth = Math.max(0, App._dropDepth - 1);
      if (!App._dropDepth) $('#dropOverlay').classList.remove('show');
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      App._dropDepth = 0;
      $('#dropOverlay').classList.remove('show');
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) openFile(file);
    });
    window.addEventListener('beforeunload', function () { App.store.saveLocal(); });
    var resizeTimer = null;
    function onViewportResize() {
      if (App.editor) {
        try { App.editor._resize(); App.editor.render(); } catch (e) { /* tolerar */ }
      }
      if (App.viewMode !== 'plan') renderViews();
    }
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (App.devicePref === 'auto') applyDeviceMode('auto');
        if (App.view === 'sheets') scheduleSheetPreviews(80);
        if (App.view === '2d' && App.viewMode !== 'plan') renderViews();
      }, 180);
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        if (App.devicePref === 'auto') applyDeviceMode('auto');
        onViewportResize();
      }, 260);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        clearTimeout(App.vvTimer);
        App.vvTimer = setTimeout(onViewportResize, 160);
      });
    }
    if (window.ResizeObserver && $('#view2d')) {
      var ro = new ResizeObserver(function () {
        if (App.view === '2d' && App.viewMode !== 'plan') {
          clearTimeout(App.roTimer);
          App.roTimer = setTimeout(renderViews, 80);
        }
      });
      ro.observe($('#view2d'));
    }
    // En móvil, tocar el lienzo cierra los cajones abiertos (menú o ajustes).
    var stageEl = $('.stage');
    if (stageEl) stageEl.addEventListener('pointerdown', function (e) {
      if (App.device !== 'mobile') return;
      if (e.target && e.target.closest && e.target.closest('#btnMobileRail, #btnMobileInspector')) return;
      if (App.rail === 'expanded') applyRailState('compact', { silent: true });
      if (App.inspector === 'open') applyInspectorState('closed', { silent: true });
    }, true);
  }

  function initEditor() {
    App.editor = new ED.Editor2D($('#planCanvas'), App.store, {
      onCursor: function (p) {
        App.lastCursor = { x: p.x, y: p.y };
        $('#statusCoords').textContent = 'X: ' + unitLen(p.x) + '   Y: ' + unitLen(p.y);
      },
      onStatus: function (text) {
        if (!text) return;
        $('#statusTool').textContent = text;
        if (/actualizado|terminado|eliminado/i.test(text)) refreshProps();
      },
      onSelectionChange: function (selection) {
        refreshProps();
        if (selection && selection.length) {
          if (App.tab === 'layers' || App.tab === 'library') setInspectorTab('props');
        }
      },
      onRequestText: function (point) { showTextModal(point); },
      onPlaced: function (kind, obj) {
        if (kind === 'room') {
          setInspectorTab('props');
          toast('Ambiente creado. Edita su nombre y acabado en Propiedades.', 'success', 3200);
        } else if (kind === 'item') {
          $('#statusTool').textContent = 'Mueble colocado · sigue haciendo clic o pulsa Esc';
        } else if (kind === 'wall') {
          if (App.activeTool === 'wallArc' || App.activeTool === 'wallSpline') {
            $('#statusTool').textContent = (App.activeTool === 'wallArc' ? 'Muro en arco creado' : 'Muro spline creado') +
              ' · ajusta la curvatura en Propiedades o pulsa Esc';
          } else {
            $('#statusTool').textContent = 'Muro creado · clic para el siguiente tramo · Esc para terminar';
          }
        }
        refreshProps();
        refreshLayers();
      },
      onError: function (msg) { toast(msg, 'warn', 3600); }
    });
    App.editor.setSnap({ grid: true, snapping: true, ortho: false });
    applyGridToEditor();
    App.editor.setTool('select');
    syncCanvasToggles();
  }

  function initStoreEvents() {
    App.store.on(function (evt) {
      if (evt.type === 'change') {
        refreshHeader();
        refreshUndo();
        setSaveState('saving');
        updateZoomStatus();
        // Mantiene la rejilla del editor sincronizada con el proyecto
        // (deshacer, rehacer, abrir archivo o editar datos del proyecto).
        applyGridToEditor();
        applyScene3D();
        sync3DQuickControls();
        registerProjectAssets(App.store.project);
        if (App.tab === 'scene' && !isInspectorInputFocused()) renderScenePanel();
        if (App.view === '3d') schedule3D();
        if (App.view === 'sheets') scheduleSheetPreviews();
        if (App.view === '2d' && App.viewMode !== 'plan') renderViews();
        if (!isInspectorInputFocused() && !(App.editor && App.editor.drag)) {
          refreshProps();
          if (App.tab === 'layers') refreshLayers();
        }
        App.editor.requestRender();
      } else if (evt.type === 'selection') {
        refreshProps();
      } else if (evt.type === 'level') {
        refreshLevelTabs();
        updateZoomStatus();
        App.editor.render();
        if (App.view === '2d' && App.viewMode !== 'plan') renderViews();
        refreshProps();
        if (App.view === '3d') schedule3D();
      } else if (evt.type === 'saved') {
        setSaveState('saved');
      }
    });
  }

  function isInspectorInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    if (!el.closest || !el.closest('.inspector-body')) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
  }

  function afterHistory(label) {
    setSaveState('saving');
    refreshUndo();
    refreshHeader();
    refreshLevelTabs();
    refreshProps();
    refreshLayers();
    App.editor.render();
    if (App.view === '3d') schedule3D();
    if (App.view === 'sheets') scheduleSheetPreviews(120);
    if (App.view === '2d' && App.viewMode !== 'plan') renderViews();
    $('#statusTool').textContent = label || 'Historial actualizado';
  }

  function refreshUndo() {
    var u = $('#btnUndo'), r = $('#btnRedo');
    if (!App.store) return;
    var canUndo = App.store.canUndo();
    var canRedo = App.store.canRedo();
    var label = App.store.undoLabel ? App.store.undoLabel() : '';
    if (u) { u.disabled = !canUndo; u.title = canUndo ? 'Deshacer' + (label ? ': ' + label : '') + ' (Ctrl+Z)' : 'Deshacer (Ctrl+Z)'; }
    if (r) { r.disabled = !canRedo; r.title = 'Rehacer (Ctrl+Y)'; }
    var su = $('[data-stage-action="undo"]');
    var sr = $('[data-stage-action="redo"]');
    if (su) { su.disabled = !canUndo; su.title = u ? u.title : 'Deshacer (Ctrl+Z)'; }
    if (sr) { sr.disabled = !canRedo; sr.title = 'Rehacer (Ctrl+Y)'; }
  }

  function refreshHeader() {
    var p = App.store.project;
    $('#projectName').textContent = (p.meta && p.meta.name) || 'Proyecto sin nombre';
    document.title = ((p.meta && p.meta.name) || 'EngDraft') + ' — EngDraft';
    var lvl = App.store.activeLevelObj();
    $('#statusLevel').textContent = lvl ? lvl.name : 'Nivel';
    updateUnitsUI();
    localize();
  }

  function updateUnitsUI() {
    var btn = $('#btnUnitsRail') || $('#btnUnits');
    if (btn) {
      var span = btn.querySelector('span');
      if (span) span.textContent = unitsBadge();
      else btn.textContent = unitsBadge();
      btn.title = unitSys() === 'ft'
        ? 'Sistema imperial (ft/in). Clic para volver al sistema métrico.'
        : 'Sistema métrico (m/mm). Clic para cambiar al sistema imperial.';
    }
    var coords = $('#statusCoords');
    if (coords && App.lastCursor) {
      coords.textContent = 'X: ' + unitLen(App.lastCursor.x) + '   Y: ' + unitLen(App.lastCursor.y);
    }
    updateGridChips();
  }

  function toggleUnits() {
    var s = App.store.project.settings;
    var next = ED.Geo.normalizeUnit(s.units) === 'ft' ? 'm' : 'ft';
    App.store.act('Cambiar sistema de unidades', function () { s.units = next; });
    updateUnitsUI();
    refreshProps();
    App.editor.render();
    if (App.viewMode !== 'plan') renderViews();
    if (App.view === '3d') schedule3D();
    if (App.view === 'sheets') scheduleSheetPreviews(120);
    toast(next === 'ft' ? 'Sistema imperial activado (pies/pulgadas).' : 'Sistema métrico activado (metros).', 'success', 2800);
  }

  function refreshLevelTabs() {
    var wrap = $('#levelTabs');
    var active = App.store.activeLevel;
    wrap.innerHTML = App.store.levels().map(function (l) {
      return '<button class="level-tab' + (l.id === active ? ' active' : '') + '" data-level="' + esc(l.id) + '">' +
        '<span class="lvl-dot"></span>' + esc(l.name) + '</button>';
    }).join('') + '<button class="level-add" data-level-add title="Añadir planta">+</button>' +
      '<button class="level-add" data-level-remove title="Eliminar la planta activa" aria-label="Eliminar la planta activa">−</button>';
  }

  function setSaveState(mode, text) {
    var el = $('#saveState');
    if (!el) return;
    el.classList.remove('saving', 'error');
    if (mode === 'saving') {
      el.classList.add('saving');
      el.querySelector('span').textContent = 'Guardando…';
      clearTimeout(App.saveFallbackTimer);
      App.saveFallbackTimer = setTimeout(function () {
        if (el.classList.contains('saving')) {
          el.classList.remove('saving');
          el.classList.add('error');
          el.querySelector('span').textContent = 'Sin autoguardado';
        }
      }, 2200);
    } else if (mode === 'error') {
      el.classList.add('error');
      el.querySelector('span').textContent = text || 'Sin autoguardado';
    } else {
      el.querySelector('span').textContent = text || 'Guardado';
      clearTimeout(App.saveFallbackTimer);
    }
  }

  function updateZoomStatus() {
    var el = $('#statusZoom');
    if (!el) return;
    if (App.viewMode !== 'plan') {
      el.textContent = 'Zoom ' + Math.round((App.viewsZoom || 1) * 100) + '%';
      return;
    }
    if (!App.editor) return;
    var z = App.editor.view.zoom;
    el.textContent = 'Zoom ' + Math.round(z * 1000) + '%';
  }

  function syncCanvasToggles() {
    if (!App.editor) return;
    $$('#toolList [data-toggle]').forEach(function (b) {
      var k = b.getAttribute('data-toggle');
      b.classList.toggle('on', !!App.editor.snap[k]);
    });
    updateGridChips();
  }

  function toggleSnap(key) {
    var snap = {};
    snap[key] = !App.editor.snap[key];
    App.editor.setSnap(snap);
    syncCanvasToggles();
    var label = key === 'grid' ? 'Rejilla' : key === 'snapping' ? 'Punto de referencia' : 'Ángulo ortogonal';
    $('#statusTool').textContent = label + (snap[key] ? ' activado' : ' desactivado');
  }

  // ================================================================== herramientas
  function chooseTool(tool) {
    if (tool === 'scale' && (!App.store.selection || !App.store.selection.length)) {
      toast('Selecciona primero uno o varios objetos para escalar.', 'info', 2800);
      return;
    }
    if (tool === 'furniture') {
      if (!App.store.isVisible('furniture')) { toast('La capa Mobiliario está oculta.', 'warn'); return; }
      if (!App.lastFurnitureId) App.lastFurnitureId = 'sofa3';
      if (!ED.Library || !ED.Library.get(App.lastFurnitureId)) { toast('Biblioteca de mobiliario no disponible.', 'error'); return; }
      setView('2d');
      App.activeTool = 'furniture';
      App.editor.setFurniture(App.lastFurnitureId);
      setInspectorTab('library');
      updateToolRailActive();
      $('#statusTool').textContent = 'Mueble: ' + ED.Library.get(App.lastFurnitureId).name + ' · clic para colocar · R para rotar';
      return;
    }
    setView('2d');
    App.activeTool = tool;
    App.editor.setTool(tool);
    updateToolRailActive();
    $('#statusTool').textContent = App.editor.statusText();
    if (tool === 'room') toast('Haz clic dentro de un recinto cerrado por muros.', 'info', 2600);
  }

  function syncSnapChips() {
    if (!App.editor) return;
    $$('#toolList [data-snap-mode]').forEach(function (b) {
      var id = b.getAttribute('data-snap-mode');
      b.classList.toggle('on', !(App.editor.snapModes && App.editor.snapModes[id] === false));
    });
  }

  function updateToolRailActive() {
    $$('#toolrail [data-tool]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tool') === App.activeTool);
    });
  }

  function selectLibraryItem(id) {
    var def = ED.Library && ED.Library.get ? ED.Library.get(id) : null;
    if (!def) return;
    App.lastFurnitureId = id;
    App.activeTool = 'furniture';
    setView('2d');
    App.editor.setFurniture(id);
    updateToolRailActive();
    $$('#panelLibrary .lib-card').forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-lib-id') === id); });
    $('#statusTool').textContent = def.name + ' · haz clic en el plano para colocar · R para rotar';
    toast(def.name + ' listo para colocar.', 'info', 1800);
  }

  // ============================================================ escena 3D
  var ROOF_STYLES = { flat: 'Plano', gable: 'A dos aguas', hip: 'Cuatro aguas (poliforme)', arc: 'Arco', spline: 'Spline', custom: 'Mi diseño' };
  var ROOF_RIDGES = { auto: 1, x: 1, y: 1 };
  var ROOF_STRUCTURES = { none: 'Sin vigas', steel: 'Acero', concrete: 'Hormigón', wood: 'Madera' };
  var OPENING_SUBTYPES = {
    door: [['single', 'Hoja simple'], ['double', 'Doble hoja'], ['sliding', 'Corrediza']],
    window: [['fixed', 'Fija'], ['sliding', 'Corrediza'], ['double', 'Doble hoja'], ['awning', 'Proyectante']],
    garage: [['sectional', 'Seccional'], ['sliding', 'Corrediza']],
    pass: []
  };
  var OPENING_SUBTYPE_DEFAULT = { door: 'single', window: 'fixed', garage: 'sectional', pass: '' };

  var MATERIAL_LABELS = { wall: 'Paredes', roof: 'Techo', ground: 'Suelo' };
  var SCENE_TEXTURES = {
    wall: [['stucco', 'Estuco'], ['brick', 'Ladrillo'], ['wood', 'Madera'], ['stone', 'Piedra'], ['smooth', 'Liso']],
    roof: [['tile', 'Teja'], ['shingle', 'Tejuela'], ['metal', 'Metal'], ['wood', 'Madera'], ['concrete', 'Concreto'], ['smooth', 'Liso']],
    ground: [['grass', 'Césped'], ['paving', 'Adoquín'], ['gravel', 'Grava'], ['smooth', 'Liso']]
  };

  function sceneSettings() {
    var s = (App.store && App.store.project.settings) || {};
    var roof = s.roof || {};
    var mats = s.materials || {};
    var r = s.render || {};
    return {
      roofStyle: ROOF_STYLES[roof.style] ? roof.style : 'flat',
      ridge: ROOF_RIDGES[roof.ridge] ? roof.ridge : 'auto',
      roofHeight: n(roof.height, 1200),
      roofOverhang: n(roof.overhang, 400),
      roofStructure: roof.structure || { material: 'none', spacing: 800, depth: 200, width: 120 },
      roofProfile: Array.isArray(roof.profile) ? roof.profile : null,
      materials: {
        wall: { color: (mats.wall && mats.wall.color) || '#f3eee2', texture: (mats.wall && mats.wall.texture) || 'stucco' },
        roof: { color: (mats.roof && mats.roof.color) || '#b49a7c', texture: (mats.roof && mats.roof.texture) || 'tile' },
        trim: { color: (mats.trim && mats.trim.color) || '#fdfaf2' },
        ground: { color: (mats.ground && mats.ground.color) || '#c9d3ab', texture: (mats.ground && mats.ground.texture) || 'grass' }
      },
      render: {
        mode: r.mode === 'realistic' ? 'realistic' : 'schematic',
        shadows: r.shadows !== false,
        textures: r.textures !== false,
        sunAngle: n(r.sunAngle, 135)
      }
    };
  }

  function applyScene3D() {
    if (!App.view3d) return;
    var sc = sceneSettings();
    var opts = {
      roof: !!App.options3d.roof,
      roofStyle: sc.roofStyle,
      roofRidge: sc.ridge,
      roofProfile: sc.roofProfile,
      roofStructure: sc.roofStructure,
      roofHeight: sc.roofHeight,
      roofOverhang: sc.roofOverhang,
      roofColor: sc.materials.roof.color,
      roofTexture: sc.materials.roof.texture,
      renderMode: sc.render.mode,
      materials: sc.materials,
      shadows: sc.render.shadows,
      textures: sc.render.textures,
      sunAngle: sc.render.sunAngle,
      furniture: App.options3d.furniture,
      labels: App.options3d.labels,
      ground: App.options3d.ground,
      levels: App.options3d.levels,
      dimensions: App.options3d.dimensions
    };
    // Ajustes de verificación por URL (no modifican el proyecto guardado).
    if (App.url3d) {
      if (App.url3d.render === 'realistic' || App.url3d.render === 'schematic') opts.renderMode = App.url3d.render;
      if (ROOF_STYLES[App.url3d.roof]) { opts.roofStyle = App.url3d.roof; opts.roof = true; }
    }
    try { App.view3d.setOptions(opts); } catch (e) { console.error(e); }
  }

  function syncFlightUI() {
    var badge = $('#view3dFlight');
    if (badge) badge.hidden = !App.flight;
    var hint = $('#view3dHint');
    if (hint) {
      hint.textContent = App.flight
        ? 'Vuelo de dron en curso · clic en la vista para detenerlo'
        : 'Arrastra para orbitar · clic derecho o dos dedos para desplazar · rueda para acercar';
    }
    updateStageActions();
    if (App.tab === 'scene') renderScenePanel();
  }

  function startFlightNow() {
    if (!App.view3d || typeof App.view3d.startFlight !== 'function') return;
    try { App.view3d.startFlight({ duration: 14000 }); } catch (e) { console.error(e); }
  }

  function setFlight(on, opts) {
    opts = opts || {};
    var want = !!on;
    if (want && App.view !== '3d') {
      App.flight = true;
      syncFlightUI();
      setView('3d');
      setTimeout(function () { if (App.flight) startFlightNow(); }, 800);
      if (!opts.silent) toast('Vuelo de dron iniciado.', 'info', 2200);
      return;
    }
    App.flight = want;
    if (want) {
      ensure3D(false);
      startFlightNow();
    } else if (App.view3d && typeof App.view3d.stopFlight === 'function') {
      try { App.view3d.stopFlight(); } catch (e) { console.error(e); }
    }
    syncFlightUI();
    if (!opts.silent) toast(want ? 'Vuelo de dron iniciado.' : 'Vuelo de dron detenido.', 'info', 2200);
  }

  function toggleRealistic() {
    var mode = sceneSettings().render.mode === 'realistic' ? 'schematic' : 'realistic';
    App.store.act('Modo de renderizado', function () { App.store.project.settings.render.mode = mode; });
    applyScene3D();
    schedule3D();
    renderScenePanel();
    updateStageActions();
    sync3DQuickControls();
    toast(mode === 'realistic' ? 'Modo realista: texturas, luz solar y sombras.' : 'Modo esquemático activado.', 'info', 2600);
  }

  function resetSceneSettings() {
    App.store.act('Restablecer escena', function () {
      var s = App.store.project.settings;
      s.roof = { style: 'flat', height: 1200, overhang: 400 };
      s.materials = {
        wall: { color: '#f3eee2', texture: 'stucco' },
        roof: { color: '#b49a7c', texture: 'tile' },
        trim: { color: '#fdfaf2' },
        ground: { color: '#c9d3ab', texture: 'grass' }
      };
      s.render = { mode: 'schematic', shadows: true, textures: true, sunAngle: 135 };
    });
    App.options3d.roof = false;
    applyScene3D();
    schedule3D();
    renderScenePanel();
    updateStageActions();
    toast('Escena restablecida (materiales, techo y render).', 'success', 2400);
  }

  // Controles rápidos de la vista 3D (techo y modo de renderizado).
  function sync3DQuickControls() {
    if (!App.store) return;
    var sc = sceneSettings();
    var roofSel = $('#roofQuick');
    if (roofSel) roofSel.value = App.options3d.roof ? sc.roofStyle : 'off';
    var modeSel = $('#modeQuick');
    if (modeSel) modeSel.value = sc.render.mode;
    var btn = $('#btnSceneQuick');
    if (btn) btn.title = 'Abrir colores, texturas y materiales de la escena';
  }

  function setRoofQuick(value) {
    if (!App.store) return;
    var style = ROOF_STYLES[value] ? value : null;
    if (!style) {
      apply3DOptions({ roof: false });
      toast('Techo oculto. Elige un estilo para mostrarlo.', 'info', 2800);
      sync3DQuickControls();
      return;
    }
    if (style === 'custom') {
      openRoofDesigner();
      sync3DQuickControls();
      return;
    }
    App.options3d.roof = true;
    App.store.act('Tipo de techo', function () {
      App.store.project.settings.roof.style = style;
    });
    applyScene3D();
    schedule3D();
    updateStageActions();
    renderScenePanel();
    sync3DQuickControls();
    toast('Techo: ' + ROOF_STYLES[style] + '.', 'success', 2200);
  }

  function setRenderMode(mode) {
    if (!App.store) return;
    var next = mode === 'realistic' ? 'realistic' : 'schematic';
    App.store.act('Modo de renderizado', function () {
      App.store.project.settings.render.mode = next;
    });
    applyScene3D();
    schedule3D();
    updateStageActions();
    renderScenePanel();
    sync3DQuickControls();
    toast(next === 'realistic' ? 'Modo realista: texturas, luz solar y sombras.' : 'Modo esquemático activado.', 'info', 2400);
  }

  function openSceneMaterials() {
    applyInspectorState('open');
    setInspectorTab('scene');
    setTimeout(function () {
      var block = $('#sceneMaterials');
      if (block && block.scrollIntoView) block.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 140);
    toast('Elige el color y la textura de paredes, techo y suelo.', 'info', 2600);
  }

  function textureOptions(key, selected) {
    return (SCENE_TEXTURES[key] || []).map(function (pair) {
      return '<option value="' + pair[0] + '"' + (pair[1] === selected || pair[0] === selected ? ' selected' : '') + '>' + pair[1] + '</option>';
    }).join('');
  }

  function renderScenePanel() {
    var panel = $('#panelScene');
    if (!panel || !App.store) return;
    var sc = sceneSettings();
    var modeLabel = sc.render.mode === 'realistic' ? 'Realista' : 'Esquemático';
    var html = '<div class="entity-head"><div class="entity-icon">' + icon('palette', 17) + '</div><div><h3>Escena 3D</h3>' +
      '<p>Materiales, techo y vuelo de dron</p></div></div>';

    html += '<div class="scene-group"><div class="section-title">Renderizado <span class="render-badge">' + modeLabel + '</span></div>' +
      '<div class="segmented" id="renderModeSeg">' +
      '<button type="button" data-render-mode="schematic" class="' + (sc.render.mode === 'schematic' ? 'active' : '') + '">Esquemático</button>' +
      '<button type="button" data-render-mode="realistic" class="' + (sc.render.mode === 'realistic' ? 'active' : '') + '">Realista</button></div>' +
      '<div class="field-hint">El modo realista añade texturas, luz solar y sombras en la vista 3D.</div>' +
      '<label class="check-row"><input type="checkbox" data-scene-field="shadows"' + (sc.render.shadows ? ' checked' : '') + '><span>Sombras suaves</span></label>' +
      '<label class="check-row"><input type="checkbox" data-scene-field="textures"' + (sc.render.textures ? ' checked' : '') + '><span>Texturas procedurales</span></label>' +
      '<div class="field"><label>Ángulo del sol: <span id="sunAngleVal">' + Math.round(sc.render.sunAngle) + '°</span></label>' +
      '<input type="range" min="0" max="360" step="5" data-scene-field="sunAngle" value="' + Math.round(sc.render.sunAngle) + '"></div></div>';

    html += '<div class="scene-group"><div class="section-title">Techo</div>' +
      '<label class="check-row"><input type="checkbox" data-scene-field="roofOn"' + (App.options3d.roof ? ' checked' : '') + '><span>Mostrar techo en la vista 3D</span></label>' +
      '<div class="field"><label>Tipo de techo</label><select class="select" data-scene-field="roofStyle">' +
      Object.keys(ROOF_STYLES).map(function (k) {
        return '<option value="' + k + '"' + (sc.roofStyle === k ? ' selected' : '') + '>' + ROOF_STYLES[k] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="scene-actions"><button class="btn btn-ghost btn-sm" data-scene-action="roofDesign">' + icon('palette', 14) + ' Diseñar techo</button></div>' +
      '<div class="field"><label>Orientación de cumbrera</label><select class="select" data-scene-field="roofRidge">' +
      [['auto', 'Automática (eje largo)'], ['x', 'Horizontal (X)'], ['y', 'Vertical (Y)']].map(function (pair) {
        return '<option value="' + pair[0] + '"' + (sceneSettings().ridge === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field-grid">' +
      field('Altura / flecha', '<div class="input-row"><input class="input" type="number" min="0.2" step="0.1" data-scene-field="roofHeight" value="' + unitLenInput(sc.roofHeight) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      field('Alero', '<div class="input-row"><input class="input" type="number" min="0" step="0.1" data-scene-field="roofOverhang" value="' + unitLenInput(sc.roofOverhang) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      '</div><div class="field-hint">Al elegir un estilo se muestra el techo automáticamente. También puedes cambiarlo con el selector <strong>Techo</strong> de la vista 3D.</div></div>' +
      '<div class="scene-group"><div class="section-title">Estructura interior del techo</div>' +
      '<div class="field"><label>Vigas</label><select class="select" data-scene-field="roofStructureMaterial">' +
      Object.keys(ROOF_STRUCTURES).map(function (k) {
        return '<option value="' + k + '"' + (sc.roofStructure.material === k ? ' selected' : '') + '>' + ROOF_STRUCTURES[k] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field-grid">' +
      field('Separación', '<div class="input-row"><input class="input" type="number" min="0.3" step="0.05" data-scene-field="roofStructureSpacing" value="' + unitLenInput(sc.roofStructure.spacing) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      field('Canto', '<div class="input-row"><input class="input" type="number" min="0.08" step="0.02" data-scene-field="roofStructureDepth" value="' + unitLenInput(sc.roofStructure.depth) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      '</div>' +
      '<div class="field"><label>Ancho de viga</label><div class="input-row"><input class="input" type="number" min="0.06" step="0.01" data-scene-field="roofStructureWidth" value="' + unitLenInput(sc.roofStructure.width) + '"><span class="input-unit">' + unitLenLabel() + '</span></div></div>' +
      '<div class="field-hint">Vigas vistas desde el interior en la vista 3D y en las secciones. Material: acero, hormigón o madera. Para verlas desde arriba, oculta la cubierta con «Mostrar techo».</</div></div>';

    html += '<div class="scene-group" id="sceneMaterials"><div class="section-title">Materiales</div>' +
      '<div class="field-hint">Colores y texturas de paredes, techo y suelo. También puedes abrirlos con el botón “Colores y texturas” de la vista 3D.</div>' +
      ['wall', 'roof', 'ground'].map(function (key) {
        var mat = sc.materials[key];
        return '<div class="material-row"><span>' + MATERIAL_LABELS[key] + '</span>' +
          '<input type="color" data-scene-color="' + key + '" value="' + esc(mat.color) + '" title="Color de ' + MATERIAL_LABELS[key].toLowerCase() + '">' +
          '<select class="select" data-scene-tex="' + key + '">' + textureOptions(key, mat.texture) + '</select></div>';
      }).join('') +
      '<div class="material-row"><span>Marcos</span><input type="color" data-scene-color="trim" value="' + esc(sc.materials.trim.color) + '" title="Color de marcos">' +
      '<span class="scene-note">Color de puertas y ventanas</span></div></div>';

    html += '<div class="scene-group"><div class="section-title">Contenido</div>' +
      '<label class="check-row"><input type="checkbox" data-scene-field="furniture"' + (App.options3d.furniture ? ' checked' : '') + '><span>Muebles, plantas y vías</span></label>' +
      '<label class="check-row"><input type="checkbox" data-scene-field="labels"' + (App.options3d.labels ? ' checked' : '') + '><span>Etiquetas de ambientes</span></label>' +
      '<label class="check-row"><input type="checkbox" data-scene-field="ground"' + (App.options3d.ground ? ' checked' : '') + '><span>Terreno y rejilla</span></label>' +
      '<div class="field"><label>Niveles visibles</label><select class="select" data-scene-field="levels">' +
      '<option value="all"' + (App.options3d.levels !== 'active' ? ' selected' : '') + '>Ambos niveles</option>' +
      '<option value="active"' + (App.options3d.levels === 'active' ? ' selected' : '') + '>Solo el nivel activo</option></select></div></div>';

    html += '<div class="scene-group"><div class="section-title">Vuelo de dron</div>' +
      '<div class="scene-actions">' +
      '<button class="btn btn-ghost btn-sm" data-scene-action="flight">' + icon('drone', 14) + (App.flight ? ' Detener vuelo' : ' Iniciar vuelo') + '</button>' +
      '<button class="btn btn-ghost btn-sm" data-scene-action="fit3d">' + icon('fit', 14) + ' Encuadrar</button>' +
      '<button class="btn btn-ghost btn-sm" data-scene-action="capture">' + icon('camera', 14) + ' Captura a lámina</button>' +
      '<button class="btn btn-ghost btn-sm" data-scene-action="resetScene">' + icon('info', 14) + ' Restablecer escena</button>' +
      '</div><div class="scene-note">La cámara recorre la maqueta en bucle. Un clic sobre la vista 3D detiene el vuelo.</div></div>';

    panel.innerHTML = html;
    localize();
  }

  function onSceneChange(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var fieldName = t.getAttribute('data-scene-field');
    var colorKey = t.getAttribute('data-scene-color');
    var texKey = t.getAttribute('data-scene-tex');
    if (!fieldName && !colorKey && !texKey) return;

    if (colorKey) {
      App.store.act('Color de ' + (MATERIAL_LABELS[colorKey] || colorKey).toLowerCase(), function () {
        var s = App.store.project.settings;
        if (!s.materials[colorKey]) s.materials[colorKey] = {};
        s.materials[colorKey].color = t.value;
      });
      applyScene3D(); schedule3D();
      return;
    }
    if (texKey) {
      App.store.act('Textura de ' + (MATERIAL_LABELS[texKey] || texKey).toLowerCase(), function () {
        var s = App.store.project.settings;
        if (!s.materials[texKey]) s.materials[texKey] = {};
        s.materials[texKey].texture = t.value;
      });
      applyScene3D(); schedule3D();
      return;
    }
    if (fieldName === 'roofStyle') {
      if (t.value === 'custom') {
        openRoofDesigner();
        renderScenePanel();
        return;
      }
      App.store.act('Tipo de techo', function () {
        App.store.project.settings.roof.style = ROOF_STYLES[t.value] ? t.value : 'flat';
      });
      App.options3d.roof = true;
      applyScene3D(); schedule3D(); updateStageActions(); renderScenePanel();
      return;
    }
    if (fieldName === 'roofStructureMaterial') {
      App.store.act('Estructura del techo', function () {
        var st = App.store.project.settings.roof.structure || {};
        st.material = ROOF_STRUCTURES[t.value] ? t.value : 'none';
        App.store.project.settings.roof.structure = st;
      });
      applyScene3D(); schedule3D(); renderScenePanel();
      return;
    }
    if (fieldName === 'roofRidge') {
      App.store.act('Orientación del techo', function () {
        App.store.project.settings.roof.ridge = ROOF_RIDGES[t.value] ? t.value : 'auto';
      });
      applyScene3D(); schedule3D();
      return;
    }
    if (fieldName === 'roofOn') {
      apply3DOptions({ roof: !!t.checked });
      renderScenePanel();
      return;
    }
    if (fieldName === 'furniture' || fieldName === 'labels' || fieldName === 'ground') {
      var patchOpts = {};
      patchOpts[fieldName] = !!t.checked;
      apply3DOptions(patchOpts);
      renderScenePanel();
      return;
    }
    if (fieldName === 'levels') {
      App.options3d.levels = t.value === 'active' ? 'active' : 'all';
      if (App.view3d && App.view3d.setLevelFilter) {
        try { App.view3d.setLevelFilter(App.options3d.levels); } catch (e) { console.error(e); }
      }
      if (App.view3d && App.view3d.render) { try { App.view3d.render(); } catch (e2) { console.error(e2); } }
      renderScenePanel();
      return;
    }
    if (fieldName === 'shadows' || fieldName === 'textures') {
      App.store.act('Ajuste de renderizado', function () {
        App.store.project.settings.render[fieldName] = !!t.checked;
      });
      applyScene3D(); schedule3D(); renderScenePanel();
      return;
    }
    if (fieldName === 'roofStructureSpacing' || fieldName === 'roofStructureDepth' || fieldName === 'roofStructureWidth') {
      var smm = parseLenInput(t.value);
      if (!isFinite(smm)) return;
      App.store.act('Editar estructura del techo', function () {
        var st = App.store.project.settings.roof.structure || {};
        if (fieldName === 'roofStructureSpacing') st.spacing = ED.Geo.clamp(smm, 300, 3000);
        if (fieldName === 'roofStructureDepth') st.depth = ED.Geo.clamp(smm, 80, 600);
        if (fieldName === 'roofStructureWidth') st.width = ED.Geo.clamp(smm, 60, 400);
        App.store.project.settings.roof.structure = st;
      });
      applyScene3D(); schedule3D();
      return;
    }
    if (fieldName === 'roofHeight' || fieldName === 'roofOverhang') {
      var mm = parseLenInput(t.value);
      if (!isFinite(mm)) return;
      var isH = fieldName === 'roofHeight';
      App.store.act('Editar techo', function () {
        App.store.project.settings.roof[isH ? 'height' : 'overhang'] = ED.Geo.clamp(mm, isH ? 200 : 0, isH ? 8000 : 2500);
      });
      applyScene3D(); schedule3D();
    }
  }

  function onSceneInput(e) {
    var t = e.target;
    if (!t || !t.getAttribute || t.getAttribute('data-scene-field') !== 'sunAngle') return;
    var val = ED.Geo.clamp(n(t.value, 135), 0, 360);
    var label = $('#sunAngleVal');
    if (label) label.textContent = Math.round(val) + '°';
    if (!App.store) return;
    App.store.project.settings.render.sunAngle = val;
    applyScene3D();
    if (App.view3d) { try { App.view3d.render(); } catch (err) { /* ignore */ } }
  }

  function onSceneClick(e) {
    var modeBtn = e.target.closest('[data-render-mode]');
    if (modeBtn) {
      var mode = modeBtn.getAttribute('data-render-mode') === 'realistic' ? 'realistic' : 'schematic';
      App.store.act('Modo de renderizado', function () { App.store.project.settings.render.mode = mode; });
      applyScene3D(); schedule3D(); renderScenePanel(); updateStageActions();
      toast(mode === 'realistic' ? 'Modo realista: texturas, luz solar y sombras.' : 'Modo esquemático activado.', 'info', 2400);
      return;
    }
    var btn = e.target.closest('[data-scene-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-scene-action');
    if (action === 'flight') setFlight(!App.flight);
    else if (action === 'fit3d') {
      var view = ensure3D(false);
      if (view) { try { if (view.fit) view.fit(); view.render(); } catch (err) { /* ignore */ } }
    } else if (action === 'capture') capture3D();
    else if (action === 'resetScene') resetSceneSettings();
    else if (action === 'roofDesign') openRoofDesigner();
  }

  // ==================================================== diseñador de techos
  function profileForStyle(style, height) {
    var h = Math.max(200, Number(height) || 1200);
    var pts = [], i, t;
    if (style === 'flat') return [{ t: 0, z: 0 }, { t: 1, z: 0 }];
    if (style === 'gable' || style === 'hip') return [{ t: 0, z: 0 }, { t: 0.5, z: h }, { t: 1, z: 0 }];
    if (style === 'arc') {
      for (i = 0; i <= 14; i++) { t = i / 14; pts.push({ t: t, z: Math.round(h * Math.sin(Math.PI * t)) }); }
      return pts;
    }
    for (i = 0; i <= 14; i++) { t = i / 14; pts.push({ t: t, z: Math.round(h * Math.pow(Math.sin(Math.PI * t), 1.45)) }); }
    return pts;
  }

  function sampleProfile(profile, samples) {
    if (!profile || profile.length < 2) return [];
    var pts = profile.map(function (p) { return { x: p.t, y: p.z }; });
    var path = ED.Geo.catmullRomPath(pts, samples || 8);
    return path.filter(function (p) { return p.x >= -0.001 && p.x <= 1.001; });
  }

  function openRoofDesigner() {
    if (!App.store) return;
    var sc = sceneSettings();
    var draft = {
      style: sc.roofStyle,
      height: sc.roofHeight,
      overhang: sc.roofOverhang,
      ridge: sc.ridge,
      profile: (sc.roofProfile && sc.roofProfile.length >= 2)
        ? sc.roofProfile.map(function (p) { return { t: p.t, z: p.z }; })
        : profileForStyle(sc.roofStyle === 'custom' ? 'arc' : sc.roofStyle, sc.roofHeight)
    };
    var presetList = [['flat', 'Plano'], ['gable', 'A dos aguas'], ['hip', 'Cuatro aguas (poliforme)'], ['arc', 'Arco'], ['spline', 'Spline'], ['custom', 'Mi diseño']];
    App._roofDraft = draft;
    var body = '<div class="form-grid">' +
      '<div class="field full"><label>Tipo de techo</label><div class="chip-row" id="roofPresets">' +
      presetList.map(function (pair) {
        return '<button type="button" class="chip' + (draft.style === pair[0] ? ' active' : '') + '" data-roof-preset="' + pair[0] + '">' + pair[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field full"><label>Perfil del techo</label>' +
      '<canvas class="roof-designer" id="roofDesignerCanvas" width="580" height="230"></canvas>' +
      '<div class="roof-legend">Arrastra los puntos para diseñar el perfil · doble clic añade un punto · clic derecho quita el punto. Con los presets el perfil es una referencia; elige <strong>Mi diseño</strong> para editar y guardar tu forma.</div></div>' +
      '<div class="field-grid">' +
      field('Altura / flecha', '<div class="input-row"><input class="input" type="number" min="0.2" step="0.1" id="roofDraftHeight" value="' + unitLenInput(draft.height) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      field('Alero', '<div class="input-row"><input class="input" type="number" min="0" step="0.1" id="roofDraftOverhang" value="' + unitLenInput(draft.overhang) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      '</div>' +
      '<div class="field"><label>Orientación de la cumbrera</label><select class="select" id="roofDraftRidge">' +
      [['auto', 'Automática (eje largo)'], ['x', 'Horizontal (X)'], ['y', 'Vertical (Y)']].map(function (pair) {
        return '<option value="' + pair[0] + '"' + (draft.ridge === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field-hint">El perfil se barre a lo largo de la cumbrera en el 3D. Los extremos del perfil quedan en los aleros.</div></div>';
    var footer = '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="roofApply">Aplicar techo</button>';
    var modal = openModal({ title: 'Diseñar techo', subtitle: 'Plano, a dos aguas, cuatro aguas, arco, spline o tu propio perfil', body: body, footer: footer, wide: true, noAutoFocus: true });
    var root = modal.root;
    var canvas = $('#roofDesignerCanvas', root);
    var ctx = canvas ? canvas.getContext('2d') : null;
    var drag = null;
    var maxZ = Math.max(draft.height, 1000);

    function profileToDraw() {
      if (draft.style === 'custom') return draft.profile;
      return profileForStyle(draft.style, draft.height);
    }
    function mapPoint(p, w, h, m) {
      return { x: m + p.t * (w - m * 2), y: h - m - (p.z / Math.max(1, maxZ)) * (h - m * 2) };
    }
    function draw() {
      if (!ctx) return;
      var w = canvas.width, h = canvas.height, m = 26;
      maxZ = Math.max(draft.height, 1000) * 1.1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#f8f6f0';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(36,49,61,0.16)';
      ctx.lineWidth = 1;
      var i, j, x, y;
      for (i = 0; i <= 8; i++) { x = m + (i / 8) * (w - m * 2); ctx.beginPath(); ctx.moveTo(x, m); ctx.lineTo(x, h - m); ctx.stroke(); }
      for (j = 0; j <= 4; j++) { y = m + (j / 4) * (h - m * 2); ctx.beginPath(); ctx.moveTo(m, y); ctx.lineTo(w - m, y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(36,49,61,0.55)';
      ctx.beginPath(); ctx.moveTo(m, h - m + 0.5); ctx.lineTo(w - m, h - m + 0.5); ctx.stroke();
      var pts = sampleProfile(profileToDraw(), 10).map(function (p) { return mapPoint({ t: p.x, z: p.y }, w, h, m); });
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.strokeStyle = '#b5651d';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.lineTo(pts[pts.length - 1].x, h - m);
      ctx.lineTo(pts[0].x, h - m);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245,166,35,0.12)';
      ctx.fill();
      if (draft.style === 'custom') {
        draft.profile.forEach(function (p) {
          var sp = mapPoint(p, w, h, m);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.strokeStyle = '#b5651d'; ctx.lineWidth = 2; ctx.stroke();
        });
      } else {
        ctx.fillStyle = 'rgba(36,49,61,0.55)';
        ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Perfil de referencia · elige "Mi diseño" para editarlo', m, h - 8);
      }
    }
    function canvasPoint(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / Math.max(1, r.width)),
        y: (e.clientY - r.top) * (canvas.height / Math.max(1, r.height))
      };
    }
    function toProfile(sp) {
      var w = canvas.width, h = canvas.height, m = 26;
      return {
        t: ED.Geo.clamp((sp.x - m) / (w - m * 2), 0, 1),
        z: Math.round(ED.Geo.clamp((h - m - sp.y) / (h - m * 2), 0, 1) * maxZ)
      };
    }
    function nearestIndex(sp, tol) {
      var best = -1, bestD = tol || 16;
      draft.profile.forEach(function (p, idx) {
        var dp = mapPoint(p, canvas.width, canvas.height, 26);
        var d = Math.sqrt(Math.pow(dp.x - sp.x, 2) + Math.pow(dp.y - sp.y, 2));
        if (d < bestD) { bestD = d; best = idx; }
      });
      return best;
    }
    if (canvas) {
      canvas.addEventListener('pointerdown', function (e) {
        if (draft.style !== 'custom') return;
        var idx = nearestIndex(canvasPoint(e), 16);
        if (idx >= 0) {
          drag = idx;
          try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* tolerar */ }
          e.preventDefault();
        }
      });
      canvas.addEventListener('pointermove', function (e) {
        if (drag == null) return;
        var np = toProfile(canvasPoint(e));
        var lo = drag > 0 ? draft.profile[drag - 1].t + 0.01 : 0;
        var hi = drag < draft.profile.length - 1 ? draft.profile[drag + 1].t - 0.01 : 1;
        np.t = ED.Geo.clamp(np.t, lo, hi);
        draft.profile[drag] = np;
        draw();
        e.preventDefault();
      });
      var endDrag = function () { drag = null; };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('dblclick', function (e) {
        if (draft.style !== 'custom' || draft.profile.length >= 24) return;
        draft.profile.push(toProfile(canvasPoint(e)));
        draft.profile.sort(function (a, b) { return a.t - b.t; });
        draw();
        e.preventDefault();
      });
      canvas.addEventListener('contextmenu', function (e) {
        if (draft.style !== 'custom') return;
        e.preventDefault();
        var idx = nearestIndex(canvasPoint(e), 16);
        if (idx > 0 && idx < draft.profile.length - 1) {
          draft.profile.splice(idx, 1);
          draw();
        }
      });
    }
    $$('#roofPresets .chip', root).forEach(function (chip) {
      chip.addEventListener('click', function () {
        var style = chip.getAttribute('data-roof-preset');
        draft.style = style;
        if (style !== 'custom') draft.profile = profileForStyle(style, draft.height);
        $$('#roofPresets .chip', root).forEach(function (c) { c.classList.toggle('active', c === chip); });
        draw();
      });
    });
    var heightInput = $('#roofDraftHeight', root);
    var overhangInput = $('#roofDraftOverhang', root);
    if (heightInput) heightInput.addEventListener('input', function () {
      var mm = parseLenInput(heightInput.value);
      if (isFinite(mm) && mm > 0) {
        draft.height = ED.Geo.clamp(mm, 200, 8000);
        if (draft.style !== 'custom') draft.profile = profileForStyle(draft.style, draft.height);
        draw();
      }
    });
    if (overhangInput) overhangInput.addEventListener('input', function () {
      var mm = parseLenInput(overhangInput.value);
      if (isFinite(mm)) draft.overhang = ED.Geo.clamp(mm, 0, 2500);
    });
    var ridgeSel = $('#roofDraftRidge', root);
    if (ridgeSel) ridgeSel.addEventListener('change', function () { draft.ridge = ridgeSel.value; });
    draw();
    setTimeout(draw, 60);
    $('#roofApply', root).addEventListener('click', function () {
      var style = ROOF_STYLES[draft.style] ? draft.style : 'flat';
      var clean = draft.profile.map(function (p) {
        return { t: ED.Geo.round(p.t, 3), z: Math.round(ED.Geo.clamp(p.z, 0, 8000)) };
      });
      clean.sort(function (a, b) { return a.t - b.t; });
      if (style === 'custom' && clean.length < 2) { toast('Añade al menos dos puntos al perfil.', 'warn'); return; }
      App.store.act('Diseñar techo', function () {
        var r = App.store.project.settings.roof;
        r.style = style;
        r.height = ED.Geo.clamp(draft.height, 200, 8000);
        r.overhang = ED.Geo.clamp(draft.overhang, 0, 2500);
        r.ridge = ROOF_RIDGES[draft.ridge] ? draft.ridge : 'auto';
        r.profile = clean;
      });
      App.options3d.roof = true;
      applyScene3D();
      schedule3D();
      updateStageActions();
      renderScenePanel();
      sync3DQuickControls();
      modal.close();
      toast('Techo aplicado: ' + ROOF_STYLES[style] + '.', 'success', 2600);
    });
  }

  // ============================================== importar objetos externos
  function convexHull(points) {
    if (!points || points.length < 3) return points || [];
    var pts = points.slice().sort(function (a, b) { return a.x === b.x ? a.y - b.y : a.x - b.x; });
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lower = [];
    pts.forEach(function (p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    });
    var upper = [];
    for (var i = pts.length - 1; i >= 0; i--) {
      var p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    var hull = lower.concat(upper);
    return hull.length >= 3 ? hull : pts;
  }

  function registerProjectAssets(project) {
    if (!ED.Library || typeof ED.Library.registerCustom !== 'function') return;
    if (!project) return;
    (project.assets || []).forEach(function (a) {
      ED.Library.registerCustom({
        id: a.id, name: a.name, cat: 'mios', tags: 'importado ' + (a.source || ''),
        w: a.w, d: a.d, h: a.h, color: a.color,
        plan: a.plan, boxes: a.boxes, mesh: a.mesh
      });
    });
  }

  var pendingImport = null;

  function showImportModal() {
    if (!ED.Importer || typeof ED.Importer.parse !== 'function') { toast('Módulo de importación no disponible.', 'error'); return; }
    pendingImport = null;
    var body = '<div class="form-grid">' +
      '<div class="field full"><label>Archivo 3D del mueble o accesorio</label>' +
      '<label class="import-drop" id="importDrop"><input type="file" id="importFile" accept=".glb,.gltf,.obj" hidden>' +
      icon('cube', 26) + '<b>Elegir archivo .glb o .obj</b><span>o arrástralo aquí</span></label>' +
      '<div class="import-format-hint"><strong>Formato recomendado: GLB</strong> (glTF binario): un único archivo, estándar web, con materiales y colores. También se acepta <strong>OBJ</strong> (sin texturas). Evita FBX/3DS/STL: no se importan en esta versión.</div></div>' +
      '<div class="field full"><label>Nombre del objeto</label><input class="input" id="importName" placeholder="Mi mueble"></div>' +
      '<div class="field-grid">' +
      field('Ancho', '<div class="input-row"><input class="input" type="number" min="0.1" step="0.05" id="importW" value="1.2"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      field('Fondo', '<div class="input-row"><input class="input" type="number" min="0.1" step="0.05" id="importD" value="0.6"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      '</div>' +
      '<div class="field"><label>Alto</label><div class="input-row"><input class="input" type="number" min="0.1" step="0.05" id="importH" value="0.9"><span class="input-unit">' + unitLenLabel() + '</span></div></div>' +
      '<div class="field full"><div class="import-stats" id="importStats"></div><div class="import-preview" id="importPreview"><canvas id="importPreviewCanvas" width="520" height="170"></canvas></div></div>' +
      '</div>';
    var footer = '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="importAdd" disabled>Importar objeto</button>';
    var modal = openModal({ title: 'Importar objeto o mueble', subtitle: 'Añade tus propios modelos 3D a la biblioteca del proyecto', body: body, footer: footer, wide: true, noAutoFocus: true });
    var root = modal.root;
    var fileInput = $('#importFile', root);
    var nameInput = $('#importName', root);
    var stats = $('#importStats', root);
    var addBtn = $('#importAdd', root);
    var previewCanvas = $('#importPreviewCanvas', root);

    function setStats(html) { if (stats) stats.innerHTML = html; }
    function sizeVal(mm) { return unitSys() === 'ft' ? (mm / 304.8).toFixed(2) : (mm / 1000).toFixed(2); }
    function drawPlanPreview(mesh) {
      if (!previewCanvas) return;
      var ctx = previewCanvas.getContext('2d');
      if (!ctx) return;
      var w = previewCanvas.width, h = previewCanvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#f8f6f0';
      ctx.fillRect(0, 0, w, h);
      if (!mesh || !mesh.length) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      mesh.forEach(function (f) {
        f.points.forEach(function (p) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });
      });
      var span = Math.max(maxX - minX, maxY - minY, 1);
      var s = (Math.min(w, h) - 34) / span;
      function mp(p) { return { x: w / 2 + (p.x - (minX + maxX) / 2) * s, y: h / 2 - (p.y - (minY + maxY) / 2) * s }; }
      mesh.forEach(function (f) {
        if (f.points.length < 3) return;
        ctx.beginPath();
        var p0 = mp(f.points[0]);
        ctx.moveTo(p0.x, p0.y);
        for (var i = 1; i < f.points.length; i++) { var pp = mp(f.points[i]); ctx.lineTo(pp.x, pp.y); }
        ctx.closePath();
        ctx.fillStyle = f.color || '#cfd6dd';
        ctx.fill();
        ctx.strokeStyle = 'rgba(36,49,61,0.18)';
        ctx.stroke();
      });
    }
    function selectFile(file) {
      if (!file) return;
      setStats('Leyendo archivo…');
      ED.Importer.parse(file).then(function (parsed) {
        pendingImport = parsed;
        if (nameInput && (!nameInput.value || nameInput.value === 'Hecho en casa')) nameInput.value = parsed.name || 'Mi objeto';
        var span = parsed.bounds;
        var wmm = (span.maxX - span.minX) || 1000;
        var dmm = (span.maxY - span.minY) || 800;
        var hmm = (span.maxZ - span.minZ) || 900;
        if ($('#importW', root)) $('#importW', root).value = sizeVal(wmm);
        if ($('#importD', root)) $('#importD', root).value = sizeVal(dmm);
        if ($('#importH', root)) $('#importH', root).value = sizeVal(hmm);
        setStats('<span class="badge-soft">' + String(parsed.format || '').toUpperCase() + '</span> ' +
          '<span class="badge-soft">' + parsed.triangleCount + ' triángulos</span> ' +
          '<span class="badge-soft">' + sizeVal(wmm) + ' × ' + sizeVal(dmm) + ' × ' + sizeVal(hmm) + ' ' + unitLenLabel() + '</span>');
        drawPlanPreview(parsed.mesh);
        if (addBtn) addBtn.disabled = false;
      }).catch(function (err) {
        pendingImport = null;
        setStats('<span class="badge-soft" style="color:#f87171">Error: ' + esc(err && err.message ? err.message : 'no se pudo leer el archivo') + '</span>');
        if (addBtn) addBtn.disabled = true;
      });
    }
    if (fileInput) fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) selectFile(fileInput.files[0]);
    });
    var dropLabel = $('#importDrop', root);
    if (dropLabel) {
      dropLabel.addEventListener('dragover', function (e) { e.preventDefault(); dropLabel.classList.add('over'); });
      dropLabel.addEventListener('dragleave', function () { dropLabel.classList.remove('over'); });
      dropLabel.addEventListener('drop', function (e) {
        e.preventDefault();
        dropLabel.classList.remove('over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
      });
    }
    if (addBtn) addBtn.addEventListener('click', function () {
      if (!pendingImport) return;
      var name = (nameInput && nameInput.value.trim()) || pendingImport.name || 'Objeto importado';
      var wmm = ED.Geo.clamp(parseLenInput(($('#importW', root) || {}).value) || 1200, 100, 20000);
      var dmm = ED.Geo.clamp(parseLenInput(($('#importD', root) || {}).value) || 800, 100, 20000);
      var hmm = ED.Geo.clamp(parseLenInput(($('#importH', root) || {}).value) || 900, 100, 20000);
      var b = pendingImport.bounds;
      var sx = wmm / Math.max(1, b.maxX - b.minX);
      var sy = dmm / Math.max(1, b.maxY - b.minY);
      var sz = hmm / Math.max(1, b.maxZ - b.minZ);
      var cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      var counts = {}, bestColor = '#cfd6dd', bestCount = 0;
      var footprint = [];
      var mesh = pendingImport.mesh.map(function (f) {
        var c = f.color || '#cfd6dd';
        counts[c] = (counts[c] || 0) + 1;
        if (counts[c] > bestCount) { bestCount = counts[c]; bestColor = c; }
        return {
          points: f.points.map(function (p) {
            var nx = (p.x - cx) * sx;
            var ny = (p.y - cy) * sy;
            var nz = (p.z - b.minZ) * sz;
            if (Math.abs(nx) <= wmm * 0.6 && Math.abs(ny) <= dmm * 0.6) footprint.push({ x: nx, y: ny });
            return { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10, z: Math.round(nz * 10) / 10 };
          }),
          color: c
        };
      });
      var hull = convexHull(footprint);
      if (!hull || hull.length < 3) {
        hull = [{ x: -wmm / 2, y: -dmm / 2 }, { x: wmm / 2, y: -dmm / 2 }, { x: wmm / 2, y: dmm / 2 }, { x: -wmm / 2, y: dmm / 2 }];
      }
      hull = hull.map(function (p) { return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }).slice(0, 64);
      var asset = {
        id: 'asset_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: name, w: Math.round(wmm), d: Math.round(dmm), h: Math.round(hmm),
        color: bestColor, source: pendingImport.format === 'obj' ? 'obj' : 'glb',
        plan: hull,
        boxes: [{ x: -wmm / 2, y: -dmm / 2, z: 0, w: wmm, d: dmm, h: hmm, color: bestColor }],
        mesh: mesh.slice(0, 8000)
      };
      App.store.act('Importar objeto', function () {
        if (!Array.isArray(App.store.project.assets)) App.store.project.assets = [];
        App.store.project.assets.push(asset);
      });
      registerProjectAssets(App.store.project);
      modal.close();
      App.libCat = 'mios';
      setInspectorTab('library');
      renderLibrary();
      toast('Objeto «' + name + '» importado. Está en Biblioteca → Mis objetos.', 'success', 4200);
    });
  }

  // ================================================================ idioma
  function localize() {
    if (ED.I18n && typeof ED.I18n.apply === 'function') ED.I18n.apply(document);
  }

  function syncDeviceSelectLabels() {
    var sel = $('#deviceModeSelect');
    if (!sel || !ED.I18n) return;
    $$('option', sel).forEach(function (opt) {
      var id = opt.value;
      var label = null;
      for (var i = 0; i < DEVICE_MODES.length; i++) if (DEVICE_MODES[i].id === id) label = DEVICE_MODES[i].label;
      if (label) opt.textContent = ED.I18n.t(label);
    });
  }

  function initLanguage() {
    if (!ED.I18n) { updateLangToggle(); return; }
    var stored = null;
    try { stored = localStorage.getItem('engdraft.lang'); } catch (e) { stored = null; }
    if (typeof ED.I18n.setLang === 'function') ED.I18n.setLang(stored === 'en' ? 'en' : (ED.I18n.current === 'en' ? 'en' : 'es'));
    updateLangToggle();
    syncDeviceSelectLabels();
    localize();
  }

  // ============================================================ vistas 2D
  function projectPlanBounds() {
    var pts = [];
    var p = App.store ? App.store.project : null;
    if (!p) return { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000, w: 10000, h: 10000 };
    (p.walls || []).forEach(function (w) {
      if (!w || !w.a || !w.b) return;
      var poly = ED.Geo.wallPolygon(w, true);
      for (var i = 0; i < poly.length; i++) pts.push(poly[i]);
    });
    (p.rooms || []).forEach(function (r) {
      (r.polygon || []).forEach(function (pt) { pts.push(pt); });
    });
    (p.items || []).forEach(function (it) {
      var hw = (Number(it.w) || 600) / 2, hd = (Number(it.d) || 600) / 2;
      pts.push({ x: it.x - hw, y: it.y - hd }, { x: it.x + hw, y: it.y + hd });
    });
    if (!pts.length) return { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000, w: 10000, h: 10000 };
    return ED.Geo.bounds(pts);
  }

  function viewsOpts() {
    var b = projectPlanBounds();
    var opts = { type: App.viewMode, levelId: 'all' };
    if (App.viewMode === 'sectionX') opts.sectionPos = b.minX + b.w * (App.sectionPosPct / 100);
    else if (App.viewMode === 'sectionY') opts.sectionPos = b.minY + b.h * (App.sectionPosPct / 100);
    return opts;
  }

  function viewSrcMatch(src) {
    var sel = App.viewSelection;
    if (!sel || !src) return false;
    if (sel.kind === 'opening') {
      return src.kind === 'opening' && src.wallId === sel.wallId && src.openingId === sel.openingId;
    }
    return src.kind === sel.kind && String(src.id) === String(sel.id);
  }

  function pointInPoly(px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
    }
    return inside;
  }

  function nearPolyline(px, py, pts) {
    var best = Infinity;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var vx = b.x - a.x, vy = b.y - a.y;
      var len2 = vx * vx + vy * vy;
      var t = len2 > 0 ? ((px - a.x) * vx + (py - a.y) * vy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      var dx = px - (a.x + vx * t), dy = py - (a.y + vy * t);
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }
    return best;
  }

  function viewsHitTest(clientX, clientY) {
    var canvas = $('#viewsCanvas'), fit = App.viewsFit, data = App.viewsData;
    if (!canvas || !fit || !data) return null;
    var r = canvas.getBoundingClientRect();
    var x = clientX - r.left, y = clientY - r.top;
    function toScreen(p) {
      return { x: fit.cssW / 2 + (p.x - fit.cx) * fit.zoom + App.viewsPan.x, y: fit.cssH / 2 - (p.y - fit.cy) * fit.zoom + App.viewsPan.y };
    }
    var prims = data.primitives || [], best = null, bestScore = Infinity;
    for (var i = prims.length - 1; i >= 0; i--) {
      var pr = prims[i];
      if (!pr || !pr.src || !pr.points || pr.points.length < 2) continue;
      var pts = pr.points.map(toScreen);
      var inside = !!pr.closed && pointInPoly(x, y, pts);
      var dist = nearPolyline(x, y, pts);
      var score = inside ? -1 : dist;
      if (inside || dist <= 6) { if (score < bestScore) { bestScore = score; best = pr; } }
    }
    return best ? best.src : null;
  }

  function selectViewsPrimitive(src) {
    if (!src) return;
    if (src.kind === 'roof') {
      App.viewSelection = null;
      applyInspectorState('open');
      setInspectorTab('scene');
      toast('Techo: ajusta estilo, materiales y vigas en Escena.', 'info', 2600);
      return;
    }
    applyInspectorState('open');
    setInspectorTab('props');
    if (src.kind === 'opening') {
      App.store.setSelection([{ kind: 'wall', id: src.wallId }]);
      App.viewSelection = { kind: 'opening', wallId: src.wallId, openingId: src.openingId };
      renderViewSelectionProps();
    } else {
      App.viewSelection = null;
      App.store.setSelection([{ kind: src.kind, id: src.id }]);
      refreshProps();
    }
    renderViews();
  }

  function renderViewSelectionProps() {
    var panel = $('#panelProps');
    if (!panel) return;
    var sel = App.viewSelection;
    if (!sel || sel.kind !== 'opening') { App.viewSelection = null; refreshProps(); return; }
    var wall = App.store.find('wall', sel.wallId);
    var op = null;
    (wall && wall.openings ? wall.openings : []).forEach(function (o) { if (o.id === sel.openingId) op = o; });
    if (!wall || !op) { App.viewSelection = null; refreshProps(); return; }
    var sizeU = unitSizeLabel();
    var typeLabel = op.type === 'window' ? 'Ventana' : op.type === 'garage' ? 'Portón' : op.type === 'pass' ? 'Paso' : 'Puerta';
    var subOptions = (OPENING_SUBTYPES[op.type] || []).map(function (pair) {
      return '<option value="' + pair[0] + '"' + ((op.subtype || OPENING_SUBTYPE_DEFAULT[op.type]) === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
    }).join('');
    var html = '<div class="section"><div class="section-title">Abertura en vista <span class="count">' + typeLabel + '</span></div>' +
      '<div class="field-hint">Seleccionada en la vista generada. Los cambios se aplican al proyecto.</div>' +
      (subOptions ? '<div class="field"><label>Tipo de hoja / ventana</label><select class="select" data-opening="' + esc(op.id) + '" data-wall="' + esc(wall.id) + '" data-open-field="subtype">' + subOptions + '</select></div>' : '') +
      '<div class="field-grid"><div class="field"><label>Ancho</label><div class="input-row"><input class="input" type="number" min="0.3" step="0.05" data-opening="' + esc(op.id) + '" data-wall="' + esc(wall.id) + '" data-open-field="width" value="' + unitSizeInput(op.width) + '"><span class="input-unit">' + sizeU + '</span></div></div>' +
      '<div class="field"><label>Alto</label><div class="input-row"><input class="input" type="number" min="0.3" step="0.05" data-opening="' + esc(op.id) + '" data-wall="' + esc(wall.id) + '" data-open-field="height" value="' + unitSizeInput(op.height) + '"><span class="input-unit">' + sizeU + '</span></div></div>' +
      '<div class="field"><label>Antepecho</label><div class="input-row"><input class="input" type="number" min="0" step="0.05" data-opening="' + esc(op.id) + '" data-wall="' + esc(wall.id) + '" data-open-field="sill" value="' + unitSizeInput(op.sill || 0) + '"><span class="input-unit">' + sizeU + '</span></div></div>' +
      '<div class="field"><label>Posición</label><div class="input-row"><input class="input" type="number" min="0" max="100" step="1" data-opening="' + esc(op.id) + '" data-wall="' + esc(wall.id) + '" data-open-field="t" value="' + fnum(op.t * 100, 1) + '"><span class="input-unit">%</span></div></div></div>' +
      (op.type === 'door' || op.type === 'garage' ? '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="flip-opening" data-wall="' + esc(wall.id) + '" data-opening="' + esc(op.id) + '" data-open-prop="swing">' + icon('rotate', 12) + 'Girar hoja</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="flip-opening" data-wall="' + esc(wall.id) + '" data-opening="' + esc(op.id) + '" data-open-prop="hinge">' + icon('duplicate', 12) + 'Invertir bisagra</button></div>' : '') +
      '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="delete-opening" data-wall="' + esc(wall.id) + '" data-opening="' + esc(op.id) + '">' + icon('trash', 12) + 'Eliminar abertura</button></div></div>' +
      '<div class="section"><div class="section-title">Muro</div>' +
      '<div class="read-line"><span>Longitud</span><strong>' + unitLen(ED.Geo.wallLength(wall)) + '</strong></div>' +
      '<div class="read-line"><span>Nivel</span><strong>' + esc(levelName(wall.level)) + '</strong></div>' +
      '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="view-select-wall" data-id="' + esc(wall.id) + '">' + icon('wall', 12) + 'Seleccionar muro completo</button></div></div>';
    panel.innerHTML = html;
    localize();
  }

  function setViewMode(mode) {
    var valid = false;
    for (var i = 0; i < VIEW_MODES.length; i++) if (VIEW_MODES[i].id === mode) valid = true;
    var next = valid ? mode : 'plan';
    App.viewMode = next;
    $$('#toolList [data-view-mode]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view-mode') === next);
    });
    var planCanvas = $('#planCanvas');
    var viewsCanvas = $('#viewsCanvas');
    var chip = $('#viewModeChip');
    if (next === 'plan') {
      App.viewSelection = null;
      if (viewsCanvas) { viewsCanvas.hidden = true; if (viewsCanvas.classList) viewsCanvas.classList.remove('selectable'); }
      if (chip) chip.classList.remove('editable');
      var vh = $('#viewsHint'); if (vh) vh.hidden = true;
      if (viewsCanvas) viewsCanvas.hidden = true;
      if (planCanvas) planCanvas.hidden = false;
      if (chip) chip.hidden = true;
      if (App.view === '2d' && App.editor) {
        setTimeout(function () {
          if (App.viewMode !== 'plan') return;
          App.editor._resize();
          App.editor.fitToContent();
          App.editor.render();
          updateZoomStatus();
        }, 30);
      }
    } else {
      if (planCanvas) planCanvas.hidden = true;
      if (viewsCanvas) viewsCanvas.hidden = false;
      if (chip) {
        chip.hidden = false;
        chip.textContent = viewModeInfo(next).label;
      }
      App.viewsZoom = 1;
      App.viewsPan = { x: 0, y: 0 };
      setTimeout(renderViews, 20);
    }
    updateStageActions();
    if (ED.I18n) ED.I18n.apply(document);
  }

  function drawViewData(ctx, data, cssW, cssH) {
    var b = data.bounds || { minX: 0, minY: 0, maxX: 10000, maxY: 8000, w: 10000, h: 8000 };
    var margin = 44;
    var zoom = Math.min((cssW - margin * 2) / Math.max(1, b.w), (cssH - margin * 2) / Math.max(1, b.h)) * App.viewsZoom;
    if (!isFinite(zoom) || zoom <= 0) zoom = 0.05;
    var cx = (b.minX + b.maxX) / 2;
    var cy = (b.minY + b.maxY) / 2;
    App.viewsFit = { zoom: zoom, cx: cx, cy: cy, cssW: cssW, cssH: cssH };
    function tx(p) {
      return {
        x: cssW / 2 + (p.x - cx) * zoom + App.viewsPan.x,
        y: cssH / 2 - (p.y - cy) * zoom + App.viewsPan.y
      };
    }
    ctx.fillStyle = '#f8f6f0';
    ctx.fillRect(0, 0, cssW, cssH);
    var prims = data.primitives || [];
    prims.forEach(function (pr) {
      if (!pr || !pr.points || !pr.points.length) return;
      if (pr.kind === 'text') {
        var tp = tx(pr.points[0]);
        var size = Math.max(8, (Number(pr.size) || 240) * zoom);
        ctx.save();
        ctx.fillStyle = pr.fill || '#33414d';
        ctx.font = (pr.weight ? pr.weight + ' ' : '600 ') + Math.round(size) + 'px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = pr.align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(pr.text || ''), tp.x, tp.y);
        ctx.restore();
        return;
      }
      ctx.beginPath();
      var p0 = tx(pr.points[0]);
      ctx.moveTo(p0.x, p0.y);
      for (var i = 1; i < pr.points.length; i++) {
        var pp = tx(pr.points[i]);
        ctx.lineTo(pp.x, pp.y);
      }
      if (pr.closed) ctx.closePath();
      if (pr.fill) {
        ctx.fillStyle = pr.fill;
        ctx.fill();
      }
      if (pr.stroke !== null && pr.stroke !== false) {
        ctx.strokeStyle = pr.stroke || '#26323c';
        // El grosor del contrato está en mm: se convierte con la MISMA escala
        // uniforme que la geometría (antes se usaba un factor fijo y deformaba
        // marcos, muros y ventanas de las vistas).
        var lwPx = (Number(pr.width) || 1) * zoom;
        ctx.lineWidth = Math.max(0.5, Math.min(6, lwPx));
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    });
    // Resaltado de la entidad seleccionada en la vista
    if (App.viewSelection) {
      ctx.save();
      prims.forEach(function (pr) {
        if (!pr || !pr.src || !pr.points || pr.points.length < 2) return;
        if (!viewSrcMatch(pr.src)) return;
        ctx.beginPath();
        var q0 = tx(pr.points[0]);
        ctx.moveTo(q0.x, q0.y);
        for (var h = 1; h < pr.points.length; h++) { var qp = tx(pr.points[h]); ctx.lineTo(qp.x, qp.y); }
        if (pr.closed) ctx.closePath();
        ctx.strokeStyle = '#e0a030';
        ctx.lineWidth = 2.6;
        ctx.lineJoin = 'round';
        ctx.stroke();
        if (pr.closed) { ctx.fillStyle = 'rgba(224,160,48,0.10)'; ctx.fill(); }
      });
      ctx.restore();
    }
    // Marco y rótulo de la vista
    ctx.save();
    ctx.strokeStyle = 'rgba(36,49,61,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);
    ctx.fillStyle = 'rgba(30,42,53,0.72)';
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(data.title || viewModeInfo(App.viewMode).label), 14, cssH - 12);
    ctx.restore();
  }

  function renderViews() {
    var canvas = $('#viewsCanvas');
    if (!canvas || App.viewMode === 'plan') return;
    if (!ED.Views || typeof ED.Views.build !== 'function') {
      var c0 = canvas.getContext('2d');
      if (c0) {
        canvas.width = Math.max(2, canvas.clientWidth || 600);
        canvas.height = Math.max(2, canvas.clientHeight || 400);
        c0.fillStyle = '#f8f6f0';
        c0.fillRect(0, 0, canvas.width, canvas.height);
        c0.fillStyle = '#8a3b31';
        c0.font = '15px "Segoe UI", sans-serif';
        c0.fillText('Módulo de vistas no disponible.', 24, 40);
      }
      return;
    }
    var parent = canvas.parentElement || canvas;
    var cssW = parent.clientWidth || 900;
    var cssH = parent.clientHeight || 600;
    if (!cssW || !cssH) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var data = null;
    try { data = ED.Views.build(App.store.project, viewsOpts()); } catch (e) { console.error('[EngDraft vistas]', e); }
    if (!data) return;
    App.viewsData = data;
    if (canvas.classList) canvas.classList.add('selectable');
    canvas.style.cursor = 'crosshair';
    var chip = $('#viewModeChip');
    if (chip) chip.classList.add('editable');
    var hint = $('#viewsHint');
    if (hint) hint.hidden = false;
    drawViewData(ctx, data, cssW, cssH);
    updateZoomStatus();
  }

  function fitActiveView() {
    if (App.viewMode !== 'plan') {
      App.viewsZoom = 1;
      App.viewsPan = { x: 0, y: 0 };
      renderViews();
      return;
    }
    if (App.editor) {
      App.editor.fitToContent();
      updateZoomStatus();
    }
  }

  function zoomActiveView(factor) {
    if (App.viewMode === 'plan') {
      if (App.editor) {
        App.editor.zoomBy(factor);
        updateZoomStatus();
      }
      return;
    }
    App.viewsZoom = ED.Geo.clamp((App.viewsZoom || 1) * factor, 0.2, 8);
    renderViews();
  }

  function onStageInput(e) {
    if (e.target && e.target.id === 'sectionPos') {
      App.sectionPosPct = Number(e.target.value) || 50;
      renderViews();
    }
  }

  function toggleLanguage() {
    if (!ED.I18n) { toast('Módulo de idioma no disponible.', 'warn'); return; }
    var next = ED.I18n.current === 'en' ? 'es' : 'en';
    ED.I18n.setLang(next);
    refreshHeader();
    refreshLevelTabs();
    refreshProps();
    refreshLayers();
    renderLibrary();
    if (App.tab === 'scene') renderScenePanel();
    updateStageActions();
    syncCanvasToggles();
    updateZoomStatus();
    updateUnitsUI();
    if ($('#viewModeChip') && App.viewMode !== 'plan') $('#viewModeChip').textContent = viewModeInfo(App.viewMode).label;
    if (ED.I18n.apply) ED.I18n.apply(document);
    updateLangToggle();
    syncDeviceSelectLabels();
    toast(next === 'en' ? 'Language: English' : 'Idioma: Español', 'info', 2200);
  }

  function updateLangToggle() {
    var btn = $('#langToggle');
    if (!btn) return;
    var lang = (ED.I18n && ED.I18n.current) || 'es';
    $$('.lang-opt', btn).forEach(function (b, i) {
      b.classList.toggle('active', (i === 0 && lang === 'es') || (i === 1 && lang === 'en'));
    });
  }

  // ================================================================== vistas
  function setView(view) {
    if (view !== '2d' && view !== '3d' && view !== 'sheets') return;
    if (view !== '3d' && App.flight) {
      App.flight = false;
      if (App.view3d && typeof App.view3d.stopFlight === 'function') {
        try { App.view3d.stopFlight(); } catch (e) { /* ignore */ }
      }
      var flightBadge = $('#view3dFlight');
      if (flightBadge) flightBadge.hidden = true;
    }
    App.view = view;
    if (view !== '2d' || App.viewMode === 'plan') App.viewSelection = null;
    $$('#viewTabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    ['2d', '3d', 'sheets'].forEach(function (v) {
      var sec = $('#view' + (v === '2d' ? '2d' : v === '3d' ? '3d' : 'Sheets'));
      if (sec) sec.classList.toggle('active', v === view);
    });
    updateStageActions();
    var modeChip = $('#viewModeChip');
    if (modeChip) modeChip.hidden = !(view === '2d' && App.viewMode !== 'plan');
    if (view === '2d') {
      setTimeout(function () {
        if (App.view !== '2d') return;
        if (App.viewMode !== 'plan') { renderViews(); return; }
        App.editor._resize();
        App.editor.render();
        updateZoomStatus();
      }, 40);
      refreshProps();
    } else if (view === '3d') {
      ensure3D(true);
      sync3DQuickControls();
      refreshProps();
    } else if (view === 'sheets') {
      setInspectorTab('props');
      renderSheets();
      refreshProps();
    }
  }

  // ================================================================== 3D
  function ensure3D(fit) {
    var canvas = $('#canvas3d');
    var loading = $('#view3dLoading');
    if (!ED.View3D) {
      loading.textContent = 'El módulo de vista 3D no está disponible.';
      loading.classList.add('show');
      return null;
    }
    if (!App.view3d) {
      loading.classList.add('show');
      try {
        App.view3d = new ED.View3D(canvas, { store: App.store });
      } catch (e1) {
        try { App.view3d = new ED.View3D(canvas); } catch (e2) {
          console.error(e2);
          loading.textContent = 'No se pudo iniciar la vista 3D.';
          return null;
        }
      }
      if (App.view3d.setStore) App.view3d.setStore(App.store);
      applyScene3D();
      if (App.view3d.setLevelFilter) App.view3d.setLevelFilter(App.options3d.levels || 'all');
      setTimeout(function () {
        try {
          if (App.view3d.resize) App.view3d.resize();
          if (fit !== false && App.view3d.fit) App.view3d.fit();
          if (App.view3d.render) App.view3d.render();
          loading.classList.remove('show');
        } catch (e) {
          console.error(e);
          loading.textContent = 'La vista 3D encontró un problema al dibujar.';
        }
      }, 80);
    } else {
      setTimeout(function () {
        if (App.view !== '3d') return;
        try {
          if (App.view3d.resize) App.view3d.resize();
          applyScene3D();
          if (fit && App.view3d.fit) App.view3d.fit();
          if (App.view3d.render) App.view3d.render();
          loading.classList.remove('show');
        } catch (e) { console.error(e); }
      }, 40);
    }
    return App.view3d;
  }

  function schedule3D() {
    if (App.threeTimer) clearTimeout(App.threeTimer);
    App.threeTimer = setTimeout(function () {
      App.threeTimer = null;
      if (App.view !== '3d' || !App.view3d) return;
      try { App.view3d.render(); } catch (e) { console.error(e); }
    }, 150);
  }

  function apply3DOptions(patch) {
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) App.options3d[k] = patch[k];
    if (App.view3d) {
      try { applyScene3D(); } catch (e) { console.error(e); }
    }
    if (App.view3d && App.view3d.render) {
      try { App.view3d.render(); } catch (e) { console.error(e); }
    }
    updateStageActions();
    sync3DQuickControls();
  }

  function capture3D() {
    if (App.flight) setFlight(false, { silent: true });
    var view = ensure3D(false);
    if (!view || !view.screenshot) { toast('La vista 3D aún no está lista.', 'warn'); return; }
    var shot = null;
    try { shot = view.screenshot(2); } catch (e) { /* fallback abajo */ }
    if (!shot) { try { shot = view.screenshot(); } catch (e) { console.error(e); } }
    if (!shot) { toast('No se pudo capturar la vista 3D.', 'error'); return; }
    App.last3dShot = shot;
    var selected = getSelectedSheet();
    var sheet = selected && selected.content === '3d' ? selected : null;
    if (!sheet) {
      sheet = createSheetObject({ content: '3d', name: 'Vista 3D', title: 'VISTA 3D', template: 'technical' });
    }
    App.store.act('Captura 3D a lámina', function () {
      if (App.store.project.sheets.indexOf(sheet) < 0) App.store.project.sheets.push(sheet);
      sheet.imageDataUrl = shot;
      sheet.imagePreset = 'custom';
      sheet.content = '3d';
      if (!sheet.name) sheet.name = 'Vista 3D';
    });
    App.selectedSheetId = sheet.id;
    setView('sheets');
    markSelectedSheet();
    toast('Captura 3D añadida a la lámina ' + (sheet.sheetNo || ''), 'success', 3600);
  }

  // ================================================================== láminas
  function getSelectedSheet() {
    if (!App.selectedSheetId) return null;
    for (var i = 0; i < App.store.project.sheets.length; i++) {
      if (App.store.project.sheets[i].id === App.selectedSheetId) return App.store.project.sheets[i];
    }
    return null;
  }

  function ensureSheetSelection() {
    var sheets = App.store.project.sheets;
    if (!sheets.length) { App.selectedSheetId = null; return; }
    if (!getSelectedSheet()) App.selectedSheetId = sheets[0].id;
  }

  function sheetTypeName(content) {
    return {
      plan: 'Planta', notes: 'Notas', cover: 'Portada', '3d': 'Vista 3D',
      front: 'Fachada frontal', rear: 'Fachada posterior',
      right: 'Lateral derecha', left: 'Lateral izquierda'
    }[content] || 'Planta';
  }

  function sheetDefaultTitle(content) {
    return {
      plan: 'PLANTA', notes: 'NOTAS Y CUADROS', cover: 'PORTADA', '3d': 'VISTA 3D',
      front: 'FACHADA FRONTAL', rear: 'FACHADA POSTERIOR',
      right: 'FACHADA LATERAL DERECHA', left: 'FACHADA LATERAL IZQUIERDA'
    }[content] || 'PLANTA';
  }

  var SHEET_IMAGE_CONTENTS = { '3d': 'Perspectiva', front: 'Fachada frontal', rear: 'Fachada posterior', right: 'Lateral derecha', left: 'Lateral izquierda' };

  function isSheetImageContent(content) {
    return !!(SHEET_IMAGE_CONTENTS[content]);
  }

  function sheetImagePreset(content) {
    return content === '3d' ? 'iso' : content;
  }

  function sheet3DOptions() {
    var sc = sceneSettings();
    return {
      roof: true,
      roofStyle: sc.roofStyle,
      roofRidge: sc.ridge,
      roofProfile: sc.roofProfile,
      roofStructure: sc.roofStructure,
      roofHeight: sc.roofHeight,
      roofOverhang: sc.roofOverhang,
      roofColor: sc.materials.roof.color,
      roofTexture: sc.materials.roof.texture,
      renderMode: sc.render.mode,
      materials: sc.materials,
      shadows: sc.render.shadows,
      textures: sc.render.textures,
      sunAngle: sc.render.sunAngle,
      furniture: true,
      labels: false,
      ground: true,
      levels: 'all',
      dimensions: false
    };
  }

  function getSheet3DView() {
    if (!ED.View3D) return null;
    if (App._sheet3dView) {
      try { App._sheet3dView.setStore(App.store); } catch (e) { /* ignore */ }
      return App._sheet3dView;
    }
    var wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:900px;overflow:hidden;pointer-events:none;';
    var canvas = document.createElement('canvas');
    canvas.style.width = '1600px';
    canvas.style.height = '900px';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    try {
      var view = new ED.View3D(canvas, { store: App.store });
      view.setOptions(sheet3DOptions());
      view.resize();
      App._sheet3dView = view;
      return view;
    } catch (e) {
      console.error('No se pudo crear la vista 3D para láminas:', e);
      wrap.parentNode.removeChild(wrap);
      return null;
    }
  }

  function captureSheet3DImage() {
    var view = getSheet3DView();
    if (!view) return null;
    try {
      view.setOptions(sheet3DOptions());
      view.setLevelFilter('all');
      view.setPreset('iso');
      view.render();
      var shot = view.screenshot(1.6);
      return shot || view.screenshot();
    } catch (e) {
      console.error('Captura 3D para lámina:', e);
      return null;
    }
  }

  function drawElevationPrimitive(ctx, pr, sx, ox, oy) {
    if (!pr) return;
    if (pr.kind === 'text') {
      var anchor = pr.points && pr.points[0];
      if (!anchor) return;
      var size = Math.max(6, Math.min(64, Number(pr.size || 240) * sx));
      ctx.font = '400 ' + size.toFixed(1) + 'px "Bahnschrift","Consolas","Segoe UI",monospace';
      ctx.textAlign = pr.align === 'center' ? 'center' : (pr.align === 'right' ? 'right' : 'left');
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = pr.fill || '#24313d';
      ctx.fillText(String(pr.text == null ? '' : pr.text), ox + anchor.x * sx, oy - anchor.y * sx);
      return;
    }
    if (!Array.isArray(pr.points) || pr.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(ox + pr.points[0].x * sx, oy - pr.points[0].y * sx);
    for (var i = 1; i < pr.points.length; i++) {
      ctx.lineTo(ox + pr.points[i].x * sx, oy - pr.points[i].y * sx);
    }
    if (pr.kind === 'poly' && pr.closed !== false) ctx.closePath();
    if (pr.kind === 'poly' && pr.fill) {
      ctx.fillStyle = pr.fill;
      ctx.fill();
    }
    if (pr.stroke) {
      ctx.strokeStyle = pr.stroke;
      ctx.lineWidth = Math.max(0.5, Math.min(9, Number(pr.width || 20) * sx));
      ctx.stroke();
    }
  }

  function captureElevationImage(type) {
    if (!ED.Views || typeof ED.Views.build !== 'function') return null;
    var view;
    try { view = ED.Views.build(App.store.project, { type: type, levelId: 'all' }); } catch (e) { console.error('Vista de fachada:', e); return null; }
    var b = view.bounds || { minX: 0, minY: 0, maxX: 1000, maxY: 1000, w: 1000, h: 1000 };
    if (!(b.w > 0)) b.w = 1000;
    if (!(b.h > 0)) b.h = 1000;
    var W = 1800, H = 1100, pad = 72;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#f8f6f0';
    ctx.fillRect(0, 0, W, H);
    var sx = Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h);
    if (!(sx > 0) || !isFinite(sx)) sx = 0.02;
    var ox = W / 2 - ((b.minX + b.maxX) / 2) * sx;
    var oy = H / 2 + ((b.minY + b.maxY) / 2) * sx;
    var prims = view.primitives || [];
    for (var i = 0; i < prims.length; i++) drawElevationPrimitive(ctx, prims[i], sx, ox, oy);
    ctx.strokeStyle = 'rgba(36,49,61,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, H - pad * 0.7);
    ctx.lineTo(W - pad, H - pad * 0.7);
    ctx.stroke();
    return canvas.toDataURL('image/png');
  }

  function ensureSheetImage(sheet, force) {
    if (!sheet || !isSheetImageContent(sheet.content)) return false;
    var kind = sheet.content;
    var preset = sheetImagePreset(kind);
    var has = !!sheet.imageDataUrl;
    var custom = kind === '3d' && sheet.imagePreset === 'custom';
    var current = kind === '3d'
      ? (has && (custom || !force))
      : (has && sheet.imagePreset === preset && !force);
    if (current) return false;
    var shot = kind === '3d' ? captureSheet3DImage() : captureElevationImage(kind);
    if (!shot) return false;
    sheet.imageDataUrl = shot;
    sheet.imagePreset = (kind === '3d' && custom && !force) ? 'custom' : preset;
    sheet.imageGeneratedAt = new Date().toISOString();
    return true;
  }

  function ensureSheetImages(force) {
    var changed = false;
    var sheets = (App.store && App.store.project && App.store.project.sheets) || [];
    for (var i = 0; i < sheets.length; i++) {
      try {
        if (ensureSheetImage(sheets[i], !!force)) changed = true;
      } catch (e) {
        console.error('Imagen de lámina:', e);
      }
    }
    if (changed) App.store.scheduleSave();
    return changed;
  }

  function refreshSelectedSheetImage() {
    var sheet = getSelectedSheet();
    if (!sheet) return;
    if (!isSheetImageContent(sheet.content)) { toast('Esta lámina no usa una vista gráfica.', 'info'); return; }
    sheet.imagePreset = null;
    ensureSheetImage(sheet, true);
    scheduleSheetPreviews(40);
    refreshProps();
    toast('Vista de la lámina actualizada.', 'success', 2200);
  }

  function renderSheets() {
    ensureSheetImages(false);
    ensureSheetSelection();
    var gallery = $('#sheetGallery');
    if (!gallery) return;
    if (!ED.Sheets) {
      gallery.innerHTML = '<div class="empty-note">El módulo de láminas no está disponible.</div>';
      return;
    }
    if (!App.store.project.sheets.length) {
      gallery.innerHTML = '<div class="empty-note">Este proyecto no tiene láminas. Crea una para empezar.</div>' +
        '<div class="sheet-card add-sheet" data-add-sheet><div class="add-inner"><span class="plus">+</span>Nueva lámina</div></div>';
      return;
    }
    gallery.innerHTML = App.store.project.sheets.map(function (sheet) {
      var size = sheet.size || 'A3';
      var selected = sheet.id === App.selectedSheetId;
      return '<div class="sheet-card' + (selected ? ' active' : '') + '" data-sheet-id="' + esc(sheet.id) + '">' +
        '<div class="sheet-preview"><canvas></canvas></div>' +
        '<div class="sheet-meta"><div><strong>' + esc(sheet.name || 'Lámina') + '</strong>' +
        '<span>' + esc(sheet.sheetNo || '') + ' · ' + esc(size) + ' · ' + esc(sheetTypeName(sheet.content)) + '</span></div>' +
        '<span class="sheet-tag">' + esc(String(sheet.template || 'modern')) + '</span></div></div>';
    }).join('') + '<div class="sheet-card add-sheet" data-add-sheet><div class="add-inner"><span class="plus">+</span>Nueva lámina</div></div>';
    requestAnimationFrame(function () {
      $$('#sheetGallery .sheet-card[data-sheet-id]').forEach(renderCardPreview);
    });
  }

  function renderCardPreview(card) {
    var id = card.getAttribute('data-sheet-id');
    var sheet = null;
    App.store.project.sheets.forEach(function (s) { if (s.id === id) sheet = s; });
    var canvas = card.querySelector('canvas');
    if (!canvas || !sheet || !ED.Sheets) return;
    try {
      if (ED.Sheets.pageSize) {
        var sz = ED.Sheets.pageSize(sheet);
        canvas.style.aspectRatio = sz.w + ' / ' + sz.h;
      }
      ED.Sheets.renderPreview(canvas, App.store.project, sheet);
    } catch (e) {
      console.error('Preview de lámina:', e);
      var ctx = canvas.getContext('2d');
      canvas.width = 640; canvas.height = 440;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 440);
      ctx.fillStyle = '#8a3b31'; ctx.font = '16px Segoe UI';
      ctx.fillText('Vista previa no disponible', 24, 40);
    }
  }

  function markSelectedSheet() {
    $$('#sheetGallery .sheet-card[data-sheet-id]').forEach(function (c) {
      c.classList.toggle('active', c.getAttribute('data-sheet-id') === App.selectedSheetId);
    });
  }

  function scheduleSheetPreviews(delay) {
    if (App.sheetTimer) clearTimeout(App.sheetTimer);
    App.sheetTimer = setTimeout(function () {
      App.sheetTimer = null;
      if (App.view !== 'sheets') return;
      renderSheets();
    }, delay == null ? 260 : delay);
  }

  function createSheetObject(opts) {
    opts = opts || {};
    if (ED.Sheets && ED.Sheets.createSheet) {
      try {
        var sheet = ED.Sheets.createSheet(App.store.project, opts);
        if (sheet) return sheet;
      } catch (e) { console.warn(e); }
    }
    var count = App.store.project.sheets.length;
    return {
      id: 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: opts.name || 'Lámina ' + (count + 1),
      size: opts.size || 'A3', orientation: 'landscape',
      template: opts.template || 'modern', scale: 100,
      content: opts.content || 'plan', levelId: App.store.activeLevel,
      sheetNo: opts.sheetNo || ('A-' + String(count + 1).padStart(2, '0')),
      title: opts.title || 'PLANTA', notes: '',
      showDims: true, showFurniture: true, showRooms: true, showGrid: false,
      imageDataUrl: null
    };
  }

  function addSheet() {
    var sheet = createSheetObject({ content: 'plan', name: 'Nueva lámina', title: 'PLANTA' });
    App.store.act('Nueva lámina', function () { App.store.project.sheets.push(sheet); });
    App.selectedSheetId = sheet.id;
    setView('sheets');
    renderSheets();
    refreshProps();
    toast('Lámina ' + (sheet.sheetNo || '') + ' creada.', 'success', 2500);
  }

  function exportPDF(sheets) {
    if (!ED.Sheets || !ED.Sheets.createPDF) { toast('Módulo de PDF no disponible.', 'error'); return; }
    if (!App.store.project.sheets.length) { toast('Crea al menos una lámina antes de exportar.', 'warn'); return; }
    var list = (sheets && sheets.length) ? sheets : App.store.project.sheets;
    ensureSheetImages(true);
    toast('Generando PDF vectorial de ' + list.length + ' lámina' + (list.length === 1 ? '' : 's') + '…', 'info', 4200);
    var btn = $('#btnExportPdf');
    btn.disabled = true;
    setTimeout(function () {
      try {
        var result = ED.Sheets.createPDF(App.store.project, list);
        var done = function (blob) {
          if (!blob) { toast('El PDF no se pudo generar.', 'error'); return; }
          downloadBlob(blob, safeName(App.store.project.meta.name) + '_planos.pdf');
          toast('PDF exportado: ' + list.length + ' página' + (list.length === 1 ? '' : 's') + '.', 'success', 3600);
        };
        if (result && typeof result.then === 'function') {
          result.then(done).catch(function (e) { console.error(e); toast('Error al generar el PDF.', 'error'); })
            .then(function () { btn.disabled = false; });
        } else {
          done(result);
          btn.disabled = false;
        }
      } catch (e) {
        console.error(e);
        toast('Error al generar el PDF: ' + (e.message || e), 'error', 4200);
        btn.disabled = false;
      }
    }, 60);
  }

  // ================================================================== acciones de etapa
  function stageHistoryHtml() {
    var canUndo = App.store && App.store.canUndo && App.store.canUndo();
    var canRedo = App.store && App.store.canRedo && App.store.canRedo();
    var undoLabel = (App.store && App.store.undoLabel && App.store.undoLabel()) || '';
    return '<button class="stage-action" data-stage-action="undo"' + (canUndo ? '' : ' disabled') + ' title="Deshacer' + (undoLabel ? ': ' + esc(undoLabel) : '') + ' (Ctrl+Z)">' + icon('undo', 14) + 'Deshacer</button>' +
      '<button class="stage-action" data-stage-action="redo"' + (canRedo ? '' : ' disabled') + ' title="Rehacer (Ctrl+Y)">' + icon('redo', 14) + 'Rehacer</button>';
  }

  function updateStageActions() {
    var wrap = $('#stageActions');
    if (!wrap) return;
    var html = '';
    if (App.view === '2d') {
      if (App.viewMode !== 'plan') {
        var isSection = App.viewMode === 'sectionX' || App.viewMode === 'sectionY';
        html = '<span class="stage-note">Vista generada · clic para editar</span>' +
          (isSection
            ? '<label class="stage-range">Posición <input type="range" id="sectionPos" min="5" max="95" step="1" value="' + App.sectionPosPct + '"></label>'
            : '') +
          '<button class="stage-action" data-stage-action="fit-view">' + icon('fit', 14) + 'Ajustar</button>' +
          '<button class="stage-action" data-stage-action="view-edit-plan">' + icon('wall', 14) + 'Editar en planta</button>' +
          '<button class="stage-action" data-stage-action="view-plan">' + icon('wall', 14) + 'Volver a planta</button>' +
          stageHistoryHtml();
      } else {
        html = '<button class="stage-action" data-stage-action="detect-rooms">' + icon('sparkle', 14) + 'Detectar ambientes</button>' +
          '<button class="stage-action" data-stage-action="auto-dims">' + icon('measure', 14) + 'Cotas generales</button>' +
          '<button class="stage-action" data-stage-action="grid">' + icon('grid', 14) + 'Rejilla</button>' +
          '<button class="stage-action" data-stage-action="roof-design">' + icon('roof', 14) + 'Diseñar techo</button>' +
          '<button class="stage-action" data-stage-action="new-level">' + icon('plus', 14) + 'Añadir planta</button>' +
          stageHistoryHtml();
      }
    } else if (App.view === '3d') {
      html = '<div class="stage-action-group">' +
        ['iso', 'top', 'front', 'rear', 'right', 'left'].map(function (p) {
          return '<button class="stage-action' + (App.preset3d === p ? ' active' : '') + '" data-preset="' + p + '">' +
            ({ iso: 'Iso', top: 'Planta', front: 'Frente', rear: 'Post.', right: 'Der.', left: 'Izq.' }[p]) + '</button>';
        }).join('') + '</div>' +
        '<button class="stage-action" data-stage-action="fit3d">' + icon('fit', 14) + 'Encuadrar</button>' +
        '<button class="stage-action' + (sceneSettings().render.mode === 'realistic' ? ' active' : '') + '" data-stage-action="realistic">' + icon('sun', 14) + 'Realista</button>' +
        '<button class="stage-action' + (App.flight ? ' active flight' : '') + '" data-stage-action="flight">' + icon('drone', 14) + (App.flight ? 'Detener vuelo' : 'Vuelo dron') + '</button>' +
        '<button class="stage-action" data-stage-action="scene">' + icon('palette', 14) + 'Escena</button>' +
        '<button class="stage-action" data-stage-action="capture3d">' + icon('camera', 14) + 'Captura</button>';
    } else {
      html = '<button class="stage-action" data-stage-action="new-sheet">' + icon('plus', 14) + 'Nueva lámina</button>' +
        '<button class="stage-action" data-stage-action="refresh-sheets">' + icon('rotate', 14) + 'Actualizar vistas</button>' +
        '<button class="stage-action" data-stage-action="export-pdf">' + icon('pdf', 14) + 'Exportar PDF</button>' +
        stageHistoryHtml();
    }
    wrap.innerHTML = html;
    localize();
  }

  function stageToggle(key, label, ic) {
    return '<button class="stage-action' + (App.options3d[key] ? ' active' : '') + '" data-toggle3d="' + key + '">' +
      icon(ic, 14) + label + '</button>';
  }

  function onStageAction(e) {
    var preset = e.target.closest('[data-preset]');
    if (preset) {
      App.preset3d = preset.getAttribute('data-preset');
      updateStageActions();
      if (App.view3d && App.view3d.setPreset) {
        try { App.view3d.setPreset(App.preset3d); App.view3d.render(); } catch (err) { console.error(err); }
      }
      return;
    }
    var levelsBtn = e.target.closest('[data-3d-levels]');
    if (levelsBtn) {
      App.options3d.levels = App.options3d.levels === 'active' ? 'all' : 'active';
      if (App.view3d && App.view3d.setLevelFilter) {
        try { App.view3d.setLevelFilter(App.options3d.levels); } catch (err) { console.error(err); }
      }
      if (App.view3d && App.view3d.render) {
        try { App.view3d.render(); } catch (err) { console.error(err); }
      }
      updateStageActions();
      return;
    }
    var toggle = e.target.closest('[data-toggle3d]');
    if (toggle) {
      var key = toggle.getAttribute('data-toggle3d');
      var patch = {}; patch[key] = !App.options3d[key];
      apply3DOptions(patch);
      return;
    }
    var btn = e.target.closest('[data-stage-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-stage-action');
    if (action === 'undo') { if (App.store.undo()) afterHistory('Deshacer'); return; }
    if (action === 'redo') { if (App.store.redo()) afterHistory('Rehacer'); return; }
    if (action === 'new-level') { showLevelModal(); return; }
    if (action === 'realistic') { toggleRealistic(); return; }
    if (action === 'flight') { setFlight(!App.flight); return; }
    if (action === 'scene') { applyInspectorState('open'); setInspectorTab('scene'); return; }
    if (action === 'fit-view') { fitActiveView(); return; }
    if (action === 'view-plan') { setViewMode('plan'); return; }
    if (action === 'view-edit-plan') {
      setViewMode('plan');
      toast('Edita el objeto seleccionado con todas las herramientas de planta.', 'info', 2600);
      return;
    }
    if (action === 'roof-design') { openRoofDesigner(); return; }
    if (action === 'detect-rooms') {
      var count = App.editor.detectRooms();
      if (count) { toast(count + ' ambiente' + (count === 1 ? '' : 's') + ' detectado' + (count === 1 ? '' : 's') + '.', 'success', 3000); refreshProps(); }
      else toast('No se encontraron recintos nuevos. Cierra los muros y vuelve a intentar.', 'warn', 3400);
    } else if (action === 'auto-dims') addAutoDims();
    else if (action === 'grid') showGridDialog();
    else if (action === 'fit') { fitActiveView(); }
    else if (action === 'fit3d') { if (App.view3d && App.view3d.fit) App.view3d.fit(); if (App.view3d) App.view3d.render(); }
    else if (action === 'capture3d') capture3D();
    else if (action === 'refresh-sheets') {
      ensureSheetImages(true);
      renderSheets();
      toast('Vistas de las láminas actualizadas.', 'success', 2200);
    }
    else if (action === 'new-sheet') addSheet();
    else if (action === 'export-pdf') exportPDF();
  }

  function addAutoDims() {
    var walls = App.store.walls();
    if (!walls.length) { toast('Dibuja muros antes de generar cotas.', 'warn'); return; }
    var pts = [];
    walls.forEach(function (w) { pts = pts.concat(ED.Geo.wallPolygon(w, true)); });
    var b = ED.Geo.bounds(pts);
    if (b.w < 500 || b.h < 500) { toast('El plano es demasiado pequeño para acotarlo.', 'warn'); return; }
    var added = 0;
    App.store.act('Generar cotas generales', function () {
      var dims = App.store.project.dims;
      function exists(ax, ay, bx, by) {
        return dims.some(function (d) {
          return d.level === App.store.activeLevel &&
            Math.abs(d.a.x - ax) < 5 && Math.abs(d.a.y - ay) < 5 &&
            Math.abs(d.b.x - bx) < 5 && Math.abs(d.b.y - by) < 5;
        });
      }
      function addDim(a, b2, off) {
        if (exists(a.x, a.y, b2.x, b2.y)) return;
        dims.push({
          id: App.store.newId('d'), type: 'dim', level: App.store.activeLevel, layerId: 'dimensions',
          a: { x: a.x, y: a.y }, b: { x: b2.x, y: b2.y }, offset: off
        });
        added++;
      }
      addDim({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, -800);
      addDim({ x: b.minX, y: b.minY }, { x: b.minX, y: b.maxY }, 800);
    });
    if (added) { toast(added + ' cota' + (added === 1 ? '' : 's') + ' general' + (added === 1 ? '' : 'es') + ' añadida' + (added === 1 ? '' : 's') + '.', 'success', 2600); refreshProps(); }
    else toast('Las cotas generales ya existen.', 'info', 2400);
  }

  // ================================================================== archivo
  function downloadProject() {
    try {
      App.store.saveLocal();
      var blob = new Blob([App.store.exportJSON()], { type: 'application/json' });
      downloadBlob(blob, safeName(App.store.project.meta.name) + '.json');
      setSaveState('saved');
      toast('Proyecto descargado como .json', 'success', 3000);
    } catch (e) {
      console.error(e);
      toast('No se pudo descargar el proyecto.', 'error');
    }
  }

  function openFile(file) {
    if (!file) return;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'json' && ext !== 'engdraft') {
      toast('Formato no compatible. Abre un archivo .engdraft o .json.', 'error', 3800);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        App.store.importJSON(String(reader.result));
        App.selectedSheetId = App.store.project.sheets.length ? App.store.project.sheets[0].id : null;
        applyGridToEditor();
        App.editor.fitToContent();
        refreshHeader();
        refreshLevelTabs();
        refreshUndo();
        refreshProps();
        refreshLayers();
        if (App.view === '3d' && App.view3d) { if (App.view3d.fit) App.view3d.fit(); App.view3d.render(); }
        if (App.view === 'sheets') renderSheets();
        toast('Proyecto abierto: ' + App.store.project.meta.name, 'success', 3200);
        setSaveState('saved');
      } catch (e) {
        console.error(e);
        toast('No se pudo abrir: ' + (e.message || 'archivo inválido'), 'error', 4400);
      }
    };
    reader.onerror = function () { toast('No se pudo leer el archivo.', 'error'); };
    reader.readAsText(file);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function showDXFModal() {
    var body = '<p class="help-copy" style="margin-top:0">Se generará un archivo <strong>DXF ASCII R12</strong> en milímetros, compatible con AutoCAD, LibreCAD, BricsCAD y otros programas CAD. AutoCAD puede guardarlo como <strong>.dwg</strong> nativo.</p>' +
      '<div class="modal-note">' + icon('info', 15) + '<div>El navegador no puede escribir el formato binario propietario <strong>.dwg</strong>. El DXF es el formato de intercambio estándar de AutoCAD y conserva muros, aberturas, mobiliario y capas.</div></div>' +
      '<div class="form-grid" style="margin-top:14px"><div class="field full"><label>Niveles a exportar</label>' +
      '<label class="check-row"><input type="radio" name="dxflevels" value="active" checked> Solo el nivel activo (' + esc(App.store.activeLevelObj().name) + ')</label>' +
      '<label class="check-row"><input type="radio" name="dxflevels" value="all"> Todos los niveles, uno al lado del otro</label></div></div>';
    var footer = '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="dxfGo">Exportar DXF</button>';
    var m = openModal({ title: 'Exportar DWG / DXF', subtitle: 'Planos editables para AutoCAD', body: body, footer: footer, narrow: true });
    var btn = $('#dxfGo', m.root);
    btn.addEventListener('click', function () {
      var mode = ($('input[name="dxflevels"]:checked', m.root) || {}).value || 'active';
      try {
        ED.DXF.download(App.store.project, { levels: mode === 'all' ? 'all' : 'active', levelId: App.store.activeLevel });
        toast('DXF exportado. Ábrelo en AutoCAD y guarda como DWG.', 'success', 4200);
        m.close();
      } catch (e) {
        console.error(e);
        toast('Error al exportar DXF.', 'error');
      }
    });
  }

  // ================================================================== modales base
  function openModal(opts) {
    var root = $('#modalRoot');
    App.modalOpen = true;
    var widthClass = opts.wide ? ' modal-wide' : (opts.narrow ? ' modal-narrow' : '');
    root.innerHTML = '<div class="modal-backdrop"><div class="modal' + widthClass + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><div><h2>' + esc(opts.title || '') + '</h2>' +
      (opts.subtitle ? '<p>' + esc(opts.subtitle) + '</p>' : '') + '</div>' +
      '<button class="modal-close" data-close aria-label="Cerrar">' + icon('close', 16) + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') + '</div></div>';
    var backdrop = root.firstElementChild;
    var api = {
      root: root,
      close: closeModal
    };
    backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop) closeModal(); });
    $$('[data-close]', root).forEach(function (b) { b.addEventListener('click', closeModal); });
    if (opts.onMount) {
      try { opts.onMount(api); } catch (e) { console.error(e); }
    }
    setTimeout(function () {
      var auto = root.querySelector('[autofocus], input, select, textarea');
      if (auto && !opts.noAutoFocus) { try { auto.focus(); if (auto.select) auto.select(); } catch (e) { /* ignore */ } }
    }, 40);
    return api;
  }

  function closeModal() {
    var root = $('#modalRoot');
    if (!root) return;
    root.innerHTML = '';
    App.modalOpen = false;
  }

  function toast(message, type, duration) {
    var root = $('#toastRoot');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = message;
    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstElementChild);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 190);
    }, duration || 3000);
  }

  // ================================================================== paneles
  function setInspectorTab(tab) {
    if (App.view === 'sheets' && tab !== 'props') tab = 'props';
    App.tab = tab;
    $$('#inspectorTabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    var panels = { props: 'Props', library: 'Library', layers: 'Layers', scene: 'Scene' };
    $$('.inspector-body .panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel' + (panels[tab] || 'Props'));
    });
    if (tab === 'library') renderLibrary();
    else if (tab === 'layers') refreshLayers();
    else if (tab === 'scene') renderScenePanel();
    else refreshProps();
  }

  function refreshProps() {
    if (!App.store) return;
    if (App.tab !== 'props') return;
    if (App.view === 'sheets') { renderSheetProps(); return; }
    if (App.viewMode !== 'plan' && App.viewSelection) { renderViewSelectionProps(); return; }
    var selected = App.store.getSelectionObjects();
    if (selected.length === 1) renderEntityProps(selected[0]);
    else if (selected.length > 1) renderMultiProps(selected);
    else renderProjectSummary();
    localize();
  }

  function renderProjectSummary() {
    var panel = $('#panelProps');
    if (!panel) return;
    var p = App.store.project;
    var stats = App.store.stats();
    var all = App.store.allStats();
    var level = App.store.activeLevelObj();
    var started = App.store.walls().length > 0;
    var hero = '<div class="hero-card">' +
      '<div class="eyebrow">Proyecto activo</div>' +
      '<h3>' + esc(p.meta.name || 'Proyecto sin nombre') + '</h3>' +
      '<p>' + (p.meta.location ? esc(p.meta.location) : 'Sin ubicación definida') + '</p>' +
      '<div class="hero-actions">' +
      '<button class="btn btn-ghost btn-sm" data-action="project-info">' + icon('info', 13) + 'Datos</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="detect-rooms">' + icon('sparkle', 13) + 'Ambientes</button>' +
      '</div></div>';
    var statsHtml = '<div class="section"><div class="section-title">Planta activa <span class="count">' + esc(level.name) + '</span></div>' +
      '<div class="stats-grid">' +
      '<div class="stat"><div class="v">' + fnum(areaValue(stats.roomArea), 2) + '<small>' + ED.Geo.unitAreaLabel(unitSys()) + '</small></div><div class="l">Área de ambientes</div></div>' +
      '<div class="stat"><div class="v">' + stats.roomCount + '</div><div class="l">Ambientes</div></div>' +
      '<div class="stat"><div class="v">' + fnum(lengthValue(stats.wallLength), 2) + '<small>' + unitLenLabel() + '</small></div><div class="l">Longitud de muros</div></div>' +
      '<div class="stat"><div class="v">' + stats.itemCount + '</div><div class="l">Muebles</div></div>' +
      '</div></div>';
    var projectStats = '<div class="section"><div class="section-title">Proyecto completo</div>' +
      '<div class="read-line"><span>Superficie construida</span><strong>' + unitArea(all.roomArea) + '</strong></div>' +
      '<div class="read-line"><span>Ambientes registrados</span><strong>' + all.rooms + '</strong></div>' +
      '<div class="read-line"><span>Mobiliario total</span><strong>' + all.items + '</strong></div>' +
      '<div class="read-line"><span>Láminas del juego</span><strong>' + p.sheets.length + '</strong></div>' +
      '<div class="read-line"><span>Plantas</span><strong>' + p.levels.length + '</strong></div></div>';
    var tips = !started ?
      '<div class="section"><div class="section-title">Primeros pasos</div><div class="tips-list">' +
      '<div class="tip-row"><span class="n">1</span><span>Activa <strong>Muro</strong> y dibuja el perímetro con clics. Pulsa Esc para terminar.</span></div>' +
      '<div class="tip-row"><span class="n">2</span><span>Inserta <strong>puertas y ventanas</strong> haciendo clic sobre un muro.</span></div>' +
      '<div class="tip-row"><span class="n">3</span><span>Cierra los recintos y usa <strong>Detectar ambientes</strong> para etiquetarlos con su área.</span></div>' +
      '<div class="tip-row"><span class="n">4</span><span>Amuebla desde la <strong>Biblioteca</strong> y revisa la vista 3D.</span></div>' +
      '</div></div>' :
      '<div class="section"><div class="section-title">Sugerencias</div><div class="tips-list">' +
      '<div class="tip-row"><span class="n">1</span><span>Haz clic en un muro para ajustar espesor, altura y aberturas.</span></div>' +
      '<div class="tip-row"><span class="n">2</span><span>Usa <strong>Cotas generales</strong> para acotar el perímetro.</span></div>' +
      '<div class="tip-row"><span class="n">3</span><span>Revisa la <strong>Vista 3D</strong> y captura una imagen para tus láminas.</span></div>' +
      '<div class="tip-row"><span class="n">4</span><span>Exporta el juego de planos a PDF vectorial desde la barra superior.</span></div>' +
      '</div></div>';
    panel.innerHTML = hero + statsHtml + projectStats + tips;
  }

  function entityIcon(kind) {
    return { wall: 'wall', item: 'furniture', room: 'room', text: 'text', dim: 'dim', line: 'line' }[kind] || 'info';
  }
  function kindLabel(kind) {
    return { wall: 'Muro', item: 'Mobiliario', room: 'Ambiente', text: 'Texto', dim: 'Cota', line: 'Línea / curva' }[kind] || 'Objeto';
  }
  function levelName(id) {
    var name = id;
    App.store.levels().forEach(function (l) { if (l.id === id) name = l.name; });
    return name;
  }

  function renderEntityProps(sel) {
    var panel = $('#panelProps');
    var obj = sel.obj;
    var kind = sel.kind;
    var layer = App.store.getLayer(obj.layerId || '');
    var body = '';
    var title = kindLabel(kind);
    var sub = '';

    if (kind === 'wall') {
      var len = ED.Geo.wallLength(obj);
      var sizeU = unitSizeLabel();
      sub = unitLen(len) + ' · ' + unitSizeInput(obj.thickness) + ' ' + sizeU + (ED.Geo.wallIsCurved(obj) ? ' · curvo' : '');
      var curved = ED.Geo.wallIsCurved(obj);
      var curveSection = '';
      if (curved) {
        var chord = ED.Geo.dist(obj.a, obj.b);
        var arrow = Math.abs(obj.curve.bulge || 0) * chord / 2;
        curveSection = '<div class="section"><div class="section-title">Curvatura <span class="count">' +
          (obj.curve.type === 'arc' ? 'Arco' : 'Spline') + '</span></div>' +
          '<div class="read-line"><span>Directriz</span><strong>' +
          (obj.curve.type === 'arc'
            ? 'Arco de ' + fnum(ED.Geo.radToDeg(4 * Math.atan(obj.curve.bulge || 0)), 1) + '°'
            : (obj.curve.pts || []).length + ' punto(s)') +
          '</strong></div>' +
          '<div class="read-line"><span>Flecha</span><strong>' + unitLen(arrow) + '</strong></div>' +
          '<div class="read-line"><span>Cuerda</span><strong>' + unitLen(chord) + '</strong></div>' +
          (obj.curve.type === 'arc'
            ? field('Flecha del arco', '<div class="input-row"><input class="input" type="number" min="0" step="0.05" data-entity="wall" data-id="' + esc(obj.id) + '" data-field="bulge" value="' + unitLenInput(arrow) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
              '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="flip-curve" data-id="' + esc(obj.id) + '">' + icon('rotate', 12) + 'Invertir arco</button></div>'
            : '') +
          '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="straighten-wall" data-id="' + esc(obj.id) + '">' + icon('wall', 12) + 'Quitar curva</button></div>' +
          '<div class="field-hint">Los muros curvos no admiten puertas ni ventanas en esta versión.</div></div>';
      }
      var openHtml = (obj.openings || []).map(function (o) {
        var typeLabel = o.type === 'window' ? 'Ventana' : o.type === 'garage' ? 'Portón' : o.type === 'pass' ? 'Paso' : 'Puerta';
        var actions = '';
        if (o.type === 'door' || o.type === 'garage') {
          actions = '<div class="add-opening-row" style="margin-top:7px">' +
            '<button class="btn btn-ghost btn-sm" data-action="flip-opening" data-wall="' + esc(obj.id) + '" data-opening="' + esc(o.id) + '" data-open-prop="swing" title="Cambiar el lado hacia el que abre la hoja">' + icon('rotate', 12) + 'Girar hoja</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="flip-opening" data-wall="' + esc(obj.id) + '" data-opening="' + esc(o.id) + '" data-open-prop="hinge" title="Cambiar el lado de la bisagra">' + icon('duplicate', 12) + 'Invertir bisagra</button></div>';
        } else {
          actions = '<div class="field" style="margin:6px 0 0"><label>Antepecho</label><div class="input-row"><input class="input" type="number" min="0" step="50" data-opening="' + esc(o.id) + '" data-wall="' + esc(obj.id) + '" data-open-field="sill" value="' + unitSizeInput(o.sill || 0) + '"><span class="input-unit">' + esc(sizeU) + '</span></div></div>';
        }
        var subOptions = (OPENING_SUBTYPES[o.type] || []).map(function (pair) {
          return '<option value="' + pair[0] + '"' + ((o.subtype || OPENING_SUBTYPE_DEFAULT[o.type]) === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
        }).join('');
        var subSelect = subOptions
          ? '<div class="field" style="margin:6px 0 0"><label>Tipo de hoja / ventana</label><select class="select" data-opening="' + esc(o.id) + '" data-wall="' + esc(obj.id) + '" data-open-field="subtype">' + subOptions + '</select></div>'
          : '';
        return '<div class="opening-row">' +
          '<div class="opening-head"><strong><span class="dot"></span>' + typeLabel +
          ' <span class="badge-soft">' + unitSizeInput(o.width) + ' ' + esc(sizeU) + '</span></strong>' +
          '<button class="icon-mini" data-action="delete-opening" data-wall="' + esc(obj.id) + '" data-opening="' + esc(o.id) + '" title="Eliminar abertura">' + icon('trash', 12) + '</button></div>' +
          '<div class="mini-grid" style="grid-template-columns:1fr 1fr 1fr">' +
          '<input class="input" type="number" min="300" step="50" title="Ancho (' + sizeU + ')" data-opening="' + esc(o.id) + '" data-wall="' + esc(obj.id) + '" data-open-field="width" value="' + unitSizeInput(o.width) + '">' +
          '<input class="input" type="number" min="300" step="50" title="Alto (' + sizeU + ')" data-opening="' + esc(o.id) + '" data-wall="' + esc(obj.id) + '" data-open-field="height" value="' + unitSizeInput(o.height) + '">' +
          '<input class="input" type="number" min="0" max="100" step="1" title="Posición (%)" data-opening="' + esc(o.id) + '" data-wall="' + esc(obj.id) + '" data-open-field="t" value="' + fnum(o.t * 100, 1) + '">' +
          '</div><div class="opening-meta">Ancho · alto (' + sizeU + ') · posición (%)</div>' + subSelect + actions + '</div>';
      }).join('');
      body =
        '<div class="section"><div class="section-title">Geometría</div><div class="field-grid">' +
        field('Longitud', '<div class="input-row"><input class="input" type="number" min="0.2" step="0.05" data-entity="wall" data-id="' + esc(obj.id) + '" data-field="length" value="' + unitLenInput(len) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
        field('Espesor', '<div class="input-row"><input class="input" type="number" min="80" max="400" step="10" data-entity="wall" data-id="' + esc(obj.id) + '" data-field="thickness" value="' + unitSizeInput(obj.thickness) + '"><span class="input-unit">' + sizeU + '</span></div>') +
        field('Altura', '<div class="input-row"><input class="input" type="number" min="2000" max="4000" step="50" data-entity="wall" data-id="' + esc(obj.id) + '" data-field="height" value="' + unitSizeInput(obj.height) + '"><span class="input-unit">' + sizeU + '</span></div>') +
        field('Ángulo', '<input class="input" readonly value="' + fnum(ED.Geo.radToDeg(ED.Geo.wallAngle(obj)), 1) + '°">') +
        '</div></div>' +
        curveSection +
        (curved
          ? '<div class="section"><div class="section-title">Aberturas</div><div class="empty-note">Un muro curvo no admite puertas ni ventanas en esta versión.</div></div>'
          : '<div class="section"><div class="section-title">Aberturas <span class="count">' + (obj.openings || []).length + '</span></div>' +
            (openHtml || '<div class="empty-note">Este muro no tiene puertas ni ventanas.</div>') +
            '<div class="add-opening-row"><button class="btn btn-ghost btn-sm" data-action="add-opening" data-wall="' + esc(obj.id) + '" data-type="door">' + icon('door', 12) + 'Puerta</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="add-opening" data-wall="' + esc(obj.id) + '" data-type="window">' + icon('window', 12) + 'Ventana</button></div></div>') +
        '<div class="section"><div class="section-title">Ubicación</div>' +
        readLine('Nivel', levelName(obj.level)) + readLine('Capa', layer.name) +
        readLine('Inicio', 'X ' + unitLen(obj.a.x) + ' · Y ' + unitLen(obj.a.y)) +
        readLine('Fin', 'X ' + unitLen(obj.b.x) + ' · Y ' + unitLen(obj.b.y)) + '</div>' +
        '<div class="section"><div class="section-title">Acabado en 3D</div>' +
        '<div class="field-hint">El color y la textura de paredes, techo y suelo se definen para todo el proyecto en la escena 3D.</div>' +
        '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="scene-materials">' + icon('palette', 12) + 'Colores de paredes y techo</button></div></div>' +
        actionsHtml('wall', obj.id, false);
    } else if (kind === 'item') {
      var def = ED.Library && ED.Library.get ? ED.Library.get(obj.libId) : null;
      sub = (def ? def.name : obj.libId) + ' · ' + unitSizeInput(obj.w) + ' × ' + unitSizeInput(obj.d) + ' ' + unitSizeLabel();
      body =
        '<div class="section"><div class="field"><label>Nombre</label><input class="input" data-entity="item" data-id="' + esc(obj.id) + '" data-field="name" value="' + esc(obj.name || (def && def.name) || '') + '"></div></div>' +
        '<div class="section"><div class="section-title">Posición y giro</div><div class="field-grid">' +
        field('X', '<div class="input-row"><input class="input" type="number" step="0.05" data-entity="item" data-id="' + esc(obj.id) + '" data-field="x" value="' + unitLenInput(obj.x) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
        field('Y', '<div class="input-row"><input class="input" type="number" step="0.05" data-entity="item" data-id="' + esc(obj.id) + '" data-field="y" value="' + unitLenInput(obj.y) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
        field('Rotación', '<div class="input-row"><input class="input" type="number" step="1" data-entity="item" data-id="' + esc(obj.id) + '" data-field="rotation" value="' + fnum(obj.rotation, 1) + '"><span class="input-unit">°</span></div>') +
        field('Nivel', '<input class="input" readonly value="' + esc(levelName(obj.level)) + '">') +
        '</div></div>' +
        '<div class="section"><div class="section-title">Dimensiones</div>' +
        readLine('Ancho', unitLen(obj.w)) + readLine('Fondo', unitLen(obj.d)) + readLine('Alto', unitLen(obj.h)) +
        readLine('Capa', layer.name) + '</div>' +
        '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="rotate-item" data-id="' + esc(obj.id) + '" data-dir="-1">' + icon('rotate', 12) + '−90°</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="rotate-item" data-id="' + esc(obj.id) + '" data-dir="1">' + icon('rotate', 12) + '+90°</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="duplicate-item" data-id="' + esc(obj.id) + '">' + icon('duplicate', 12) + 'Duplicar</button></div>' +
        actionsHtml('item', obj.id, false);
    } else if (kind === 'room') {
      var area = ED.Geo.polygonArea(obj.polygon);
      sub = unitArea(area) + ' · ' + obj.polygon.length + ' vértices';
      var finishes = [['wood', 'Madera'], ['tile', 'Baldosa'], ['carpet', 'Alfombra'], ['marble', 'Mármol'], ['concrete', 'Concreto'], ['grass', 'Césped']];
      body =
        '<div class="section"><div class="field"><label>Nombre del ambiente</label><input class="input" data-entity="room" data-id="' + esc(obj.id) + '" data-field="name" value="' + esc(obj.name || '') + '"></div>' +
        '<div class="field-grid">' +
        field('Acabado', '<select class="select" data-entity="room" data-id="' + esc(obj.id) + '" data-field="finish">' +
          finishes.map(function (x) { return '<option value="' + x[0] + '"' + (obj.finish === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>') +
        field('Color', '<div class="color-row"><input type="color" data-entity="room" data-id="' + esc(obj.id) + '" data-field="color" value="' + esc(obj.color || '#e9e1d1') + '"></div>') +
        '</div></div>' +
        '<div class="section"><div class="section-title">Superficie</div>' +
        readLine('Área', unitArea(area)) + readLine('Perímetro', unitLen(ED.Geo.polygonPerimeter(obj.polygon))) +
        readLine('Nivel', levelName(obj.level)) + readLine('Capa', layer.name) + '</div>' +
        actionsHtml('room', obj.id, false);
    } else if (kind === 'text') {
      sub = 'Anotación · ' + unitSizeInput(obj.size) + ' ' + unitSizeLabel();
      body =
        '<div class="section"><div class="field"><label>Texto</label><textarea class="textarea" data-entity="text" data-id="' + esc(obj.id) + '" data-field="text">' + esc(obj.text || '') + '</textarea></div>' +
        '<div class="field-grid">' +
        field('Tamaño', '<div class="input-row"><input class="input" type="number" min="100" max="1200" step="50" data-entity="text" data-id="' + esc(obj.id) + '" data-field="size" value="' + unitSizeInput(obj.size) + '"><span class="input-unit">' + unitSizeLabel() + '</span></div>') +
        field('Rotación', '<div class="input-row"><input class="input" type="number" step="1" data-entity="text" data-id="' + esc(obj.id) + '" data-field="rotation" value="' + fnum(obj.rotation, 1) + '"><span class="input-unit">°</span></div>') +
        '</div></div>' +
        '<div class="section"><div class="section-title">Ubicación</div>' + readLine('X', unitLen(obj.x)) + readLine('Y', unitLen(obj.y)) + readLine('Capa', layer.name) + '</div>' +
        actionsHtml('text', obj.id, false);
    } else if (kind === 'dim') {
      var dlen = ED.Geo.dist(obj.a, obj.b);
      sub = unitLen(dlen);
      body =
        '<div class="section"><div class="field-grid">' +
        field('Distancia', '<input class="input" readonly value="' + unitLen(dlen) + '">') +
        field('Separación', '<div class="input-row"><input class="input" type="number" step="0.05" data-entity="dim" data-id="' + esc(obj.id) + '" data-field="offset" value="' + unitLenInput(obj.offset) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
        '</div><div class="field"><label>Texto personalizado (opcional)</label><input class="input" data-entity="dim" data-id="' + esc(obj.id) + '" data-field="text" value="' + esc(obj.text || '') + '" placeholder="Automático"></div></div>' +
        '<div class="section"><div class="section-title">Ubicación</div>' + readLine('Nivel', levelName(obj.level)) + readLine('Capa', layer.name) + '</div>' +
        actionsHtml('dim', obj.id, false);
    } else if (kind === 'line') {
      var llen = ED.Geo.dist(obj.a, obj.b);
      var isCurve = obj.type === 'curve' && obj.curve;
      sub = (isCurve ? 'Curva' : 'Línea') + ' · ' + unitLen(llen) + (isCurve && obj.curve.type === 'arc' ? ' · arco' : '');
      var styleOpts = [['solid', 'Continua'], ['dash', 'Discontinua'], ['dot', 'Punteada']].map(function (x) {
        return '<option value="' + x[0] + '"' + ((obj.style || 'solid') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('');
      body = '<div class="section"><div class="section-title">Geometría</div><div class="field-grid">' +
        field('Longitud', '<div class="input-row"><input class="input" type="number" min="0.01" step="0.05" data-entity="line" data-id="' + esc(obj.id) + '" data-field="length" value="' + unitLenInput(llen) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
        field('Ángulo', '<input class="input" readonly value="' + fnum(ED.Geo.radToDeg(Math.atan2(obj.b.y - obj.a.y, obj.b.x - obj.a.x)), 1) + '°">') +
        field('Grosor', '<div class="input-row"><input class="input" type="number" min="5" max="300" step="5" data-entity="line" data-id="' + esc(obj.id) + '" data-field="width" value="' + fnum(obj.width, 0) + '"><span class="input-unit">mm</span></div>') +
        field('Estilo', '<select class="select" data-entity="line" data-id="' + esc(obj.id) + '" data-field="style">' + styleOpts + '</select>') +
        '</div></div>' +
        (isCurve && obj.curve.type === 'arc' ? '<div class="section"><div class="section-title">Curvatura</div>' +
          '<div class="read-line"><span>Flecha</span><strong>' + unitLen(Math.abs(obj.curve.bulge || 0) * llen / 2) + '</strong></div>' +
          '<div class="field"><label>Color</label><div class="color-row"><input type="color" data-entity="line" data-id="' + esc(obj.id) + '" data-field="color" value="' + esc(obj.color || '#3f6f86') + '"></div></div>' +
          '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="flip-line-curve" data-id="' + esc(obj.id) + '">' + icon('rotate', 12) + 'Invertir curva</button></div></div>' :
          '<div class="section"><div class="field"><label>Color</label><div class="color-row"><input type="color" data-entity="line" data-id="' + esc(obj.id) + '" data-field="color" value="' + esc(obj.color || '#3f6f86') + '"></div></div></div>') +
        '<div class="section"><div class="section-title">Ubicación</div>' + readLine('Nivel', levelName(obj.level)) + readLine('Capa', layer.name) + readLine('Inicio', 'X ' + unitLen(obj.a.x) + ' · Y ' + unitLen(obj.a.y)) + readLine('Fin', 'X ' + unitLen(obj.b.x) + ' · Y ' + unitLen(obj.b.y)) + '</div>' +
        actionsHtml('line', obj.id, false);
    }

    panel.innerHTML = '<div class="entity-head"><div class="entity-icon">' + icon(entityIcon(kind), 17) + '</div><div><h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p></div></div>' + body;
  }

  function field(label, control) {
    return '<div class="field"><label>' + label + '</label>' + control + '</div>';
  }
  function readLine(label, value) {
    return '<div class="read-line"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
  }
  function actionsHtml(kind, id, withDuplicate) {
    return '<div class="prop-actions">' +
      (withDuplicate ? '<button class="btn btn-ghost btn-sm" data-action="duplicate-item" data-id="' + esc(id) + '">' + icon('duplicate', 12) + 'Duplicar</button>' : '') +
      '<button class="btn btn-danger btn-sm" data-action="delete-selection">' + icon('trash', 12) + 'Eliminar ' + (kind === 'wall' ? 'muro' : kind === 'item' ? 'mueble' : kind === 'room' ? 'ambiente' : kind === 'text' ? 'texto' : kind === 'line' ? 'línea' : 'cota') + '</button></div>';
  }

  function renderMultiProps(selected) {
    var names = selected.map(function (s) {
      return kindLabel(s.kind) + ': ' + ((s.obj.name || s.obj.text || s.obj.id) + '').slice(0, 38);
    });
    $('#panelProps').innerHTML = '<div class="entity-head"><div class="entity-icon">' + icon('layers', 17) + '</div><div><h3>' + selected.length + ' objetos seleccionados</h3><p>Edición múltiple</p></div></div>' +
      '<div class="section"><div class="section-title">Selección</div>' +
      names.map(function (x) { return '<div class="read-line"><span>' + esc(x) + '</span></div>'; }).join('') + '</div>' +
      '<div class="prop-actions"><button class="btn btn-danger btn-sm" data-action="delete-selection">' + icon('trash', 12) + 'Eliminar selección</button></div>';
  }

  function renderSheetProps() {
    var panel = $('#panelProps');
    var sheet = getSelectedSheet();
    if (!sheet) {
      panel.innerHTML = '<div class="section"><div class="section-title">Láminas</div><div class="empty-note">Selecciona una lámina de la galería o crea una nueva.</div>' +
        '<div class="prop-actions"><button class="btn btn-primary btn-block" data-action="new-sheet">' + icon('plus', 13) + 'Nueva lámina</button></div></div>';
      return;
    }
    var sheetsMod = ED.Sheets || {};
    var sizes = Object.keys(sheetsMod.SIZES || { A4: 1, A3: 1, A2: 1, A1: 1, Letter: 1, Tabloid: 1 });
    var templates = sheetsMod.TEMPLATES || [{ id: 'modern', name: 'Moderna', desc: '' }, { id: 'classic', name: 'Clásica', desc: '' }, { id: 'technical', name: 'Técnica', desc: '' }, { id: 'municipal', name: 'Municipal', desc: '' }];
    var templateDesc = (templates.filter(function (t) { return t.id === sheet.template; })[0] || {}).desc || '';
    var levels = App.store.levels();
    var sub = (sheet.sheetNo || '') + ' · ' + (sheet.size || 'A3') + ' · ' + (sheet.orientation === 'portrait' ? 'Vertical' : 'Horizontal');
    var html = '<div class="entity-head"><div class="entity-icon">' + icon('sheet', 17) + '</div><div><h3>' + esc(sheet.name || 'Lámina') + '</h3><p>' + esc(sub) + '</p></div></div>';
    html += '<div class="section"><div class="section-title">Identificación</div>' +
      '<div class="field"><label>Nombre de la lámina</label><input class="input" data-sheet-field="name" value="' + esc(sheet.name || '') + '"></div>' +
      '<div class="field"><label>Título en el cajetín</label><input class="input" data-sheet-field="title" value="' + esc(sheet.title || '') + '"></div>' +
      '<div class="field-grid">' +
      field('Código', '<input class="input" data-sheet-field="sheetNo" value="' + esc(sheet.sheetNo || '') + '">') +
      field('Contenido', '<select class="select" data-sheet-field="content">' +
        [['plan', 'Planta del nivel'], ['notes', 'Notas y cuadros'], ['cover', 'Portada'], ['3d', 'Perspectiva 3D'],
          ['front', 'Fachada frontal'], ['rear', 'Fachada posterior'], ['right', 'Lateral derecha'], ['left', 'Lateral izquierda']].map(function (x) {
          return '<option value="' + x[0] + '"' + (sheet.content === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
        }).join('') + '</select>') +
      '</div></div>';
    html += '<div class="section"><div class="section-title">Formato</div><div class="field-grid">' +
      field('Tamaño', '<select class="select" data-sheet-field="size">' +
        sizes.map(function (s) { return '<option value="' + s + '"' + (sheet.size === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>') +
      field('Orientación', '<select class="select" data-sheet-field="orientation">' +
        '<option value="landscape"' + (sheet.orientation !== 'portrait' ? ' selected' : '') + '>Horizontal</option>' +
        '<option value="portrait"' + (sheet.orientation === 'portrait' ? ' selected' : '') + '>Vertical</option></select>') +
      field('Plantilla de cajetín', '<select class="select" data-sheet-field="template">' +
        templates.map(function (t) { return '<option value="' + t.id + '"' + (sheet.template === t.id ? ' selected' : '') + '>' + t.name + '</option>'; }).join('') + '</select>') +
      field('Escala', '<select class="select" data-sheet-field="scale">' +
        [50, 75, 100, 125, 150, 200, 250].map(function (s) { return '<option value="' + s + '"' + (Number(sheet.scale) === s ? ' selected' : '') + '>1:' + s + '</option>'; }).join('') + '</select>') +
      '</div><div class="field"><label>Nivel asociado</label><select class="select" data-sheet-field="levelId">' +
        levels.map(function (l) { return '<option value="' + esc(l.id) + '"' + (sheet.levelId === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="template-desc">' + esc(templateDesc) + '</div></div>';
    html += '<div class="section"><div class="section-title">Contenido</div>' +
      checkRow('showRooms', 'Nombres y áreas de ambientes', sheet.showRooms !== false) +
      checkRow('showFurniture', 'Mobiliario', sheet.showFurniture !== false) +
      checkRow('showDims', 'Cotas', sheet.showDims !== false) +
      '<div class="field" style="margin-top:8px"><label>Notas de la lámina</label><textarea class="textarea" data-sheet-field="notes" placeholder="Notas que aparecerán en la hoja...">' + esc(sheet.notes || '') + '</textarea></div>' +
      (isSheetImageContent(sheet.content) ? '<div class="modal-note" style="margin-top:8px">' + icon('camera', 15) + '<div>' +
        (sheet.imageDataUrl ? 'Vista generada automáticamente desde el proyecto.' : 'La vista se generará al abrir la lámina.') +
        ' Usa <strong>Actualizar vista</strong> si cambiaste el proyecto.</div></div>' : '') +
      '</div>';
    html += '<div class="section"><div class="section-title">Acciones</div><div class="prop-actions">' +
      (isSheetImageContent(sheet.content) ? '<button class="btn btn-ghost btn-sm" data-action="sheet-refresh-image">' + icon('rotate', 12) + 'Actualizar vista</button>' : '') +
      '<button class="btn btn-ghost btn-sm" data-action="sheet-export">' + icon('pdf', 12) + 'PDF de esta lámina</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="sheet-duplicate">' + icon('duplicate', 12) + 'Duplicar</button></div>' +
      '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-action="sheet-up">↑ Subir</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="sheet-down">↓ Bajar</button>' +
      '<button class="btn btn-danger btn-sm" data-action="sheet-delete">' + icon('trash', 12) + 'Eliminar</button></div>' +
      '<div class="prop-actions"><button class="btn btn-primary btn-block" data-action="new-sheet">' + icon('plus', 13) + 'Nueva lámina</button></div></div>';
    panel.innerHTML = html;
  }

  function checkRow(fieldName, label, checked) {
    return '<label class="check-row"><input type="checkbox" data-sheet-field="' + fieldName + '"' + (checked ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }

  // ================================================================== cambios de propiedades
  function onPropChange(e) {
    var target = e.target;
    if (!target || !target.matches) return;
    if (target.matches('[data-sheet-field]')) {
      var sheet = getSelectedSheet();
      if (!sheet) return;
      var sf = target.getAttribute('data-sheet-field');
      var sv = target.type === 'checkbox' ? target.checked : target.value;
      App.store.act('Editar lámina', function () {
        if (sf === 'scale') sheet.scale = Number(sv) || 100;
        else if (sf === 'showDims' || sf === 'showFurniture' || sf === 'showRooms' || sf === 'showGrid') sheet[sf] = !!sv;
        else if (sf === 'content') {
          var oldContent = sheet.content;
          var oldTitle = sheet.title || '';
          sheet.content = String(sv);
          if (!oldTitle || oldTitle === sheetDefaultTitle(oldContent)) {
            sheet.title = sheetDefaultTitle(sheet.content);
          }
          if (isSheetImageContent(sheet.content)) {
            sheet.imageDataUrl = null;
            sheet.imagePreset = null;
          }
        } else sheet[sf] = sv;
      });
      scheduleSheetPreviews(140);
      refreshProps();
      markSelectedSheet();
      return;
    }
    if (target.matches('[data-opening][data-wall]')) {
      var wall = App.store.find('wall', target.getAttribute('data-wall'));
      if (!wall) return;
      var op = null;
      (wall.openings || []).forEach(function (o) { if (o.id === target.getAttribute('data-opening')) op = o; });
      if (!op) return;
      var of = target.getAttribute('data-open-field');
      if (of === 'subtype') {
        var sub = String(target.value || '');
        if ((OPENING_SUBTYPES[op.type] || []).some(function (p) { return p[0] === sub; })) {
          App.store.act('Cambiar tipo de abertura', function () { op.subtype = sub; });
        }
        refreshProps();
        if (App.viewMode !== 'plan') renderViews();
        App.editor.render();
        return;
      }
      var ov = Number(target.value);
      if (!isFinite(ov)) return;
      App.store.act('Editar abertura', function () {
        var len = ED.Geo.wallLength(wall);
        if (of === 'width') {
          op.width = ED.Geo.clamp(parseSizeInput(ov), 300, Math.max(300, len - 100));
          var half = (op.width / 2) / len;
          op.t = ED.Geo.clamp(op.t, half, 1 - half);
        } else if (of === 'height') {
          op.height = ED.Geo.clamp(parseSizeInput(ov), 300, 3500);
        } else if (of === 'sill') {
          op.sill = Math.max(0, parseSizeInput(ov));
        } else if (of === 't') {
          var halfT = ((op.width || 900) / 2) / len;
          op.t = ED.Geo.clamp(ov / 100, halfT, 1 - halfT);
        }
      });
      refreshProps();
      if (App.viewMode !== 'plan') renderViews();
      return;
    }
    if (target.matches('[data-entity]')) {
      var kind = target.getAttribute('data-entity');
      var id = target.getAttribute('data-id');
      var obj = App.store.find(kind, id);
      if (!obj) return;
      var fieldName = target.getAttribute('data-field');
      var raw = target.type === 'checkbox' ? target.checked : target.value;
      applyEntityField(kind, obj, fieldName, raw);
      refreshProps();
      if (App.viewMode !== 'plan') renderViews();
    }
  }

  function applyEntityField(kind, obj, fieldName, raw) {
    var value = typeof raw === 'string' ? raw : raw;
    App.store.act('Editar ' + kindLabel(kind).toLowerCase(), function () {
      if (kind === 'wall') {
        if (fieldName === 'thickness') obj.thickness = ED.Geo.clamp(parseSizeInput(value), 80, 500);
        else if (fieldName === 'height') obj.height = ED.Geo.clamp(parseSizeInput(value), 2000, 4500);
        else if (fieldName === 'length') {
          var newLen = Math.max(100, parseLenInput(value));
          var ang = ED.Geo.wallAngle(obj);
          obj.b = ED.Geo.polar(obj.a, ang, newLen);
          (obj.openings || []).forEach(function (o) {
            var half = (o.width / 2) / newLen;
            o.t = ED.Geo.clamp(o.t, half, 1 - half);
          });
        } else if (fieldName === 'bulge') {
          if (!obj.curve || obj.curve.type !== 'arc') return;
          var chordLen = ED.Geo.dist(obj.a, obj.b);
          var arrowMm = Math.max(0, parseLenInput(value));
          if (arrowMm < 5) delete obj.curve;
          else obj.curve = { type: 'arc', bulge: ED.Geo.clamp(2 * arrowMm / Math.max(1, chordLen), 0.005, 4) };
        }
      } else if (kind === 'item') {
        if (fieldName === 'x') obj.x = parseLenInput(value);
        else if (fieldName === 'y') obj.y = parseLenInput(value);
        else if (fieldName === 'rotation') obj.rotation = ED.Geo.normDeg(n(value, 0));
        else if (fieldName === 'name') obj.name = String(value);
      } else if (kind === 'room') {
        if (fieldName === 'name') obj.name = String(value);
        else if (fieldName === 'finish') { obj.finish = String(value); obj.color = null; }
        else if (fieldName === 'color') obj.color = String(value);
      } else if (kind === 'text') {
        if (fieldName === 'text') obj.text = String(value);
        else if (fieldName === 'size') obj.size = ED.Geo.clamp(parseSizeInput(value), 60, 3000);
        else if (fieldName === 'rotation') obj.rotation = ED.Geo.normDeg(n(value, 0));
      } else if (kind === 'dim') {
        if (fieldName === 'offset') obj.offset = parseLenInput(value);
        else if (fieldName === 'text') obj.text = String(value) || null;
      } else if (kind === 'line') {
        if (fieldName === 'length') {
          var llen2 = Math.max(10, parseLenInput(value));
          var ang2 = Math.atan2(obj.b.y - obj.a.y, obj.b.x - obj.a.x);
          obj.b = ED.Geo.polar(obj.a, ang2, llen2);
        } else if (fieldName === 'width') obj.width = ED.Geo.clamp(parseSizeInput(value), 5, 300);
        else if (fieldName === 'style') obj.style = (value === 'dash' || value === 'dot') ? value : 'solid';
        else if (fieldName === 'color') obj.color = String(value);
      }
    });
    App.editor.render();
  }

  function onPropClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'delete-selection') deleteSelection();
    else if (action === 'project-info') showProjectInfo();
    else if (action === 'detect-rooms') {
      var c = App.editor.detectRooms();
      toast(c ? c + ' ambiente(s) detectado(s).' : 'No hay recintos nuevos.', c ? 'success' : 'info');
      refreshProps();
    } else if (action === 'add-auto-dims' || action === 'auto-dims') addAutoDims();
    else if (action === 'duplicate-item') duplicateItem(btn.getAttribute('data-id'));
    else if (action === 'rotate-item') rotateItem(btn.getAttribute('data-id'), Number(btn.getAttribute('data-dir')) || 1);
    else if (action === 'add-opening') addOpening(btn.getAttribute('data-wall'), btn.getAttribute('data-type'));
    else if (action === 'delete-opening') deleteOpening(btn.getAttribute('data-wall'), btn.getAttribute('data-opening'));
    else if (action === 'flip-opening') flipOpening(btn.getAttribute('data-wall'), btn.getAttribute('data-opening'), btn.getAttribute('data-open-prop'));
    else if (action === 'flip-curve') flipWallCurve(btn.getAttribute('data-id'));
    else if (action === 'straighten-wall') straightenWall(btn.getAttribute('data-id'));
    else if (action === 'scene-materials') openSceneMaterials();
    else if (action === 'flip-line-curve') {
      var lineObj = App.store.find('line', btn.getAttribute('data-id'));
      if (lineObj && lineObj.curve && lineObj.curve.type === 'arc') {
        App.store.act('Invertir curva', function () { lineObj.curve.bulge = -(lineObj.curve.bulge || 0); });
        refreshProps(); App.editor.render();
      }
    }
    else if (action === 'view-select-wall') {
      App.viewSelection = null;
      App.store.setSelection([{ kind: 'wall', id: btn.getAttribute('data-id') }]);
      renderViews();
    }
    else if (action === 'new-sheet') addSheet();
    else if (action === 'sheet-export') { var sh = getSelectedSheet(); if (sh) exportPDF([sh]); }
    else if (action === 'sheet-refresh-image') refreshSelectedSheetImage();
    else if (action === 'sheet-duplicate') duplicateSheet();
    else if (action === 'sheet-delete') deleteSheet();
    else if (action === 'sheet-up') moveSheet(-1);
    else if (action === 'sheet-down') moveSheet(1);
  }

  function flipWallCurve(id) {
    var wall = App.store.find('wall', id);
    if (!wall || !wall.curve || wall.curve.type !== 'arc') return;
    App.store.act('Invertir arco', function () {
      wall.curve = { type: 'arc', bulge: -wall.curve.bulge };
    });
    refreshProps();
    App.editor.render();
    toast('Arco invertido.', 'success', 1800);
  }

  function straightenWall(id) {
    var wall = App.store.find('wall', id);
    if (!wall || !wall.curve) return;
    App.store.act('Quitar curva del muro', function () { delete wall.curve; });
    refreshProps();
    App.editor.render();
    toast('Muro convertido en recto.', 'success', 2000);
  }

  function deleteSelection() {
    var sel = App.store.selection.slice();
    if (!sel.length) return;
    App.store.act('Eliminar selección', function () {
      sel.forEach(function (s) { App.store.remove(s.kind, s.id); });
    });
    App.store.setSelection([]);
    refreshProps();
    refreshLayers();
    App.editor.render();
    toast('Objeto(s) eliminado(s). Puedes deshacer con Ctrl+Z.', 'info', 2600);
  }

  function duplicateItem(id) {
    var item = App.store.find('item', id);
    if (!item) return;
    var copy = ED.Geo.deepClone(item);
    copy.id = App.store.newId('i');
    copy.x += 400; copy.y -= 400;
    App.store.act('Duplicar mobiliario', function () { App.store.project.items.push(copy); });
    App.store.setSelection([{ kind: 'item', id: copy.id }]);
    refreshProps();
    App.editor.render();
    toast('Mueble duplicado.', 'success', 1800);
  }

  function rotateItem(id, dir) {
    var item = App.store.find('item', id);
    if (!item) return;
    App.store.act('Rotar mobiliario', function () { item.rotation = ED.Geo.normDeg((item.rotation || 0) + 90 * dir); });
    refreshProps();
    App.editor.render();
  }

  function addOpening(wallId, type) {
    var wall = App.store.find('wall', wallId);
    if (!wall) return;
    var len = ED.Geo.wallLength(wall);
    var width = type === 'window' ? 1200 : 900;
    if (len < width + 100) { toast('El muro es demasiado corto para esta abertura.', 'warn'); return; }
    App.store.act('Insertar abertura', function () {
      wall.openings = wall.openings || [];
      wall.openings.push({
        id: App.store.newId('o'), type: type, subtype: OPENING_SUBTYPE_DEFAULT[type] || '', t: 0.5, width: width,
        height: type === 'window' ? 1200 : 2100, sill: type === 'window' ? 900 : 0,
        swing: 1, hinge: 1
      });
      wall.openings.sort(function (a, b) { return a.t - b.t; });
    });
    refreshProps();
    App.editor.render();
    toast(type === 'window' ? 'Ventana insertada.' : 'Puerta insertada.', 'success', 1800);
  }

  function deleteOpening(wallId, openingId) {
    var wall = App.store.find('wall', wallId);
    if (!wall) return;
    if (App.viewSelection && App.viewSelection.kind === 'opening' && App.viewSelection.openingId === openingId) App.viewSelection = null;
    if (App.viewMode !== 'plan') setTimeout(renderViews, 30);
    App.store.act('Eliminar abertura', function () {
      wall.openings = (wall.openings || []).filter(function (o) { return o.id !== openingId; });
    });
    refreshProps();
    App.editor.render();
  }

  function flipOpening(wallId, openingId, prop) {
    var wall = App.store.find('wall', wallId);
    if (!wall) return;
    var op = null;
    (wall.openings || []).forEach(function (o) { if (o.id === openingId) op = o; });
    if (!op) return;
    App.store.act('Girar abertura', function () {
      if (prop === 'hinge') op.hinge = op.hinge === -1 ? 1 : -1;
      else op.swing = op.swing === -1 ? 1 : -1;
    });
    refreshProps();
    App.editor.render();
    toast(prop === 'hinge' ? 'Bisagra invertida.' : 'Sentido de apertura girado.', 'success', 1600);
  }

  // ================================================================== biblioteca
  function renderLibrary() {
    var panel = $('#panelLibrary');
    if (!panel) return;
    if (!ED.Library) {
      panel.innerHTML = '<div class="empty-note">Biblioteca no disponible.</div>';
      return;
    }
    var cats = ED.Library.categories || [{ id: 'todos', name: 'Todos' }];
    panel.innerHTML = '<div class="lib-search">' + icon('search', 14) +
      '<input id="libSearch" type="search" placeholder="Buscar muebles, baño, cocina…" value="' + esc(App.libQuery) + '"></div>' +
      '<div class="cat-chips">' + cats.map(function (c) {
        return '<button class="cat-chip' + (App.libCat === c.id ? ' active' : '') + '" data-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="library-grid" id="libGrid"></div>' +
      '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-lib-action="import">' + icon('cube', 13) + 'Importar objeto (.glb / .obj)</button></div>' +
      '<div class="lib-hint"><strong>Cómo colocar:</strong> elige un mueble, mueve el cursor sobre el plano y haz clic. Pulsa <strong>R</strong> para rotar 90° y <strong>Esc</strong> para salir.</div>';
    renderLibraryGrid();
    localize();
  }

  function renderLibraryGrid() {
    var grid = $('#libGrid');
    if (!grid || !ED.Library) return;
    var list = ED.Library.search ? ED.Library.search(App.libQuery, App.libCat) : ED.Library.list(App.libCat);
    if (!list.length) {
      grid.innerHTML = '<div class="library-empty">Sin resultados para “' + esc(App.libQuery) + '”.</div>';
      return;
    }
    grid.innerHTML = list.map(function (def) {
      return '<button class="lib-card' + (App.lastFurnitureId === def.id ? ' active' : '') + '" data-lib-id="' + esc(def.id) + '" title="' + esc(def.name) + '">' +
        '<span class="lib-thumb">' + libThumb(def) + '</span>' +
        '<span class="lib-name">' + esc(def.name) + '</span>' +
        '<span class="lib-dim">' + Math.round(def.w) + ' × ' + Math.round(def.d) + ' mm</span></button>';
    }).join('');
  }

  function mixHex(a, b, t) {
    function parse(c) {
      c = String(c || '#888888').replace('#', '');
      if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
      var v = parseInt(c, 16);
      return isFinite(v) ? { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 } : { r: 136, g: 136, b: 136 };
    }
    var x = parse(a), y = parse(b);
    t = t == null ? 0.5 : t;
    function h(v) { var s = Math.round(v).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(x.r + (y.r - x.r) * t) + h(x.g + (y.g - x.g) * t) + h(x.b + (y.b - x.b) * t);
  }

  function libThumb(def) {
    var shapes = (def.plan && def.plan.length) ? def.plan : [{ t: 'rect', x: -def.w / 2, y: -def.d / 2, w: def.w, h: def.d }];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function include(x, y) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    shapes.forEach(function (s) {
      if (s.t === 'rect') {
        var x = s.x == null ? -s.w / 2 : s.x, y = s.y == null ? -s.h / 2 : s.y;
        include(x, y); include(x + s.w, y + s.h);
      } else if (s.t === 'circle') { include(s.cx - s.r, s.cy - s.r); include(s.cx + s.r, s.cy + s.r); }
      else if (s.t === 'line') { include(s.x1, s.y1); include(s.x2, s.y2); }
      else if (s.t === 'poly') (s.points || []).forEach(function (p) { include(p.x, p.y); });
      else if (s.t === 'arc') { include(s.cx - s.r, s.cy - s.r); include(s.cx + s.r, s.cy + s.r); }
    });
    if (!isFinite(minX)) { include(-def.w / 2, -def.d / 2); include(def.w / 2, def.d / 2); }
    var bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    var scale = Math.min(92 / bw, 56 / bh);
    var ox = 50 - (minX + bw / 2) * scale;
    var oy = 32 + (minY + bh / 2) * scale;
    function X(x) { return ox + x * scale; }
    function Y(y) { return oy - y * scale; }
    var parts = [];
    shapes.forEach(function (s) {
      var fill = s.fill || mixHex(def.color || '#9aa8b6', '#ffffff', 0.42);
      var stroke = s.stroke || '#52606d';
      var sw = 1;
      if (s.t === 'rect') {
        var x = s.x == null ? -s.w / 2 : s.x, y = s.y == null ? -s.h / 2 : s.y;
        parts.push('<rect x="' + X(x).toFixed(2) + '" y="' + Y(y + s.h).toFixed(2) + '" width="' + (s.w * scale).toFixed(2) + '" height="' + (s.h * scale).toFixed(2) + '" rx="' + Math.min(3, (s.r || 0) * scale).toFixed(2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
      } else if (s.t === 'circle') {
        parts.push('<circle cx="' + X(s.cx).toFixed(2) + '" cy="' + Y(s.cy).toFixed(2) + '" r="' + Math.max(0.4, s.r * scale).toFixed(2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
      } else if (s.t === 'line') {
        parts.push('<line x1="' + X(s.x1).toFixed(2) + '" y1="' + Y(s.y1).toFixed(2) + '" x2="' + X(s.x2).toFixed(2) + '" y2="' + Y(s.y2).toFixed(2) + '" stroke="' + (s.stroke || stroke) + '" stroke-width="1.1" stroke-linecap="round"/>');
      } else if (s.t === 'poly') {
        var pts = (s.points || []).map(function (p) { return X(p.x).toFixed(2) + ',' + Y(p.y).toFixed(2); }).join(' ');
        parts.push('<polygon points="' + pts + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
      } else if (s.t === 'arc') {
        var path = '';
        var a0 = (s.start || 0) * Math.PI / 180, a1 = (s.end == null ? 180 : s.end) * Math.PI / 180;
        for (var k = 0; k <= 14; k++) {
          var ang = a0 + (a1 - a0) * (k / 14);
          var px = s.cx + Math.cos(ang) * s.r, py = s.cy + Math.sin(ang) * s.r;
          path += (k ? 'L' : 'M') + X(px).toFixed(2) + ' ' + Y(py).toFixed(2);
        }
        parts.push('<path d="' + path + '" fill="none" stroke="' + stroke + '" stroke-width="1.1"/>');
      }
    });
    return '<svg viewBox="0 0 100 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + parts.join('') + '</svg>';
  }

  // ================================================================== capas
  function refreshLayers() {
    var panel = $('#panelLayers');
    if (!panel || !App.store) return;
    var counts = {
      walls: App.store.walls().length,
      openings: App.store.walls().reduce(function (a, w) { return a + (w.openings || []).length; }, 0),
      furniture: App.store.items().length,
      rooms: App.store.rooms().length,
      annotation: App.store.texts().length,
      dimensions: App.store.dims().length
    };
    panel.innerHTML = '<div class="section"><div class="section-title">Capas del nivel <span class="count">' + esc(App.store.activeLevelObj().name) + '</span></div>' +
      '<div class="layer-list">' + App.store.project.layers.map(function (l) {
        var count = counts[l.id] != null ? counts[l.id] : 0;
        return '<div class="layer-row">' +
          '<button class="layer-eye' + (l.visible === false ? ' off' : '') + '" data-layer="' + esc(l.id) + '" data-layer-act="visible" title="Mostrar / ocultar">' + icon(l.visible === false ? 'eyeoff' : 'eye', 15) + '</button>' +
          '<span class="layer-swatch" style="background:' + esc(l.color) + '"></span>' +
          '<span class="layer-name">' + esc(l.name) + '</span>' +
          '<span class="layer-count">' + count + '</span>' +
          '<button class="layer-lock' + (l.locked ? ' locked' : '') + '" data-layer="' + esc(l.id) + '" data-layer-act="locked" title="Bloquear / desbloquear">' + icon(l.locked ? 'lock' : 'unlock', 13) + '</button>' +
          '</div>';
      }).join('') + '</div>' +
      '<div class="lib-hint" style="margin-top:9px">Las capas ocultas no se dibujan ni se pueden seleccionar. Las capas bloqueadas permanecen visibles pero protegidas.</div>' +
      '<div class="prop-actions"><button class="btn btn-ghost btn-sm" data-layer-act="showall">Mostrar todas</button></div></div>';
    localize();
  }

  function onLayerClick(e) {
    var btn = e.target.closest('[data-layer-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-layer-act');
    if (act === 'showall') {
      App.store.act('Mostrar todas las capas', function () {
        App.store.project.layers.forEach(function (l) { l.visible = true; l.locked = false; });
      });
      refreshLayers();
      App.editor.render();
      return;
    }
    var layer = App.store.getLayer(btn.getAttribute('data-layer'));
    if (!layer) return;
    App.store.act('Editar capa', function () {
      if (act === 'visible') layer.visible = layer.visible === false;
      else if (act === 'locked') layer.locked = !layer.locked;
    });
    refreshLayers();
    App.editor.render();
    if (App.view === '3d') schedule3D();
  }

  function showTextModal(point) {
    var body = '<div class="field"><label>Texto de la anotación</label><input class="input" id="textValue" autofocus value="TEXTO"></div>' +
      '<div class="field-grid">' +
      '<div class="field"><label>Tamaño</label><select class="select" id="textSize"><option value="200">' + unitSizeInput(200) + ' ' + unitSizeLabel() + '</option><option value="300" selected>' + unitSizeInput(300) + ' ' + unitSizeLabel() + '</option><option value="450">' + unitSizeInput(450) + ' ' + unitSizeLabel() + '</option><option value="600">' + unitSizeInput(600) + ' ' + unitSizeLabel() + '</option></select></div>' +
      '<div class="field"><label>Rotación</label><input class="input" id="textRot" type="number" value="0" step="15"></div></div>' +
      '<div class="modal-note">' + icon('info', 15) + '<div>El texto se colocará en X ' + unitLen(point.x) + ' · Y ' + unitLen(point.y) + '.</div></div>';
    var footer = '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="textAdd">Insertar texto</button>';
    var m = openModal({ title: 'Insertar texto', subtitle: 'Anotación de plano', body: body, footer: footer, narrow: true });
    function add() {
      var value = ($('#textValue', m.root).value || '').trim();
      if (!value) { toast('Escribe un texto.', 'warn'); return; }
      var size = Number($('#textSize', m.root).value) || 300;
      var rot = Number($('#textRot', m.root).value) || 0;
      App.store.act('Insertar texto', function () {
        App.store.project.texts.push({
          id: App.store.newId('t'), type: 'text', level: App.store.activeLevel, layerId: 'annotation',
          x: point.x, y: point.y, text: value, size: size, rotation: ED.Geo.normDeg(rot)
        });
      });
      m.close();
      setInspectorTab('props');
      toast('Texto insertado.', 'success', 1800);
    }
    $('#textAdd', m.root).addEventListener('click', add);
    $('#textValue', m.root).addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
  }

  // ================================================================== modales de proyecto
  function showTemplateModal() {
    var list = (ED.Templates && ED.Templates.list) ? ED.Templates.list : [
      { id: 'blank', name: 'Plano en blanco', desc: 'Proyecto vacío.' },
      { id: 'demo', name: 'Residencia demo', desc: 'Proyecto de ejemplo.' }
    ];
    var selected = list.some(function (t) { return t.id === 'demo'; }) ? 'demo' : list[0].id;
    var cards = list.map(function (t) {
      return '<button class="template-option' + (t.id === selected ? ' active' : '') + '" data-template="' + esc(t.id) + '">' +
        '<span class="tpl-icon"></span><div><strong>' + esc(t.name) + '</strong><span>' + esc(t.desc) + '</span></div>' +
        '<span class="radio"></span></button>';
    }).join('');
    var body = '<div class="template-options">' + cards + '</div>' +
      '<div class="modal-note">' + icon('info', 15) + '<div>El proyecto actual se conserva en el autoguardado del navegador. Si quieres conservarlo también como archivo, descárgalo antes de continuar.</div></div>';
    var footer = '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="tplCreate">Crear proyecto</button>';
    var m = openModal({ title: 'Nuevo proyecto', subtitle: 'Elige una plantilla para empezar', body: body, footer: footer, wide: true });
    $$('[data-template]', m.root).forEach(function (b) {
      b.addEventListener('click', function () {
        selected = b.getAttribute('data-template');
        $$('[data-template]', m.root).forEach(function (x) { x.classList.toggle('active', x === b); });
      });
    });
    $('#tplCreate', m.root).addEventListener('click', function () {
      try {
        var project = ED.Templates.create(selected);
        App.store.replaceProject(project);
        App.selectedSheetId = App.store.project.sheets.length ? App.store.project.sheets[0].id : null;
        applyGridToEditor();
        App.editor.fitToContent();
        refreshHeader(); refreshLevelTabs(); refreshUndo(); refreshProps(); refreshLayers();
        setView('2d');
        setSaveState('saved');
        m.close();
        toast('Proyecto creado: ' + App.store.project.meta.name, 'success', 3200);
      } catch (e) {
        console.error(e);
        toast('No se pudo crear el proyecto: ' + (e.message || e), 'error', 4200);
      }
    });
  }

  // ============================================================= modal de rejilla
  function drawGridPreview(canvas, cfg) {
    if (!canvas || !canvas.getContext) return;
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var cssW = Math.max(160, Math.round((rect && rect.width) || canvas.clientWidth || 560));
    var cssH = Math.max(64, Math.round((rect && rect.height) || canvas.clientHeight || 112));
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f8f6f0';
    ctx.fillRect(0, 0, cssW, cssH);

    var size = cfg.size > 0 ? cfg.size : 250;
    var major = cfg.major >= 2 ? cfg.major : 4;
    var step = cfg.step > 0 && cfg.step < size ? cfg.step : 0;
    var zoom = cssW / (size * major * 4);
    var stepPx = Math.max(3, size * zoom);
    var majorPx = stepPx * major;
    var ox = (((cfg.originX || 0) * zoom) % stepPx + stepPx) % stepPx;
    var oy = (((cfg.originY || 0) * zoom) % stepPx + stepPx) % stepPx;

    function lineV(x) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, cssH); }
    function lineH(y) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(cssW, Math.round(y) + 0.5); }

    var finePx = step ? step * zoom : 0;
    if (step && finePx >= 4) {
      ctx.strokeStyle = 'rgba(36,49,61,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var fx = ox % finePx; fx < cssW; fx += finePx) lineV(fx);
      for (var fy = oy % finePx; fy < cssH; fy += finePx) lineH(fy);
      ctx.stroke();
    }

    if (cfg.style === 'dots') {
      ctx.fillStyle = 'rgba(36,49,61,0.30)';
      for (var dx = ox % stepPx; dx < cssW; dx += stepPx) {
        for (var dy = oy % stepPx; dy < cssH; dy += stepPx) ctx.fillRect(Math.round(dx), Math.round(dy), 1.6, 1.6);
      }
    } else {
      ctx.strokeStyle = 'rgba(36,49,61,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = ox % stepPx; x < cssW; x += stepPx) lineV(x);
      for (var y = oy % stepPx; y < cssH; y += stepPx) lineH(y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(36,49,61,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var mx = ox % majorPx; mx < cssW; mx += majorPx) lineV(mx);
    for (var my = oy % majorPx; my < cssH; my += majorPx) lineH(my);
    ctx.stroke();

    if (cfg.axes) {
      ctx.strokeStyle = 'rgba(46,125,143,0.5)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      lineV(ox % stepPx);
      lineH(oy % stepPx);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(30,42,53,0.76)';
    ctx.font = '600 11px "Bahnschrift", "Consolas", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('1 cuadro = ' + gridLabel(size) + ' · maestra cada ' + major +
      (step ? ' · paso ' + gridLabel(step) : ' · ajuste a la rejilla'), 10, cssH - 7);
  }

  function showGridDialog() {
    var g = gridSettings();
    var unit = unitSys();
    var imperial = ED.Geo.isImperial(unit);
    var sizeLabel = unitSizeLabel();
    var presets = imperial
      ? [{ label: '3"', mm: 76.2 }, { label: '6"', mm: 152.4 }, { label: '12"', mm: 304.8 }, { label: '24"', mm: 609.6 }, { label: '60"', mm: 1524 }]
      : [{ label: '10 cm', mm: 100 }, { label: '25 cm', mm: 250 }, { label: '50 cm', mm: 500 }, { label: '1 m', mm: 1000 }, { label: '2 m', mm: 2000 }];
    var majorOptions = [2, 3, 4, 5, 6, 8, 10];
    if (majorOptions.indexOf(g.major) < 0) {
      majorOptions.push(g.major);
      majorOptions.sort(function (a, b) { return a - b; });
    }

    var body = '<div class="form-grid">' +
      '<div class="field full"><label>Separación de la rejilla</label>' +
      '<div class="chip-row">' + presets.map(function (p) {
        return '<button type="button" class="chip' + (Math.abs(p.mm - g.size) < 0.5 ? ' active' : '') +
          '" data-grid-preset="' + p.mm + '">' + p.label + '</button>';
      }).join('') + '</div>' +
      '<div class="input-row"><input class="input" id="gridSize" type="number" min="0.1" step="any" value="' +
      ED.Geo.sizeInput(g.size, unit) + '"><span class="input-unit">' + sizeLabel + '</span></div>' +
      '<div class="field-hint">Línea base de la cuadrícula. Si no defines un paso distinto, también es el paso de ajuste al dibujar.</div></div>' +

      '<div class="field"><label>Línea maestra cada</label><select class="select" id="gridMajor">' +
      majorOptions.map(function (v) {
        return '<option value="' + v + '"' + (v === g.major ? ' selected' : '') + '>' + v + ' líneas</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Estilo</label><div class="segmented" id="gridStyle">' +
      '<button type="button" data-grid-style="lines" class="' + (g.style === 'lines' ? 'active' : '') + '">Líneas</button>' +
      '<button type="button" data-grid-style="dots" class="' + (g.style === 'dots' ? 'active' : '') + '">Puntos</button>' +
      '</div></div>' +

      '<div class="field full"><label class="field-inline"><input type="checkbox" id="gridCustomStep"' +
      (g.step ? ' checked' : '') + '> Usar un paso de ajuste distinto (dimensiones exactas)</label>' +
      '<div class="input-row"><input class="input" id="gridStep" type="number" min="0.1" step="any" value="' +
      ED.Geo.sizeInput(g.step || Math.max(10, g.size / 5), unit) + '"><span class="input-unit">' + sizeLabel + '</span></div>' +
      '<div class="field-hint">El cursor se ajusta a este paso aunque la rejilla se dibuje con la separación anterior. Sirve para muros y huecos de medidas exactas.</div></div>' +

      '<div class="field"><label>Origen X</label><div class="input-row"><input class="input" id="gridOriginX" type="number" step="any" value="' +
      ED.Geo.lengthInput(g.originX, unit) + '"><span class="input-unit">' + unitLenLabel() + '</span></div></div>' +
      '<div class="field"><label>Origen Y</label><div class="input-row"><input class="input" id="gridOriginY" type="number" step="any" value="' +
      ED.Geo.lengthInput(g.originY, unit) + '"><span class="input-unit">' + unitLenLabel() + '</span></div></div>' +

      '<div class="field full"><label class="field-inline"><input type="checkbox" id="gridAdaptive"' +
      (g.adaptive ? ' checked' : '') + '> Rejilla adaptativa al zoom</label>' +
      '<div class="field-hint">Al alejar la vista, las líneas se agrupan para no saturar el plano.</div></div>' +
      '<div class="field full"><label class="field-inline"><input type="checkbox" id="gridAxes"' +
      (g.axes ? ' checked' : '') + '> Mostrar los ejes del origen</label></div>' +
      '<div class="field full"><label>Vista previa</label><canvas class="grid-preview" id="gridPreview" width="580" height="112"></canvas></div>' +
      '</div>' +
      '<div class="modal-note">' + icon('info', 15) + '<div>La rejilla y el paso de ajuste se guardan en el proyecto. Con <strong>Deshacer</strong> (Ctrl+Z) puedes volver a la configuración anterior.</div></div>';

    var footer = '<button class="btn btn-ghost" id="gridReset">Restablecer</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-ghost" data-close>Cancelar</button>' +
      '<button class="btn btn-primary" id="gridApply">Aplicar rejilla</button>';

    var modal = openModal({
      title: 'Rejilla y ajuste',
      subtitle: 'Separa las líneas y define el paso de dibujo para medidas exactas',
      body: body, footer: footer, wide: true, noAutoFocus: true
    });
    var root = modal.root;

    function el(id) { return $('#' + id, root); }
    function val(id) { var e = el(id); return e ? e.value : ''; }

    function readDraft() {
      var size = ED.Geo.parseSizeInput(val('gridSize'), unit);
      if (!isFinite(size) || size <= 0) size = 250;
      var major = Math.round(n(val('gridMajor'), 4));
      var custom = !!(el('gridCustomStep') && el('gridCustomStep').checked);
      var rawStep = custom ? ED.Geo.parseSizeInput(val('gridStep'), unit) : 0;
      var styleBtn = $('[data-grid-style].active', root);
      return {
        size: size,
        major: isFinite(major) && major >= 2 ? major : 4,
        step: custom && isFinite(rawStep) && rawStep > 0 ? rawStep : 0,
        originX: parseLenInput(val('gridOriginX')),
        originY: parseLenInput(val('gridOriginY')),
        style: styleBtn ? styleBtn.getAttribute('data-grid-style') : 'lines',
        adaptive: !!(el('gridAdaptive') && el('gridAdaptive').checked),
        axes: !!(el('gridAxes') && el('gridAxes').checked)
      };
    }

    function syncControls() {
      var custom = !!(el('gridCustomStep') && el('gridCustomStep').checked);
      var stepInput = el('gridStep');
      if (stepInput) {
        stepInput.disabled = !custom;
        stepInput.style.opacity = custom ? '1' : '0.45';
      }
    }

    function updatePreview() {
      var c = el('gridPreview');
      if (c) drawGridPreview(c, readDraft());
    }

    function markPresets(size) {
      $$('[data-grid-preset]', root).forEach(function (b) {
        b.classList.toggle('active', Math.abs(Number(b.getAttribute('data-grid-preset')) - size) < 0.5);
      });
    }

    function setDraft(cfg) {
      if (el('gridSize')) el('gridSize').value = ED.Geo.sizeInput(cfg.size, unit);
      if (el('gridMajor')) el('gridMajor').value = String(cfg.major);
      if (el('gridOriginX')) el('gridOriginX').value = ED.Geo.lengthInput(cfg.originX, unit);
      if (el('gridOriginY')) el('gridOriginY').value = ED.Geo.lengthInput(cfg.originY, unit);
      if (el('gridCustomStep')) el('gridCustomStep').checked = !!cfg.step;
      if (el('gridStep')) el('gridStep').value = ED.Geo.sizeInput(cfg.step || Math.max(10, cfg.size / 5), unit);
      if (el('gridAdaptive')) el('gridAdaptive').checked = !!cfg.adaptive;
      if (el('gridAxes')) el('gridAxes').checked = !!cfg.axes;
      $$('[data-grid-style]', root).forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-grid-style') === cfg.style);
      });
      markPresets(cfg.size);
      syncControls();
      updatePreview();
    }

    root.addEventListener('click', function (e) {
      var preset = e.target.closest('[data-grid-preset]');
      if (preset) {
        var mm = Number(preset.getAttribute('data-grid-preset'));
        if (el('gridSize')) el('gridSize').value = ED.Geo.sizeInput(mm, unit);
        markPresets(mm);
        updatePreview();
        return;
      }
      var style = e.target.closest('[data-grid-style]');
      if (style) {
        $$('[data-grid-style]', root).forEach(function (b) { b.classList.toggle('active', b === style); });
        updatePreview();
      }
    });
    root.addEventListener('input', function () { syncControls(); updatePreview(); });
    root.addEventListener('change', function () { syncControls(); updatePreview(); });

    $('#gridReset', root).addEventListener('click', function () {
      setDraft({
        size: imperial ? 304.8 : 250, major: 4, step: 0,
        originX: 0, originY: 0, style: 'lines', adaptive: true, axes: true
      });
    });

    $('#gridApply', root).addEventListener('click', function () {
      var cfg = readDraft();
      var size = ED.Geo.clamp(cfg.size, 5, 100000);
      var step = cfg.step ? ED.Geo.clamp(cfg.step, 1, 100000) : 0;
      App.store.act('Configurar rejilla', function () {
        var s = App.store.project.settings;
        s.grid = size;
        s.gridMajor = ED.Geo.clamp(cfg.major, 2, 50);
        s.snapStep = step;
        s.gridOriginX = cfg.originX;
        s.gridOriginY = cfg.originY;
        s.gridStyle = cfg.style === 'dots' ? 'dots' : 'lines';
        s.gridAdaptive = cfg.adaptive;
        s.showAxes = cfg.axes;
      });
      applyGridToEditor();
      App.editor.render();
      refreshProps();
      updateGridChips();
      modal.close();
      toast('Rejilla actualizada: ' + gridLabel(size) +
        (step ? ' · paso ' + gridLabel(step) : ''), 'success', 3000);
    });

    setTimeout(function () {
      var c = el('gridPreview');
      if (c) updatePreview();
    }, 50);
  }

  function showProjectInfo() {
    var p = App.store.project;
    var m = p.meta, s = p.settings;
    var body = '<div class="form-grid">' +
      '<div class="field full"><label>Nombre del proyecto</label><input class="input" name="name" value="' + esc(m.name || '') + '"></div>' +
      '<div class="field"><label>Cliente / propietario</label><input class="input" name="client" value="' + esc(m.client || '') + '"></div>' +
      '<div class="field"><label>Ubicación</label><input class="input" name="location" value="' + esc(m.location || '') + '"></div>' +
      '<div class="field"><label>Ingeniero / arquitecto</label><input class="input" name="engineer" value="' + esc(m.engineer || '') + '"></div>' +
      '<div class="field"><label>Matrícula / licencia</label><input class="input" name="license" value="' + esc(m.license || '') + '"></div>' +
      '<div class="field"><label>Teléfono</label><input class="input" name="phone" value="' + esc(m.phone || '') + '"></div>' +
      '<div class="field"><label>Correo</label><input class="input" name="email" type="email" value="' + esc(m.email || '') + '"></div>' +
      '<div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="' + esc(m.date || '') + '"></div>' +
      '<div class="field"><label>Revisión</label><input class="input" name="revision" value="' + esc(m.revision || 'A') + '"></div>' +
      '<div class="field full"><label>Descripción</label><input class="input" name="description" value="' + esc(m.description || '') + '"></div>' +
      '<div class="field full"><label>Notas generales del proyecto</label><textarea class="textarea" name="notes">' + esc(m.notes || '') + '</textarea></div>' +
      '<div class="field"><label>Norte (grados)</label><input class="input" name="northAngle" type="number" step="1" value="' + n(s.northAngle, 0) + '"></div>' +
      '<div class="field"><label>Sistema de unidades</label><select class="select" name="units">' +
      '<option value="m"' + (ED.Geo.normalizeUnit(s.units) === 'm' ? ' selected' : '') + '>Métrico (m · m²)</option>' +
      '<option value="ft"' + (ED.Geo.normalizeUnit(s.units) === 'ft' ? ' selected' : '') + '>Imperial (ft · ft²)</option></select></div>' +
      '<div class="field"><label>Separación de rejilla</label><div class="input-row"><input class="input" name="grid" type="number" min="50" step="50" value="' + unitSizeInput(s.grid) + '"><span class="input-unit">' + unitSizeLabel() + '</span></div></div>' +
      '<div class="field"><label>Espesor de muro por defecto</label><div class="input-row"><input class="input" name="wallThickness" type="number" min="80" step="10" value="' + unitSizeInput(s.wallThickness) + '"><span class="input-unit">' + unitSizeLabel() + '</span></div></div>' +
      '<div class="field"><label>Altura de muro por defecto</label><div class="input-row"><input class="input" name="wallHeight" type="number" min="2000" step="50" value="' + unitSizeInput(s.wallHeight) + '"><span class="input-unit">' + unitSizeLabel() + '</span></div></div>' +
      '</div><div class="modal-note">' + icon('info', 15) + '<div>Estos datos alimentan los cajetines de las láminas. Se guardan en el proyecto y también en el autoguardado.</div></div>';
    var footer = '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="infoSave">Guardar datos</button>';
    var modal = openModal({ title: 'Datos del proyecto', subtitle: 'Información para cajetines y portada', body: body, footer: footer, wide: true });
    $('#infoSave', modal.root).addEventListener('click', function () {
      var val = function (name) {
        var el = $('[name="' + name + '"]', modal.root);
        return el ? el.value : '';
      };
      App.store.act('Editar datos del proyecto', function () {
        var oldUnit = s.units;
        m.name = val('name').trim() || 'Proyecto sin nombre';
        m.client = val('client').trim();
        m.location = val('location').trim();
        m.engineer = val('engineer').trim();
        m.license = val('license').trim();
        m.phone = val('phone').trim();
        m.email = val('email').trim();
        m.date = val('date');
        m.revision = val('revision').trim() || 'A';
        m.description = val('description').trim();
        m.notes = val('notes').trim();
        s.northAngle = n(val('northAngle'), 0);
        s.grid = Math.max(50, ED.Geo.parseSizeInput(val('grid'), oldUnit) || 250);
        s.wallThickness = Math.max(80, ED.Geo.parseSizeInput(val('wallThickness'), oldUnit) || 150);
        s.wallHeight = Math.max(2000, ED.Geo.parseSizeInput(val('wallHeight'), oldUnit) || 2700);
        s.units = ED.Geo.normalizeUnit(val('units'));
      });
      App.editor.setSnap({ gridSize: s.grid });
      applyGridToEditor();
      updateGridChips();
      updateUnitsUI();
      refreshHeader();
      App.editor.render();
      if (App.view === 'sheets') scheduleSheetPreviews(120);
      if (App.view === '3d') schedule3D();
      modal.close();
      toast('Datos del proyecto actualizados.', 'success', 2400);
    });
  }

  function confirmDeleteLevel() {
    var active = App.store.activeLevelObj();
    if (!active) return;
    var levels = App.store.project.levels || [];
    if (levels.length <= 1) { toast('El proyecto debe conservar al menos una planta.', 'warn', 3200); return; }
    var counts = { walls: 0, items: 0, rooms: 0 };
    ['walls', 'items', 'rooms'].forEach(function (k) {
      counts[k] = (App.store.project[k] || []).filter(function (o) { return o.level === active.id; }).length;
    });
    var body = '<p>¿Eliminar la planta <strong>' + esc(active.name) + '</strong> y todos sus objetos?</p>' +
      '<p class="modal-note" style="display:block">Se borrarán ' + counts.walls + ' muros, ' + counts.items + ' muebles y ' + counts.rooms + ' ambientes de esa planta. Las láminas que la usaban pasarán a la primera planta.</p>' +
      '<p class="field-hint">Puedes deshacerlo con Ctrl+Z.</p>';
    var m = openModal({ title: 'Eliminar planta', subtitle: active.name, body: body, wide: false,
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn" id="levelDeleteConfirm" style="background:#8a3b31;color:#fff">Eliminar planta</button>' });
    $('#levelDeleteConfirm', m.root).addEventListener('click', function () {
      var ok = App.store.act('Eliminar planta', function () { return App.store.removeLevel(active.id); });
      m.close();
      if (ok === false) { toast('No se pudo eliminar la planta.', 'warn'); return; }
      App.store.setActiveLevel(App.store.project.levels[0].id);
      applyGridToEditor();
      App.editor.render();
      refreshHeader(); refreshLevelTabs(); refreshProps(); refreshLayers(); refreshUndo();
      updateZoomStatus();
      toast('Planta eliminada. Puedes deshacer con Ctrl+Z.', 'success', 3200);
    });
  }

  function showLevelModal() {
    var levels = App.store.levels();
    var nextElev = 0;
    levels.forEach(function (l) { nextElev = Math.max(nextElev, n(l.elevation, 0) + n(l.height, 2800)); });
    var body = '<div class="field"><label>Nombre de la planta</label><input class="input" id="lvlName" value="Planta ' + (levels.length + 1) + '"></div>' +
      '<div class="field-grid">' +
      '<div class="field"><label>Elevación</label><div class="input-row"><input class="input" id="lvlElev" type="number" step="0.05" value="' + unitLenInput(nextElev) + '"><span class="input-unit">' + unitLenLabel() + '</span></div></div>' +
      '<div class="field"><label>Altura libre</label><div class="input-row"><input class="input" id="lvlHeight" type="number" step="0.05" value="' + unitLenInput(2800) + '"><span class="input-unit">' + unitLenLabel() + '</span></div></div>' +
      '</div><div class="modal-note">' + icon('info', 15) + '<div>La planta se apila automáticamente en la vista 3D según su elevación. Podrás dibujar en ella al crearla.</div></div>';
    var footer = '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="lvlAdd">Añadir planta</button>';
    var m = openModal({ title: 'Añadir planta', subtitle: 'Planta adicional del proyecto', body: body, footer: footer, narrow: true });
    $('#lvlAdd', m.root).addEventListener('click', function () {
      var name = ($('#lvlName', m.root).value || '').trim() || ('Planta ' + (levels.length + 1));
      var elev = parseLenInput(($('#lvlElev', m.root).value || 0));
      if (!isFinite(elev)) elev = nextElev;
      var height = Math.max(1500, parseLenInput(($('#lvlHeight', m.root).value || 0)));
      if (!isFinite(height) || height <= 0) height = 2800;
      var id = 'l' + Date.now().toString(36);
      while (App.store.levels().some(function (l) { return l.id === id; })) id += 'x';
      App.store.act('Añadir planta', function () {
        App.store.project.levels.push({ id: id, name: name, elevation: elev, height: height });
      });
      App.store.setActiveLevel(id);
      refreshLevelTabs();
      refreshHeader();
      m.close();
      toast('Planta “' + name + '” añadida.', 'success', 2600);
    });
  }

  function showHelp() {
    var body = '<div class="help-grid">' +
      '<div><h3>Atajos de dibujo</h3><div class="shortcut-list">' +
      shortcut('Seleccionar', ['V']) + shortcut('Mover vista', ['H']) + shortcut('Muro', ['M']) +
      shortcut('Muro en arco / spline', ['C', 'K']) +
      shortcut('Puerta / ventana', ['P', 'N']) + shortcut('Ambiente', ['A']) +
      shortcut('Mobiliario', ['F']) + shortcut('Texto', ['T']) + shortcut('Cota', ['D']) +
      shortcut('Borrar', ['E']) + shortcut('Terminar / salir', ['Esc']) +
      '</div></div>' +
      '<div><h3>Navegación</h3><div class="shortcut-list">' +
      shortcut('Deshacer', ['Ctrl', 'Z']) + shortcut('Rehacer', ['Ctrl', 'Y']) +
      shortcut('Guardar proyecto', ['Ctrl', 'S']) + shortcut('Abrir proyecto', ['Ctrl', 'O']) +
      shortcut('Nuevo proyecto', ['Ctrl', 'N']) + shortcut('Duplicar mueble', ['Ctrl', 'D']) +
      shortcut('Ajustar vista', ['Shift', 'F']) + shortcut('Zoom', ['+', '−']) +
      shortcut('Vistas', ['1', '2', '3']) + shortcut('Rotar mueble', ['R']) +
      shortcut('Configurar rejilla', ['Shift', 'G']) +
      '</div></div></div>' +
      '<hr style="border:0;border-top:1px solid #26323e;margin:18px 0">' +
      '<div class="help-copy"><p><strong>Deshacer y rehacer.</strong> Usa los botones <strong>Deshacer</strong> y <strong>Rehacer</strong> de la barra de acciones, los iconos de la barra superior o <em>Ctrl+Z / Ctrl+Y</em>. El historial cubre dibujo, edición de propiedades, capas, láminas y cambios de nivel.</p>' +
      '<p><strong>Plantas.</strong> El proyecto nuevo se llama <strong>Planta</strong> y solo tiene una. Para añadir otra, usa <strong>Añadir planta</strong> en la barra de acciones o el botón <strong>+</strong> junto a las pestañas; el botón <strong>−</strong> elimina la planta activa y todos sus objetos (con confirmación y opción de deshacer). Debe quedar al menos una planta.</p>' +
      '<p><strong>Archivos.</strong> El botón Guardar descarga el proyecto en formato <strong>.json</strong>; también puedes abrir archivos <strong>.json</strong> y los antiguos <strong>.engdraft</strong>. El autoguardado sigue usando el navegador.</p>' +
      '<p><strong>Flujo recomendado.</strong> Dibuja el perímetro con la herramienta Muro, inserta puertas y ventanas sobre los muros, y pulsa <strong>Detectar ambientes</strong> para etiquetar los recintos. Amuebla desde la biblioteca y comprueba el resultado en 3D.</p>' +
      '<p><strong>Láminas y PDF.</strong> En la vista Láminas puedes escoger tamaño, orientación, escala y uno de los cuatro cajetines. Además de planta, notas y portada, las láminas admiten <strong>perspectiva 3D</strong>, <strong>fachada frontal</strong>, <strong>fachada posterior</strong>, <strong>lateral derecha</strong> e <strong>izquierda</strong>; la imagen se genera automáticamente desde el proyecto. Usa <strong>Actualizar vista</strong> si cambiaste el proyecto. El PDF conserva el plano vectorial y las vistas como imágenes de alta resolución.</p>' +
      '<p><strong>DWG/DXF.</strong> El navegador no escribe el formato binario propietario DWG; EngDraft exporta DXF R12, el formato de intercambio de AutoCAD. Abre el DXF en AutoCAD y usa <em>Guardar como → DWG</em> si necesitas ese formato.</p>' +
      '<p><strong>Unidades.</strong> El selector del sistema de unidades está en el menú izquierdo (sección superior, junto a <em>ES/EN</em>) y alterna entre métrico (m · m²) e imperial (ft · ft²). También puedes cambiarlo en Datos del proyecto. Las cotas, áreas, propiedades y láminas se actualizan.</p>' +
      '<p><strong>Rejilla a medida.</strong> Con <em>Shift+G</em> o el botón <strong>Rejilla</strong> del menú izquierdo abres el cuadro de rejilla: separación de líneas, línea maestra, origen y un paso de ajuste independiente. Un paso fino (por ejemplo 5 cm o 1") permite dibujar muros y huecos con dimensiones exactas sin perder la referencia visual.</p>' +
      '<p><strong>Tamaño de letra.</strong> El botón <em>Aa</em> de la barra de estado cambia el tamaño del texto entre Normal, Grande y Muy grande; la preferencia queda guardada en este navegador.</p>' +
      '<p><strong>Muros curvos.</strong> Con las herramientas <em>Muro en arco</em> (C) y <em>Muro spline</em> (K) dibujas muros curvos: en el arco, el tercer clic define la curvatura; en la spline, cada clic añade un punto y Enter o doble clic termina. Selecciona un muro curvo para ajustar su flecha, invertir el arco o quitar la curva desde Propiedades. Los muros curvos no admiten puertas ni ventanas en esta versión.</p>' +
      '<p><strong>Escena 3D.</strong> En la pestaña <em>Escena</em> del panel de ajustes eliges el modo de renderizado (esquemático o realista), el tipo de techo (plano, a dos aguas, <strong>cuatro aguas</strong>, arco, spline o <strong>Mi diseño</strong>), su altura y alero, los colores y texturas de paredes, techo y suelo, y el ángulo del sol. Arriba a la izquierda de la vista 3D tienes además los selectores rápidos <strong>Techo</strong> y <strong>Modo</strong>, y el botón <strong>Colores y texturas</strong> que abre directamente los materiales. El botón <em>Vuelo dron</em> inicia una animación de cámara alrededor de la maqueta; un clic en la vista la detiene.</p>' +
      '<p><strong>Vigas del techo.</strong> En <em>Escena → Techo → Estructura interior</em> eliges vigas de acero, hormigón o madera, con separación, canto y ancho. Se ven en la cara interior del techo en 3D y en las secciones.</p>' +
      '<p><strong>Diseñar techo.</strong> Desde <em>Escena → Diseñar techo</em>, desde el botón <strong>Diseñar techo</strong> de la vista 2D o eligiendo <em>Mi diseño</em> en el selector rápido, se abre un lienzo donde arrastras los puntos del perfil (doble clic añade un punto, clic derecho lo quita). Puedes partir de los presets Plano, A dos aguas, Cuatro aguas, Arco o Spline y ajustar altura, alero y orientación de la cumbrera.</p>' +
      '<p><strong>Snaps.</strong> En el menú izquierdo, sección <em>Dibujo</em>, puedes activar o desactivar los snaps de <strong>Extremo</strong>, <strong>Medio</strong>, <strong>Centro</strong>, <strong>Cuadrante</strong>, <strong>Tangente</strong> y <strong>Perpendicular</strong>. El cursor muestra el tipo de punto capturado mientras dibujas o mueves objetos.</p>' +
      '<p><strong>Líneas, curvas y escalado.</strong> Las herramientas <em>Línea</em> (L) y <em>Curva</em> (B) dibujan geometría de referencia encadenada (la curva con tres clics). <em>Escalar</em> (X) escala la selección alrededor de un punto base: mueve el cursor para el factor o escribe un número y pulsa Enter; Esc cancela.</p>' +
      '<p><strong>Vistas y secciones.</strong> En el menú izquierdo, la sección <em>Vistas</em> muestra la planta o genera el <strong>frontal</strong>, la <strong>posterior</strong>, los <strong>laterales derecho e izquierdo</strong> y las <strong>secciones transversal y longitudinal</strong> del proyecto en el área 2D, en modo lectura. En las secciones puedes mover la posición del corte con el control <em>Posición</em>; los botones Ajustar y el zoom funcionan también sobre la vista generada, y <em>Volver a planta</em> regresa al editor.</p>' +
      '<p><strong>Vistas editables.</strong> En las vistas frontal, posterior, laterales y secciones puedes hacer clic sobre un muro, una abertura, un mueble o el techo para seleccionarlo y editarlo desde Propiedades (o abrir Escena para el techo). La entidad seleccionada se resalta en ámbar y la vista se actualiza al cambiar los valores. El botón <strong>Editar en planta</strong> te lleva al editor completo con la selección conservada.</p>' +
      '<p><strong>Idioma.</strong> El botón <em>ES / EN</em> del menú izquierdo cambia toda la interfaz entre español e inglés; la preferencia se recuerda en este navegador. El plano, el manual y los datos del proyecto no se traducen.</p>' +
      '<p><strong>Pantalla.</strong> En la sección <em>Pantalla</em> del menú izquierdo eliges Automático, Computadora, Tableta o Celular. Automático adapta la interfaz al tamaño de la ventana: en tableta el menú es más estrecho y en celular el menú de opciones y el panel de ajustes se abren como paneles deslizantes con los botones de la barra superior, dejando el plano a toda pantalla. La preferencia se recuerda en este navegador.</p>' +
      '<p><strong>Importar objetos.</strong> En <em>Biblioteca</em> pulsa <strong>Importar objeto (.glb / .obj)</strong>. El formato recomendado es <strong>GLB</strong> (glTF 2.0 binario): un solo archivo, estándar web y con materiales; OBJ también se acepta. Indica nombre y dimensiones reales y el objeto se añade a <em>Mis objetos</em> para colocarlo, verlo en 3D y exportarlo. FBX, 3DS y STL no se admiten.</p>' +
      '<p><strong>Puertas y ventanas.</strong> Selecciona un muro y edita sus aberturas: tipo de hoja/ventana (simple, doble, corrediza, fija, proyectante o garaje), ancho, alto, posición, antepecho, sentido de apertura y bisagra. Los botones Girar hoja e Invertir bisagra cambian el dibujo en 2D y 3D.</p>' +
      '<p><strong>Donativos.</strong> EngDraft es gratuito y se mantiene con contribuciones voluntarias. Si quieres apoyar su desarrollo puedes hacer una donación por PayPal: ' +
      '<a class="btn btn-primary" style="margin-left:6px" href="https://www.paypal.com/ncp/payment/K6KXFVTEDKY96" target="_blank" rel="noopener">Donar con PayPal</a></p>' +
      '<p><strong>Privacidad.</strong> Todo se dibuja y se guarda en tu equipo. La aplicación funciona sin conexión y no envía datos a ningún servidor.</p>' +
      '<p><strong>Manual completo.</strong> El manual de uso incluye tutorial paso a paso, buenas prácticas, ejercicios, preguntas frecuentes y checklist de entrega: <a href="manual/EngDraft-Manual.pdf" target="_blank" rel="noopener">abrir manual en PDF</a>.</p>' +
      '<p><strong>Autor:</strong> ' + AUTHOR + '.</p>' +
      '<p><span class="badge-soft">ENGDRAFT 1.6</span> &nbsp; Guardado automático en el navegador. Descarga el archivo .json para conservar copias.</p></div>';
    openModal({
      title: 'Ayuda y atajos', subtitle: 'Todo lo necesario para empezar', body: body,
      footer: '<a class="btn btn-ghost" href="manual/EngDraft-Manual.pdf" target="_blank" rel="noopener">Manual PDF</a>' +
        '<button class="btn btn-primary" data-close>Cerrar</button>', wide: true
    });
  }

  function shortcut(label, keys) {
    return '<div class="shortcut-row"><span>' + esc(label) + '</span><span class="keys">' +
      keys.map(function (k) { return '<span class="kbd">' + esc(k) + '</span>'; }).join('') + '</span></div>';
  }

  // ================================================================== acciones de láminas
  function duplicateSheet() {
    var sheet = getSelectedSheet();
    if (!sheet) return;
    var copy = ED.Geo.deepClone(sheet);
    copy.id = App.store.newId('s');
    copy.name = (sheet.name || 'Lámina') + ' copia';
    var count = App.store.project.sheets.length;
    copy.sheetNo = 'A-' + String(count + 1).padStart(2, '0');
    var idx = App.store.project.sheets.indexOf(sheet);
    App.store.act('Duplicar lámina', function () { App.store.project.sheets.splice(idx + 1, 0, copy); });
    App.selectedSheetId = copy.id;
    renderSheets(); refreshProps();
    toast('Lámina duplicada.', 'success', 2200);
  }

  function deleteSheet() {
    var sheet = getSelectedSheet();
    if (!sheet) return;
    if (App.store.project.sheets.length <= 1) { toast('El proyecto debe conservar al menos una lámina.', 'warn'); return; }
    var idx = App.store.project.sheets.indexOf(sheet);
    App.store.act('Eliminar lámina', function () { App.store.project.sheets.splice(idx, 1); });
    App.selectedSheetId = (App.store.project.sheets[Math.max(0, idx - 1)] || App.store.project.sheets[0]).id;
    renderSheets(); refreshProps();
    toast('Lámina eliminada. Puedes deshacer con Ctrl+Z.', 'info', 2400);
  }

  function moveSheet(dir) {
    var sheet = getSelectedSheet();
    if (!sheet) return;
    var arr = App.store.project.sheets;
    var idx = arr.indexOf(sheet);
    var target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    App.store.act('Reordenar láminas', function () {
      arr.splice(idx, 1);
      arr.splice(target, 0, sheet);
    });
    renderSheets(); refreshProps();
  }

  // ================================================================== teclado
  function onKeyDown(e) {
    if (App.modalOpen) {
      if (e.key === 'Escape') { closeModal(); e.preventDefault(); }
      return;
    }
    if (App.fontMenuOpen && e.key === 'Escape') {
      closeFontMenu();
      e.preventDefault();
      return;
    }
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    if (typing) return;
    var key = e.key;
    var lower = key.length === 1 ? key.toLowerCase() : key;
    var meta = e.ctrlKey || e.metaKey;

    if (meta) {
      if (lower === 'z') { e.preventDefault(); if (App.store.undo()) afterHistory('Deshacer'); return; }
      if (lower === 'y') { e.preventDefault(); if (App.store.redo()) afterHistory('Rehacer'); return; }
      if (lower === 's') { e.preventDefault(); downloadProject(); return; }
      if (lower === 'o') { e.preventDefault(); $('#fileInput').click(); return; }
      if (lower === 'n') { e.preventDefault(); showTemplateModal(); return; }
      if (lower === 'd') {
        e.preventDefault();
        var selItem = App.store.selection.filter(function (s) { return s.kind === 'item'; })[0];
        if (selItem) duplicateItem(selItem.id);
        return;
      }
      return;
    }
    if (e.defaultPrevented) return;

    if (key === 'Escape') {
      var consumed = App.editor.cancel();
      if (!consumed) {
        if (App.activeTool !== 'select') chooseTool('select');
        else App.store.setSelection([]);
      }
      e.preventDefault();
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      if (App.store.selection.length) { e.preventDefault(); deleteSelection(); }
      return;
    }
    if (key === 'F1') { e.preventDefault(); showHelp(); return; }
    if (key === 'Home') { e.preventDefault(); App.editor.fitToContent(); updateZoomStatus(); return; }
    if (key === '?' || (key === '/' && e.shiftKey)) { e.preventDefault(); showHelp(); return; }
    if (key === '1') { setView('2d'); return; }
    if (key === '2') { setView('3d'); return; }
    if (key === '3') { setView('sheets'); return; }
    if (key === '+' || key === '=') { App.editor.zoomBy(1.25); updateZoomStatus(); return; }
    if (key === '-' || key === '_') { App.editor.zoomBy(0.8); updateZoomStatus(); return; }

    if (lower === 'v') { chooseTool('select'); e.preventDefault(); return; }
    if (lower === 'h') { chooseTool('pan'); e.preventDefault(); return; }
    if (lower === 'm') { chooseTool('wall'); e.preventDefault(); return; }
    if (lower === 'c') { chooseTool('wallArc'); e.preventDefault(); return; }
    if (lower === 'k') { chooseTool('wallSpline'); e.preventDefault(); return; }
    if (lower === 'l') { chooseTool('line'); e.preventDefault(); return; }
    if (lower === 'b') { chooseTool('curve'); e.preventDefault(); return; }
    if (lower === 'x') { chooseTool('scale'); e.preventDefault(); return; }
    if (lower === 'p') { chooseTool('door'); e.preventDefault(); return; }
    if (lower === 'n') { chooseTool('window'); e.preventDefault(); return; }
    if (lower === 'a') { chooseTool('room'); e.preventDefault(); return; }
    if (lower === 't') { chooseTool('text'); e.preventDefault(); return; }
    if (lower === 'd') { chooseTool('dim'); e.preventDefault(); return; }
    if (lower === 'e') { chooseTool('erase'); e.preventDefault(); return; }
    if (lower === 'f') {
      if (e.shiftKey) { App.editor.fitToContent(); updateZoomStatus(); }
      else chooseTool('furniture');
      e.preventDefault();
      return;
    }
    if (lower === 'g') {
      if (e.shiftKey) { showGridDialog(); e.preventDefault(); return; }
      toggleSnap('grid');
      e.preventDefault();
      return;
    }
    if (lower === 's') { toggleSnap('snapping'); e.preventDefault(); return; }
    if (lower === 'o') { toggleSnap('ortho'); e.preventDefault(); return; }
    if (lower === 'r') {
      if (App.activeTool === 'furniture') return;
      var item = App.store.selection.filter(function (s) { return s.kind === 'item'; })[0];
      if (item) { rotateItem(item.id, 1); e.preventDefault(); }
    }
  }

  // API de apoyo para depuración y automatización (no afecta la UI).
  App.setView = setView;
  App.setTool = chooseTool;
  App.exportPDF = exportPDF;
  App.toast = toast;
  App.showGridDialog = showGridDialog;
  App.showHelp = showHelp;
  App.setFontScale = function (scale) { applyFontScale(scale); };
  App.setRail = function (state) { applyRailState(state); };
  App.setInspector = function (state) { applyInspectorState(state); };
  App.showScene = function () { applyInspectorState('open'); setInspectorTab('scene'); };
  App.getSceneSettings = sceneSettings;
  App.setFlight = setFlight;
  App.toggleRealistic = toggleRealistic;
  App.applyScene = function () { applyScene3D(); if (App.view3d) { try { App.view3d.render(); } catch (e) { /* ignore */ } } };
  App.getGridSettings = gridSettings;
  App.applyGrid = applyGridToEditor;
  App.refresh = function () { refreshHeader(); refreshProps(); refreshLayers(); refreshLevelTabs(); };
  App.setViewMode = setViewMode;
  App.getViewMode = function () { return App.viewMode; };
  App.renderViews = renderViews;
  App.openRoofDesigner = openRoofDesigner;
  App.showImportModal = showImportModal;
  App.toggleLanguage = toggleLanguage;
  App.registerProjectAssets = registerProjectAssets;
  App.viewsOpts = viewsOpts;
  App.getViewsData = function () { return App.viewsData; };

  // ================================================================== arranque
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.EngDraft = window.EngDraft || {});
