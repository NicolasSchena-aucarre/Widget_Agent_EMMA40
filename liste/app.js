// app.js
(function () {
  'use strict';

  var WIDGET_BUILD = '2026-09-08-v2';
  console.log('[Consultation] build ' + WIDGET_BUILD);

  var state = {
    reponses: [],
    formulaires: [],
    formulaireLabels: {},
    agentLabels: {},
    siteLabels: {},
    serviceLabels: {},
    selectedId: null,
    technicalCache: {} // "tableId:reponseId" -> ligne technique déjà récupérée
  };

  function init() {
    grist.ready({ requiredAccess: 'read table' });
    document.getElementById('version-tag').textContent = 'build ' + WIDGET_BUILD;
    document.getElementById('btn-refresh').addEventListener('click', loadAndRender);
    loadAndRender();
  }

  async function loadAndRender() {
    try {
      var data = await DataViz.loadAll();
      state.reponses = data.reponses.sort(function (a, b) { return b.Date_Intervention - a.Date_Intervention; });
      state.formulaires = data.formulaires;
      state.formulaireLabels = data.formulaireLabels;
      state.agentLabels = data.agentLabels;
      state.siteLabels = data.siteLabels;
      state.serviceLabels = data.serviceLabels;
      state.technicalCache = {};

      document.getElementById('state-screen').hidden = true;
      document.getElementById('main').hidden = false;

      renderList();
      renderDetail(); // vide au premier chargement, sauf si une sélection existait déjà
    } catch (err) {
      console.error('[Consultation] échec du chargement', err);
      document.getElementById('state-screen').textContent =
        'Impossible de charger les données : ' + (err && err.message ? err.message : err);
    }
  }

  // ---------------------------------------------------------------
  // Liste
  // ---------------------------------------------------------------
  function formatDate(epochSeconds) {
    if (!epochSeconds) return '';
    var d = new Date(epochSeconds * 1000);
    return d.toLocaleDateString('fr-FR');
  }

  function renderList() {
    var listEl = document.getElementById('list');
    document.getElementById('list-count').textContent =
      state.reponses.length + ' réponse' + (state.reponses.length > 1 ? 's' : '');

    if (!state.reponses.length) {
      listEl.innerHTML = '<div class="list-empty">Aucune réponse visible avec votre rôle actuel.</div>';
      return;
    }

    listEl.innerHTML = state.reponses.map(function (r) {
      var active = r.id === state.selectedId ? ' active' : '';
      var titre = state.formulaireLabels[r.Formulaire] || 'Formulaire inconnu';
      var agent = state.agentLabels[r.Agent] || '';
      return '<div class="list-item' + active + '" data-id="' + r.id + '">' +
        '<div class="li-title">' + escapeHtml(titre) + '</div>' +
        '<div class="li-sub">' + escapeHtml(formatDate(r.Date_Intervention)) +
          (agent ? ' — ' + escapeHtml(agent) : '') + '</div>' +
      '</div>';
    }).join('');

    listEl.querySelectorAll('.list-item').forEach(function (el) {
      el.addEventListener('click', function () {
        state.selectedId = Number(el.getAttribute('data-id'));
        renderList();
        renderDetail();
      });
    });
  }

  // ---------------------------------------------------------------
  // Détail (formulaire rempli, lecture seule)
  // ---------------------------------------------------------------
  async function renderDetail() {
    var emptyEl = document.getElementById('detail-empty');
    var contentEl = document.getElementById('detail-content');

    if (state.selectedId === null) {
      emptyEl.hidden = false;
      contentEl.hidden = true;
      return;
    }

    var reponse = state.reponses.filter(function (r) { return r.id === state.selectedId; })[0];
    if (!reponse) { emptyEl.hidden = false; contentEl.hidden = true; return; }

    emptyEl.hidden = true;
    contentEl.hidden = false;
    contentEl.innerHTML = '<div class="state-screen" style="padding:24px 0;"><div class="spinner"></div>Chargement du détail…</div>';

    var formulaire = state.formulaires.filter(function (f) { return f.id === reponse.Formulaire; })[0];
    if (!formulaire || !formulaire.Table_Technique) {
      contentEl.innerHTML = '<div class="detail-empty">Ce formulaire n’a pas de table technique configurée.</div>';
      return;
    }
    var tableId = formulaire.Table_Technique;

    try {
      var cacheKey = tableId + ':' + reponse.id;
      var technicalRow = state.technicalCache[cacheKey];
      if (!technicalRow) {
        technicalRow = await DataViz.fetchTechnicalRow(tableId, reponse.id);
        state.technicalCache[cacheKey] = technicalRow;
      }

      var fields = await DataViz.discoverDisplayFields(tableId);

      var html = '<div class="detail-header"><h2>' + escapeHtml(state.formulaireLabels[reponse.Formulaire] || '') + '</h2>' +
        '<div class="detail-meta">' +
          '<span>Date : <b>' + escapeHtml(formatDate(reponse.Date_Intervention)) + '</b></span>' +
          '<span>Agent : <b>' + escapeHtml(state.agentLabels[reponse.Agent] || '—') + '</b></span>' +
          '<span>Site : <b>' + escapeHtml(state.siteLabels[reponse.Site] || '—') + '</b></span>' +
          '<span>Service : <b>' + escapeHtml(state.serviceLabels[reponse.Service] || '—') + '</b></span>' +
          '<span>Statut : <b>' + escapeHtml(reponse.Statut || '—') + '</b></span>' +
        '</div></div>';

      if (!technicalRow) {
        html += '<div class="detail-empty">Aucun détail technique trouvé pour cette réponse.</div>';
      } else {
        html += fields.map(function (f) { return fieldRowHtml(f, technicalRow[f.key]); }).join('');
      }

      contentEl.innerHTML = html;

      // Les vignettes de pièces jointes sont chargées après coup (elles
      // ont besoin d'un jeton d'accès, récupéré une seule fois).
      var attachmentFields = fields.filter(function (f) { return f.kind === 'attachment'; });
      if (attachmentFields.length) fillAttachmentThumbnails(attachmentFields, technicalRow);

    } catch (err) {
      console.error('[Consultation] échec du rendu du détail', err);
      contentEl.innerHTML = '<div class="detail-empty">Impossible d’afficher le détail : ' +
        escapeHtml(err && err.message ? err.message : err) + '</div>';
    }
  }

  function fieldRowHtml(field, value) {
    var displayValue;
    var valueClass = '';

    if (value === null || value === undefined || value === '') {
      displayValue = '—';
      valueClass = 'empty';
    } else if (field.kind === 'bool') {
      displayValue = value ? 'Oui' : 'Non';
      valueClass = value ? 'bool-yes' : 'bool-no';
    } else if (field.kind === 'date') {
      displayValue = formatDate(value);
    } else if (field.kind === 'attachment') {
      var ids = DataViz.toList(value);
      if (!ids.length) { displayValue = '—'; valueClass = 'empty'; }
      else {
        // Conteneur rempli plus tard par fillAttachmentThumbnails, une
        // fois le jeton d'accès obtenu.
        return '<div class="field-row"><div class="field-label">' + escapeHtml(field.label) + '</div>' +
          '<div class="field-value"><div class="attachment-list" data-attachment-ids="' + ids.join(',') + '"></div></div></div>';
      }
    } else {
      displayValue = String(value);
    }

    return '<div class="field-row"><div class="field-label">' + escapeHtml(field.label) + '</div>' +
      '<div class="field-value ' + valueClass + '">' + escapeHtml(displayValue) + '</div></div>';
  }

  // ---------------------------------------------------------------
  // Pièces jointes : miniatures via jeton d'accès temporaire
  // ---------------------------------------------------------------
  // Point non vérifié : getAccessToken sous l'accès "read table" (plutôt
  // que "full"). Si les miniatures ne s'affichent pas, essayer de passer
  // requiredAccess à 'full' dans init() en premier réflexe de diagnostic.
  function decodeJwtDocId(token) {
    try {
      var payloadB64 = token.split('.')[1];
      var normalized = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      while (normalized.length % 4) normalized += '=';
      var payload = JSON.parse(atob(normalized));
      return payload && payload.docId ? payload.docId : null;
    } catch (e) { return null; }
  }

  function buildApiBase(tokenInfo) {
    var canonicalDocId = decodeJwtDocId(tokenInfo.token);
    var m = tokenInfo.baseUrl.match(/^(.*\/api\/docs\/)([^\/?]+)$/);
    if (m && canonicalDocId && m[2] !== canonicalDocId) return m[1] + canonicalDocId;
    return tokenInfo.baseUrl;
  }

  async function fillAttachmentThumbnails(attachmentFields, technicalRow) {
    try {
      var tokenInfo = await grist.docApi.getAccessToken({ readOnly: true });
      var base = buildApiBase(tokenInfo);

      document.querySelectorAll('.attachment-list[data-attachment-ids]').forEach(function (container) {
        var ids = container.getAttribute('data-attachment-ids').split(',').filter(Boolean);
        container.innerHTML = '';
        ids.forEach(function (id) {
          var url = base + '/attachments/' + id + '/download?auth=' + encodeURIComponent(tokenInfo.token);
          var link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener';

          var img = document.createElement('img');
          img.className = 'attachment-thumb';
          img.alt = 'Pièce jointe — cliquer pour agrandir';
          img.src = url;
          img.addEventListener('error', function () {
            link.classList.add('attachment-link');
            link.textContent = 'Pièce jointe ' + id;
          });

          link.appendChild(img);
          container.appendChild(link);
        });
      });
    } catch (err) {
      console.error('[Consultation] échec du chargement des miniatures', err);
      document.querySelectorAll('.attachment-list[data-attachment-ids]').forEach(function (container) {
        container.textContent = 'Pièce(s) jointe(s) non affichable(s) ici.';
      });
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  init();
})();
