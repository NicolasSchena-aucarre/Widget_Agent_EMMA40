// app.js
// Orchestration du widget : connexion à Grist, filtres Site / Service en
// cascade, et déclenchement du rendu des 3 graphiques à chaque
// changement de filtre.
(function () {
  'use strict';

  var WIDGET_BUILD = '2026-09-08-v1';
  console.log('[Tableau de bord] build ' + WIDGET_BUILD);

  var state = {
    reponses: [],
    sites: [],
    services: [],
    formulaires: [],      // [{id, Titre, Table_Technique, Actif}, ...]
    siteLabels: {},
    formulaireLabels: {},
    serviceLabels: {},
    filterSite: null,       // id de site sélectionné, ou null = tous
    filterService: null,    // id de service sélectionné, ou null = tous
    selectedFormulaireId: null, // null = vue générale ("Tous")
    technicalRowsCache: {}  // Table_Technique -> lignes déjà récupérées (rafraîchi au clic "Rafraîchir")
  };

  function init() {
    grist.ready({
      requiredAccess: 'read table'
    });

    document.getElementById('version-tag').textContent = 'build ' + WIDGET_BUILD;

    loadAndRender();

    document.getElementById('btn-refresh').addEventListener('click', function () {
      loadAndRender();
    });
  }

  async function loadAndRender() {
    try {
      var data = await DataViz.loadAll();
      state.reponses = data.reponses;
      state.sites = data.sites;
      state.services = data.services;
      state.formulaires = data.formulaires;
      state.siteLabels = data.siteLabels;
      state.formulaireLabels = data.formulaireLabels;
      state.serviceLabels = data.serviceLabels;
      state.technicalRowsCache = {}; // les données ont pu changer, on ne garde pas l'ancien cache

      document.getElementById('state-screen').hidden = true;
      document.getElementById('dashboard').hidden = false;

      populateSiteFilter();
      populateServiceFilter();
      populateFormTabs();
      renderAll();
    } catch (err) {
      console.error('[Tableau de bord] échec du chargement', err);
      document.getElementById('state-screen').textContent =
        'Impossible de charger les données : ' + (err && err.message ? err.message : err);
    }
  }

  // ---------------------------------------------------------------
  // Filtres
  // ---------------------------------------------------------------

  // Sites réellement présents dans les réponses visibles par l'utilisateur
  // (pas la liste complète de la table Sites) — un Manager ne verra donc
  // qu'un seul site dans ce sélecteur, cohérent avec son périmètre.
  function visibleSiteIds() {
    var ids = {};
    state.reponses.forEach(function (r) { if (r.Site) ids[r.Site] = true; });
    return Object.keys(ids).map(Number);
  }

  function visibleServiceIds(forSiteId) {
    var ids = {};
    state.reponses.forEach(function (r) {
      if (!r.Service) return;
      if (forSiteId && r.Site !== forSiteId) return;
      ids[r.Service] = true;
    });
    return Object.keys(ids).map(Number);
  }

  function populateSiteFilter() {
    var select = document.getElementById('filter-site');
    var current = state.filterSite;
    select.innerHTML = '<option value="">Tous les sites</option>';
    visibleSiteIds()
      .sort(function (a, b) { return (state.siteLabels[a] || '').localeCompare(state.siteLabels[b] || ''); })
      .forEach(function (id) {
        var opt = document.createElement('option');
        opt.value = String(id);
        opt.textContent = state.siteLabels[id] || ('#' + id);
        select.appendChild(opt);
      });
    select.value = current ? String(current) : '';
  }

  function populateServiceFilter() {
    var select = document.getElementById('filter-service');
    var current = state.filterService;
    select.innerHTML = '<option value="">Tous les services</option>';
    visibleServiceIds(state.filterSite)
      .sort(function (a, b) { return (state.serviceLabels[a] || '').localeCompare(state.serviceLabels[b] || ''); })
      .forEach(function (id) {
        var opt = document.createElement('option');
        opt.value = String(id);
        opt.textContent = state.serviceLabels[id] || ('#' + id);
        select.appendChild(opt);
      });
    // Si le service précédemment sélectionné n'appartient plus au site
    // choisi, on réinitialise plutôt que de garder un filtre incohérent.
    var stillValid = current && visibleServiceIds(state.filterSite).indexOf(current) !== -1;
    state.filterService = stillValid ? current : null;
    select.value = state.filterService ? String(state.filterService) : '';
  }

  function currentFilteredReponses() {
    return state.reponses.filter(function (r) {
      if (state.filterSite && r.Site !== state.filterSite) return false;
      if (state.filterService && r.Service !== state.filterService) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------
  // Onglets "type de formulaire"
  // ---------------------------------------------------------------
  function populateFormTabs() {
    var container = document.getElementById('form-tabs');
    var activeForms = state.formulaires.filter(function (f) { return f.Actif; });

    var html = '<button type="button" data-formulaire="" class="' +
      (state.selectedFormulaireId === null ? 'active' : '') + '">Tous</button>';
    activeForms.forEach(function (f) {
      var active = state.selectedFormulaireId === f.id ? ' active' : '';
      html += '<button type="button" data-formulaire="' + f.id + '" class="' + active.trim() + '">' +
        escapeHtml(f.Titre) + '</button>';
    });
    container.innerHTML = html;

    container.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.getAttribute('data-formulaire');
        state.selectedFormulaireId = val ? Number(val) : null;
        populateFormTabs(); // pour mettre à jour la classe "active"
        renderAll();
      });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bindFilterEvents() {
    document.getElementById('filter-site').addEventListener('change', function (e) {
      state.filterSite = e.target.value ? Number(e.target.value) : null;
      state.filterService = null; // le site change : le service redevient "Tous"
      populateServiceFilter();
      renderAll();
    });

    document.getElementById('filter-service').addEventListener('change', function (e) {
      state.filterService = e.target.value ? Number(e.target.value) : null;
      renderAll();
    });

    document.getElementById('filter-reset').addEventListener('click', function () {
      state.filterSite = null;
      state.filterService = null;
      populateSiteFilter();
      populateServiceFilter();
      renderAll();
    });
  }

  // ---------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------
  function renderAll() {
    var filtered = currentFilteredReponses();

    document.getElementById('filter-count').textContent =
      filtered.length + ' intervention' + (filtered.length > 1 ? 's' : '');

    var generalEl = document.getElementById('charts-general');
    var formulaireEl = document.getElementById('charts-formulaire');

    if (state.selectedFormulaireId === null) {
      generalEl.hidden = false;
      formulaireEl.hidden = true;
      renderGeneralCharts(filtered);
    } else {
      generalEl.hidden = true;
      formulaireEl.hidden = false;
      renderFormulaireCharts(state.selectedFormulaireId, filtered).catch(function (err) {
        console.error('[Tableau de bord] échec du rendu par formulaire', err);
        formulaireEl.innerHTML = '<div class="chart-card"><div class="chart-empty" style="position:static;">' +
          'Impossible d’afficher ce formulaire : ' + escapeHtml(err && err.message ? err.message : err) +
          '</div></div>';
      });
    }
  }

  function renderGeneralCharts(filtered) {
    renderOneChart('chart-formulaire', 'empty-formulaire',
      DataViz.countBy(filtered, 'Formulaire', state.formulaireLabels));

    renderOneChart('chart-site', 'empty-site',
      DataViz.countBy(filtered, 'Site', state.siteLabels));

    renderOneChart('chart-service', 'empty-service',
      DataViz.countBy(filtered, 'Service', state.serviceLabels));
  }

  // Récupère (avec cache) les lignes de la table technique d'un
  // formulaire, puis ne garde que celles dont la Reponse liée fait
  // partie des réponses actuellement filtrées (Site / Service / ce
  // formulaire) — c'est ce qui permet aux filtres Site/Service de
  // continuer à s'appliquer même en vue "par formulaire".
  async function renderFormulaireCharts(formulaireId, filteredReponses) {
    var formulaire = state.formulaires.filter(function (f) { return f.id === formulaireId; })[0];
    if (!formulaire || !formulaire.Table_Technique) {
      document.getElementById('charts-formulaire').innerHTML =
        '<div class="chart-card">Ce formulaire n’a pas de table technique configurée.</div>';
      return;
    }
    var tableId = formulaire.Table_Technique;

    var allowedReponseIds = {};
    filteredReponses.forEach(function (r) {
      if (r.Formulaire === formulaireId) allowedReponseIds[r.id] = true;
    });

    document.getElementById('charts-formulaire').innerHTML =
      '<div class="chart-card"><div class="state-screen" style="padding:24px 0;">' +
      '<div class="spinner"></div>Chargement des champs du formulaire…</div></div>';

    var fields = await DataViz.discoverChartableFields(tableId);

    if (!state.technicalRowsCache[tableId]) {
      var raw = await grist.docApi.fetchTable(tableId);
      state.technicalRowsCache[tableId] = DataViz.toRows(raw);
    }
    var technicalRows = state.technicalRowsCache[tableId].filter(function (row) {
      return allowedReponseIds[row.Reponse];
    });

    if (!fields.length) {
      document.getElementById('charts-formulaire').innerHTML =
        '<div class="chart-card">Aucun champ de type Choix, Booléen ou Numérique trouvé sur ce formulaire.</div>';
      return;
    }

    var html = fields.map(function (f) {
      var canvasId = 'chart-field-' + f.key;
      if (f.kind === 'number') {
        return '<div class="chart-card"><h2>' + escapeHtml(f.label) + ' (moyenne)</h2>' +
          '<div class="stat-card" id="stat-' + f.key + '"></div></div>';
      }
      return '<div class="chart-card"><h2>' + escapeHtml(f.label) + '</h2>' +
        '<div class="chart-wrap"><canvas id="' + canvasId + '"></canvas></div>' +
        '<div class="chart-empty" id="empty-field-' + f.key + '" hidden>Aucune donnée pour cette sélection</div></div>';
    }).join('');
    document.getElementById('charts-formulaire').innerHTML = html;

    fields.forEach(function (f) {
      if (f.kind === 'number') {
        var avg = DataViz.averageOf(technicalRows, f.key);
        var statEl = document.getElementById('stat-' + f.key);
        statEl.innerHTML = (avg === null)
          ? '<div class="stat-sub">Aucune donnée pour cette sélection</div>'
          : '<div class="stat-value">' + avg.toFixed(2) + '</div><div class="stat-sub">' +
            technicalRows.length + ' valeur' + (technicalRows.length > 1 ? 's' : '') + '</div>';
      } else {
        renderOneChart('chart-field-' + f.key, 'empty-field-' + f.key,
          DataViz.countByRaw(technicalRows, f.key));
      }
    });
  }

  function renderOneChart(canvasId, emptyId, data) {
    var emptyEl = document.getElementById(emptyId);
    var canvas = document.getElementById(canvasId);
    if (data.length) {
      emptyEl.hidden = true;
      canvas.hidden = false;
      DataVizCharts.renderBarChart(canvasId, data);
    } else {
      emptyEl.hidden = false;
      canvas.hidden = true;
    }
  }

  bindFilterEvents();
  init();
})();
