// data.js
// Récupération des tables Grist et mise en forme en tableaux de lignes /
// dictionnaires de correspondance (id -> libellé), pour que app.js et
// charts.js n'aient jamais à connaître le format "colonnes" renvoyé par
// grist.docApi.fetchTable.
(function (global) {
  'use strict';

  // Convertit une table au format "colonnes" (celui renvoyé par
  // fetchTable : {id:[...], ColA:[...], ColB:[...]}) en tableau de lignes
  // [{id, ColA, ColB}, ...], plus pratique à manipuler.
  function toRows(table) {
    var keys = Object.keys(table).filter(function (k) { return k !== 'tableId'; });
    var n = table.id.length;
    var rows = [];
    for (var i = 0; i < n; i++) {
      var row = {};
      for (var j = 0; j < keys.length; j++) {
        row[keys[j]] = table[keys[j]][i];
      }
      rows.push(row);
    }
    return rows;
  }

  // Construit un dictionnaire id -> valeur d'un champ, pour retrouver
  // rapidement un libellé à partir d'une référence.
  function buildLookup(rows, field) {
    var map = {};
    rows.forEach(function (r) { map[r.id] = r[field]; });
    return map;
  }

  // Charge les 4 tables nécessaires au tableau de bord. Ce que
  // fetchTable renvoie respecte déjà les règles d'accès du document :
  // un Manager ne recevra que les lignes de Reponses de son propre
  // service, etc. — le widget n'a donc rien à filtrer lui-même pour la
  // sécurité, seulement pour l'interactivité (les sélecteurs).
  async function loadAll() {
    var results = await Promise.all([
      grist.docApi.fetchTable('Reponses'),
      grist.docApi.fetchTable('Formulaires'),
      grist.docApi.fetchTable('Sites'),
      grist.docApi.fetchTable('Services')
    ]);

    var reponses = toRows(results[0]);
    var formulaires = toRows(results[1]);
    var sites = toRows(results[2]);
    var services = toRows(results[3]);

    var siteLabels = buildLookup(sites, 'Nom');
    var formulaireLabels = buildLookup(formulaires, 'Titre');

    // Le libellé d'un service inclut le nom du site, pour lever
    // l'ambiguïté entre deux services de même type sur des sites
    // différents (ex. "Distribution" à Site Nord et à Site Sud).
    var serviceLabels = {};
    services.forEach(function (s) {
      var siteName = siteLabels[s.Site] || '';
      serviceLabels[s.id] = s.Type + (siteName ? ' (' + siteName + ')' : '');
    });

    return {
      reponses: reponses,
      sites: sites,
      services: services,
      siteLabels: siteLabels,
      formulaireLabels: formulaireLabels,
      serviceLabels: serviceLabels
    };
  }

  // Compte les lignes de `rows` groupées par la valeur du champ `field`,
  // en traduisant chaque id via `labels`. Retourne un tableau trié par
  // effectif décroissant : [{id, label, count}, ...].
  function countBy(rows, field, labels) {
    var counts = {};
    rows.forEach(function (r) {
      var key = r[field];
      if (key === null || key === undefined || key === 0) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts)
      .map(function (key) {
        var id = Number(key);
        return { id: id, label: labels[id] || ('#' + id), count: counts[key] };
      })
      .sort(function (a, b) { return b.count - a.count; });
  }

  global.DataViz = {
    toRows: toRows,
    buildLookup: buildLookup,
    loadAll: loadAll,
    countBy: countBy
  };
})(window);
