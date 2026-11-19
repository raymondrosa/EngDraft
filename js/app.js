/* EngDraft — aplicación, interfaz y flujos de trabajo */
(function (ED) {
  'use strict';

  var App = {
    booted: false,
    view: '2d',
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
    road: '<path d="M7 16 5.6 4M13 16l1.4-12" stroke-width="1.4" stroke-linecap="round"/><path d="M10 5.5v2M10 9.5v2M10 13.5v2" stroke-width="1.2" stroke-linecap="round"/>'
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

    injectShell();
    bindStatic();
    initEditor();
    initStoreEvents();
    App.selectedSheetId = App.store.project.sheets.length ? App.store.project.sheets[0].id : null;

    refreshHeader();
    refreshLevelTabs();
    refreshUndo();
    setSaveState('saved');
    setView('2d');
    App.editor.fitToContent();
    App.editor.render();
    refreshProps();
    refreshLayers();
    renderLibrary();
    updateZoomStatus();

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
        roof: { style: 'flat', height: 1200, overhang: 400 },
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
      levels: [{ id: 'l0', name: 'Planta baja', elevation: 0, height: 2800 }],
      walls: [], rooms: [], items: [], texts: [], dims: [],
      sheets: [{ id: 's_blank', name: 'Planta', size: 'A3', orientation: 'landscape', template: 'modern', scale: 100, content: 'plan', levelId: 'l0', sheetNo: 'A-01', title: 'PLANTA', notes: '', showDims: true, showFurniture: true, showRooms: true, showGrid: false }]
    };
    return p;
  }

  // ================================================================== shell
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
      { id: 'door', label: 'Puerta', key: 'P', icon: 'door' },
      { id: 'window', label: 'Ventana', key: 'N', icon: 'window' },
      { id: 'room', label: 'Ambiente', key: 'A', icon: 'room' },
      { sep: true },
      { id: 'furniture', label: 'Muebles', key: 'F', icon: 'furniture', title: 'Muebles, plantas y vías' },
      { id: 'text', label: 'Texto', key: 'T', icon: 'text' },
      { id: 'dim', label: 'Cota', key: 'D', icon: 'dim' },
      { sep: true },
      { id: 'erase', label: 'Borrar', key: 'E', icon: 'erase' }
    ];
    list.innerHTML = tools.map(function (t) {
      if (t.sep) return '<div class="tool-sep"></div>';
      var full = t.title || t.label;
      return '<button class="tool-btn' + (t.id === 'select' ? ' active' : '') + '" data-tool="' + t.id + '" title="' + esc(full) + ' (' + t.key + ')">' +
        icon(t.icon) + '<small>' + esc(t.label) + '</small><span class="key">' + t.key + '</span></button>';
    }).join('') + '<div class="rail-foot"><button class="tool-btn" data-tool="fit" title="Ajustar vista (Shift+F)">' +
      icon('fit') + '<small>Ajustar</small><span class="key">F</span></button></div>';
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
    $('#btnUnits').addEventListener('click', toggleUnits);
    $('#projectNameBtn').addEventListener('click', showProjectInfo);
    if ($('#btnGridSetup')) $('#btnGridSetup').addEventListener('click', function (e) { e.preventDefault(); showGridDialog(); });
    if ($('#btnGridStatus')) $('#btnGridStatus').addEventListener('click', function () { showGridDialog(); });
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

    $$('#viewTabs button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
    });
    $$('#inspectorTabs button').forEach(function (b) {
      b.addEventListener('click', function () { setInspectorTab(b.getAttribute('data-tab')); });
    });
    $$('#canvasToggles button[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () { toggleSnap(b.getAttribute('data-toggle')); });
    });
    $('#btnFit2d').addEventListener('click', function () { App.editor.fitToContent(); updateZoomStatus(); });
    $('#zoomIn').addEventListener('click', function () { App.editor.zoomBy(1.25); updateZoomStatus(); });
    $('#zoomOut').addEventListener('click', function () { App.editor.zoomBy(0.8); updateZoomStatus(); });
    $('#fileInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) openFile(e.target.files[0]);
      e.target.value = '';
    });

    $('#toolrail').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tool]');
      if (!btn) return;
      var tool = btn.getAttribute('data-tool');
      if (tool === 'fit') { App.editor.fitToContent(); updateZoomStatus(); return; }
      chooseTool(tool);
    });
    $('#levelTabs').addEventListener('click', function (e) {
      var add = e.target.closest('[data-level-add]');
      if (add) { showLevelModal(); return; }
      var tab = e.target.closest('[data-level]');
      if (tab) {
        App.store.setActiveLevel(tab.getAttribute('data-level'));
        App.editor.render();
        refreshProps();
        updateZoomStatus();
      }
    });
    $('#stageActions').addEventListener('click', onStageAction);
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
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (App.view === 'sheets') scheduleSheetPreviews(80);
      }, 180);
    });
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
        if (App.tab === 'scene' && !isInspectorInputFocused()) renderScenePanel();
        if (App.view === '3d') schedule3D();
        if (App.view === 'sheets') scheduleSheetPreviews();
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
    refreshProps();
    App.editor.render();
    if (App.view === '3d') schedule3D();
    $('#statusTool').textContent = label || 'Historial actualizado';
  }

  function refreshUndo() {
    var u = $('#btnUndo'), r = $('#btnRedo');
    if (!App.store) return;
    u.disabled = !App.store.canUndo();
    r.disabled = !App.store.canRedo();
  }

  function refreshHeader() {
    var p = App.store.project;
    $('#projectName').textContent = (p.meta && p.meta.name) || 'Proyecto sin nombre';
    document.title = ((p.meta && p.meta.name) || 'EngDraft') + ' — EngDraft';
    var lvl = App.store.activeLevelObj();
    $('#statusLevel').textContent = lvl ? lvl.name : 'Nivel';
    updateUnitsUI();
  }

  function updateUnitsUI() {
    var btn = $('#btnUnits');
    if (btn) {
      btn.textContent = unitsBadge();
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
    }).join('') + '<button class="level-add" data-level-add title="Añadir nivel">+</button>';
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
    if (!App.editor) return;
    var z = App.editor.view.zoom;
    $('#statusZoom').textContent = 'Zoom ' + Math.round(z * 1000) + '%';
  }

  function syncCanvasToggles() {
    if (!App.editor) return;
    $$('#canvasToggles [data-toggle]').forEach(function (b) {
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
  var ROOF_STYLES = { flat: 'Plano', gable: 'A dos aguas', arc: 'Arco', spline: 'Spline' };
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
      roofHeight: n(roof.height, 1200),
      roofOverhang: n(roof.overhang, 400),
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
      '<div class="field-grid">' +
      field('Altura / flecha', '<div class="input-row"><input class="input" type="number" min="0.2" step="0.1" data-scene-field="roofHeight" value="' + unitLenInput(sc.roofHeight) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      field('Alero', '<div class="input-row"><input class="input" type="number" min="0" step="0.1" data-scene-field="roofOverhang" value="' + unitLenInput(sc.roofOverhang) + '"><span class="input-unit">' + unitLenLabel() + '</span></div>') +
      '</div><div class="field-hint">Arco y spline generan una cubierta curva sobre la planta del último nivel.</div></div>';

    html += '<div class="scene-group"><div class="section-title">Materiales</div>' +
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
      App.store.act('Tipo de techo', function () {
        App.store.project.settings.roof.style = ROOF_STYLES[t.value] ? t.value : 'flat';
      });
      applyScene3D(); schedule3D(); renderScenePanel();
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
    $$('#viewTabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    ['2d', '3d', 'sheets'].forEach(function (v) {
      var sec = $('#view' + (v === '2d' ? '2d' : v === '3d' ? '3d' : 'Sheets'));
      if (sec) sec.classList.toggle('active', v === view);
    });
    updateStageActions();
    if (view === '2d') {
      setTimeout(function () {
        if (App.view !== '2d') return;
        App.editor._resize();
        App.editor.render();
        updateZoomStatus();
      }, 40);
      refreshProps();
    } else if (view === '3d') {
      ensure3D(true);
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
    return { plan: 'Planta', notes: 'Notas', cover: 'Portada', '3d': 'Vista 3D' }[content] || 'Planta';
  }

  function renderSheets() {
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
  function updateStageActions() {
    var wrap = $('#stageActions');
    if (!wrap) return;
    var html = '';
    if (App.view === '2d') {
      html = '<button class="stage-action" data-stage-action="detect-rooms">' + icon('sparkle', 14) + 'Detectar ambientes</button>' +
        '<button class="stage-action" data-stage-action="auto-dims">' + icon('measure', 14) + 'Cotas generales</button>' +
        '<button class="stage-action" data-stage-action="grid">' + icon('grid', 14) + 'Rejilla</button>' +
        '<button class="stage-action" data-stage-action="fit">' + icon('fit', 14) + 'Ajustar</button>';
    } else if (App.view === '3d') {
      html = '<div class="stage-action-group">' +
        ['iso', 'top', 'front', 'right'].map(function (p) {
          return '<button class="stage-action' + (App.preset3d === p ? ' active' : '') + '" data-preset="' + p + '">' +
            ({ iso: 'Iso', top: 'Planta', front: 'Frente', right: 'Lateral' }[p]) + '</button>';
        }).join('') + '</div>' +
        '<button class="stage-action" data-stage-action="fit3d">' + icon('fit', 14) + 'Encuadrar</button>' +
        '<button class="stage-action' + (sceneSettings().render.mode === 'realistic' ? ' active' : '') + '" data-stage-action="realistic">' + icon('sun', 14) + 'Realista</button>' +
        '<button class="stage-action' + (App.flight ? ' active flight' : '') + '" data-stage-action="flight">' + icon('drone', 14) + (App.flight ? 'Detener vuelo' : 'Vuelo dron') + '</button>' +
        '<button class="stage-action" data-stage-action="scene">' + icon('palette', 14) + 'Escena</button>' +
        '<button class="stage-action" data-stage-action="capture3d">' + icon('camera', 14) + 'Captura</button>';
    } else {
      html = '<button class="stage-action" data-stage-action="new-sheet">' + icon('plus', 14) + 'Nueva lámina</button>' +
        '<button class="stage-action" data-stage-action="export-pdf">' + icon('pdf', 14) + 'Exportar PDF</button>';
    }
    wrap.innerHTML = html;
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
    if (action === 'realistic') { toggleRealistic(); return; }
    if (action === 'flight') { setFlight(!App.flight); return; }
    if (action === 'scene') { applyInspectorState('open'); setInspectorTab('scene'); return; }
    if (action === 'detect-rooms') {
      var count = App.editor.detectRooms();
      if (count) { toast(count + ' ambiente' + (count === 1 ? '' : 's') + ' detectado' + (count === 1 ? '' : 's') + '.', 'success', 3000); refreshProps(); }
      else toast('No se encontraron recintos nuevos. Cierra los muros y vuelve a intentar.', 'warn', 3400);
    } else if (action === 'auto-dims') addAutoDims();
    else if (action === 'grid') showGridDialog();
    else if (action === 'fit') { App.editor.fitToContent(); updateZoomStatus(); }
    else if (action === 'fit3d') { if (App.view3d && App.view3d.fit) App.view3d.fit(); if (App.view3d) App.view3d.render(); }
    else if (action === 'capture3d') capture3D();
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
      downloadBlob(blob, safeName(App.store.project.meta.name) + '.engdraft');
      setSaveState('saved');
      toast('Proyecto descargado como .engdraft', 'success', 3000);
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
    var selected = App.store.getSelectionObjects();
    if (selected.length === 1) renderEntityProps(selected[0]);
    else if (selected.length > 1) renderMultiProps(selected);
    else renderProjectSummary();
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
    var statsHtml = '<div class="section"><div class="section-title">Nivel activo <span class="count">' + esc(level.name) + '</span></div>' +
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
      '<div class="read-line"><span>Niveles</span><strong>' + p.levels.length + '</strong></div></div>';
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
    return { wall: 'wall', item: 'furniture', room: 'room', text: 'text', dim: 'dim' }[kind] || 'info';
  }
  function kindLabel(kind) {
    return { wall: 'Muro', item: 'Mobiliario', room: 'Ambiente', text: 'Texto', dim: 'Cota' }[kind] || 'Objeto';
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
        return '<div class="opening-row">' +
          '<div class="opening-head"><strong><span class="dot"></span>' + typeLabel +
          ' <span class="badge-soft">' + unitSizeInput(o.width) + ' ' + esc(sizeU) + '</span></strong>' +
          '<button class="icon-mini" data-action="delete-opening" data-wall="' + esc(obj.id) + '" data-opening="' + esc(o.id) + '" title="Eliminar abertura">' + icon('trash', 12) + '</button></div>' +
          '<div class="mini-grid" style="grid-template-columns:1fr 1fr 1fr">' +
          '<input class="input" type="number" min="300" step="50" title="Ancho (' + sizeU + ')" data-opening="' + esc(o.id) + '" data-wall="' + esc(obj.id) + '" data-open-field="width" value="' + unitSizeInput(o.width) + '">' +
          '<input class="input" type="number" min="300" step="50" title="Alto (' + sizeU + ')" data-opening="' + esc(o.id) + '" data-wall="' + esc(obj.id) + '" data-open-field="height" value="' + unitSizeInput(o.height) + '">' +
          '<input class="input" type="number" min="0" max="100" step="1" title="Posición (%)" data-opening="' + esc(o.id) + '" data-wall="' + esc(obj.id) + '" data-open-field="t" value="' + fnum(o.t * 100, 1) + '">' +
          '</div><div class="opening-meta">Ancho · alto (' + sizeU + ') · posición (%)</div>' + actions + '</div>';
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
      '<button class="btn btn-danger btn-sm" data-action="delete-selection">' + icon('trash', 12) + 'Eliminar ' + (kind === 'wall' ? 'muro' : kind === 'item' ? 'mueble' : kind === 'room' ? 'ambiente' : kind === 'text' ? 'texto' : 'cota') + '</button></div>';
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
        [['plan', 'Planta del nivel'], ['notes', 'Notas y cuadros'], ['cover', 'Portada'], ['3d', 'Vista 3D']].map(function (x) {
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
      (sheet.content === '3d' ? '<div class="modal-note" style="margin-top:8px">' + icon('camera', 15) + '<div>' + (sheet.imageDataUrl ? 'Esta lámina ya tiene una captura 3D.' : 'Esta lámina 3D aún no tiene imagen. Usa <strong>Captura a lámina</strong> desde la vista 3D.') + '</div></div>' : '') +
      '</div>';
    html += '<div class="section"><div class="section-title">Acciones</div><div class="prop-actions">' +
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
        else sheet[sf] = sv;
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
    else if (action === 'new-sheet') addSheet();
    else if (action === 'sheet-export') { var sh = getSelectedSheet(); if (sh) exportPDF([sh]); }
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
        id: App.store.newId('o'), type: type, t: 0.5, width: width,
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
      '<div class="lib-hint"><strong>Cómo colocar:</strong> elige un mueble, mueve el cursor sobre el plano y haz clic. Pulsa <strong>R</strong> para rotar 90° y <strong>Esc</strong> para salir.</div>';
    renderLibraryGrid();
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
  }

  function onLayerClick(e) {
    var btn = e.target.closest('[data-layer-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-layer-act');
    if (act === 'showall') {
      App.store.project.layers.forEach(function (l) { l.visible = true; l.locked = false; });
      App.store.touch();
      refreshLayers();
      App.editor.render();
      return;
    }
    var layer = App.store.getLayer(btn.getAttribute('data-layer'));
    if (!layer) return;
    if (act === 'visible') layer.visible = layer.visible === false;
    else if (act === 'locked') layer.locked = !layer.locked;
    App.store.touch();
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

  function showLevelModal() {
    var levels = App.store.levels();
    var nextElev = 0;
    levels.forEach(function (l) { nextElev = Math.max(nextElev, n(l.elevation, 0) + n(l.height, 2800)); });
    var body = '<div class="field"><label>Nombre del nivel</label><input class="input" id="lvlName" value="Nivel ' + (levels.length + 1) + '"></div>' +
      '<div class="field-grid">' +
      '<div class="field"><label>Elevación</label><div class="input-row"><input class="input" id="lvlElev" type="number" step="0.05" value="' + unitLenInput(nextElev) + '"><span class="input-unit">' + unitLenLabel() + '</span></div></div>' +
      '<div class="field"><label>Altura libre</label><div class="input-row"><input class="input" id="lvlHeight" type="number" step="0.05" value="' + unitLenInput(2800) + '"><span class="input-unit">' + unitLenLabel() + '</span></div></div>' +
      '</div><div class="modal-note">' + icon('info', 15) + '<div>El nivel se apila automáticamente en la vista 3D según su elevación.</div></div>';
    var footer = '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="lvlAdd">Añadir nivel</button>';
    var m = openModal({ title: 'Añadir nivel', subtitle: 'Planta adicional del proyecto', body: body, footer: footer, narrow: true });
    $('#lvlAdd', m.root).addEventListener('click', function () {
      var name = ($('#lvlName', m.root).value || '').trim() || ('Nivel ' + (levels.length + 1));
      var elev = parseLenInput(($('#lvlElev', m.root).value || 0));
      if (!isFinite(elev)) elev = nextElev;
      var height = Math.max(1500, parseLenInput(($('#lvlHeight', m.root).value || 0)));
      if (!isFinite(height) || height <= 0) height = 2800;
      var id = 'l' + Date.now().toString(36);
      while (App.store.levels().some(function (l) { return l.id === id; })) id += 'x';
      App.store.act('Añadir nivel', function () {
        App.store.project.levels.push({ id: id, name: name, elevation: elev, height: height });
      });
      App.store.setActiveLevel(id);
      refreshLevelTabs();
      refreshHeader();
      m.close();
      toast('Nivel “' + name + '” añadido.', 'success', 2600);
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
      '<div class="help-copy"><p><strong>Flujo recomendado.</strong> Dibuja el perímetro con la herramienta Muro, inserta puertas y ventanas sobre los muros, y pulsa <strong>Detectar ambientes</strong> para etiquetar los recintos. Amuebla desde la biblioteca y comprueba el resultado en 3D.</p>' +
      '<p><strong>Láminas y PDF.</strong> En la vista Láminas puedes escoger tamaño, orientación, escala y uno de los cuatro cajetines. El PDF se genera vectorial, con el plano nítido a cualquier zoom.</p>' +
      '<p><strong>DWG/DXF.</strong> El navegador no escribe el formato binario propietario DWG; EngDraft exporta DXF R12, el formato de intercambio de AutoCAD. Abre el DXF en AutoCAD y usa <em>Guardar como → DWG</em> si necesitas ese formato.</p>' +
      '<p><strong>Unidades.</strong> El botón del sistema de unidades en la barra de estado alterna entre métrico (m · m²) e imperial (ft · ft²). También puedes cambiarlo en Datos del proyecto. Las cotas, áreas, propiedades y láminas se actualizan.</p>' +
      '<p><strong>Rejilla a medida.</strong> Con <em>Shift+G</em> o el botón <strong>Rejilla</strong> del lienzo abres el cuadro de rejilla: separación de líneas, línea maestra, origen y un paso de ajuste independiente. Un paso fino (por ejemplo 5 cm o 1") permite dibujar muros y huecos con dimensiones exactas sin perder la referencia visual.</p>' +
      '<p><strong>Tamaño de letra.</strong> El botón <em>Aa</em> de la barra de estado cambia el tamaño del texto entre Normal, Grande y Muy grande; la preferencia queda guardada en este navegador.</p>' +
      '<p><strong>Muros curvos.</strong> Con las herramientas <em>Muro en arco</em> (C) y <em>Muro spline</em> (K) dibujas muros curvos: en el arco, el tercer clic define la curvatura; en la spline, cada clic añade un punto y Enter o doble clic termina. Selecciona un muro curvo para ajustar su flecha, invertir el arco o quitar la curva desde Propiedades. Los muros curvos no admiten puertas ni ventanas en esta versión.</p>' +
      '<p><strong>Escena 3D.</strong> En la pestaña <em>Escena</em> del panel de ajustes eliges el modo de renderizado (esquemático o realista), el tipo de techo (plano, a dos aguas, arco o spline), su altura y alero, los colores y texturas de paredes, techo y suelo, y el ángulo del sol. El botón <em>Vuelo dron</em> inicia una animación de cámara alrededor de la maqueta; un clic en la vista la detiene.</p>' +
      '<p><strong>Puertas y ventanas.</strong> Selecciona un muro y edita sus aberturas: ancho, alto, posición, antepecho, sentido de apertura y bisagra. Los botones Girar hoja e Invertir bisagra cambian el dibujo en 2D y 3D.</p>' +
      '<p><strong>Privacidad.</strong> Todo se dibuja y se guarda en tu equipo. La aplicación funciona sin conexión y no envía datos a ningún servidor.</p>' +
      '<p><strong>Manual completo.</strong> El manual de uso incluye tutorial paso a paso, buenas prácticas, ejercicios, preguntas frecuentes y checklist de entrega: <a href="manual/EngDraft-Manual.pdf" target="_blank" rel="noopener">abrir manual en PDF</a>.</p>' +
      '<p><strong>Autor:</strong> ' + AUTHOR + '.</p>' +
      '<p><span class="badge-soft">ENGDRAFT 1.2</span> &nbsp; Guardado automático en el navegador. Descarga el archivo .engdraft para conservar copias.</p></div>';
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

  // ================================================================== arranque
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.EngDraft = window.EngDraft || {});
