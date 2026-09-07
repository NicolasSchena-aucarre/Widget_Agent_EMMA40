// app.js
// Orchestration du widget : connexion à Grist, filtres Site / Service en
// cascade, et déclenchement du rendu des 3 graphiques à chaque
// changement de filtre.
(function () {
  'use strict';

  var state = {
    reponses: [],
    sites: [],
    services: [],
    siteLabels: {},
    formulaireLabels: {},
    serviceLabels: {},
    filterSite: null,    // id de site sélectionné, ou null = tous
    filterService: null  // id de service sélectionné, ou null = tous
  };

  function init() {
    grist.ready({
      requiredAccess: 'read table'
    });

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
      state.siteLabels = data.siteLabels;
      state.formulaireLabels = data.formulaireLabels;
      state.serviceLabels = data.serviceLabels;

      document.getElementById('state-screen').hidden = true;
      document.getElementById('dashboard').hidden = false;

      populateSiteFilter();
      populateServiceFilter();
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

    renderOneChart('chart-formulaire', 'empty-formulaire',
      DataViz.countBy(filtered, 'Formulaire', state.formulaireLabels));

    renderOneChart('chart-site', 'empty-site',
      DataViz.countBy(filtered, 'Site', state.siteLabels));

    renderOneChart('chart-service', 'empty-service',
      DataViz.countBy(filtered, 'Service', state.serviceLabels));
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
