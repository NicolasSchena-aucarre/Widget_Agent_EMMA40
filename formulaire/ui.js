// ui.js
// Rendu de l'interface (état, formulaire dynamique, sélecteur manuel) et
// liaison des événements DOM. Ne contient aucun appel réseau direct.

"use strict";
  // ---------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------
  function render(){
    if (state.loading){
      app.innerHTML = '<div class="state-screen"><div class="spinner"></div>Chargement du formulaire…</div>';
      return;
    }
    if (state.error){
      app.innerHTML = '<div class="state-screen">' + escapeHtml(state.error) + '</div>';
      return;
    }

    var html = '';
    if (state.toast){
      html += '<div class="toast ' + state.toast.type + '">' + escapeHtml(state.toast.msg) + '</div>';
    }

    if (state.manualMode && !state.agent){
      html += manualPickerHtml();
      html += versionTagHtml();
      app.innerHTML = html;
      bindManualPicker();
      return;
    }

    html += badgeHtml();
    if (state.manualMode){
      html += '<div class="manual-picker"><p>Compte non reconnu automatiquement — agent sélectionné manuellement.</p>' +
              '<button class="pill" id="switch-agent">Changer d’agent</button></div>';
    }

    if (!state.formulairesAgent || !state.formulairesAgent.length){
      html += '<div class="panel"><p class="empty-note">Aucun formulaire n’est associé à cet agent pour le moment. Contactez votre responsable pour obtenir un accès.</p></div>';
      html += versionTagHtml();
      app.innerHTML = html;
      bindGlobal();
      return;
    }

    html += segmentedHtml();
    var formulaire = state.formulaires[state.selectedFormulaireId];
    if (formulaire) ensureFieldsLoaded(formulaire.table);
    html += dynamicFormHtml(formulaire);
    html += versionTagHtml();
    html += actionBarHtml();

    app.innerHTML = html;
    bindGlobal();
    bindDynamicForm(formulaire);
  }

  function badgeHtml(){
    var meta = [state.agent.service, state.agent.site].filter(Boolean).join(' · ');
    return '<div class="badge">' +
      '<img class="brand-logo" src="../logo-icon.png" alt="EMMA40" />' +
      '<div class="who">' +
        '<div class="name">' + escapeHtml(state.agent.nom) + '</div>' +
        '<div class="meta">' + escapeHtml(meta) + '</div>' +
      '</div>' +
      '<span class="dot" title="Connecté"></span>' +
    '</div>';
  }

  function manualPickerHtml(){
    var t = state.agentsRaw;
    var opts = '<option value="">— Choisir un agent —</option>';
    if (t) {
      t.id.forEach(function(id, i){
        opts += '<option value="' + id + '">' + escapeHtml(t.Nom_Complet_Agent[i]) + '</option>';
      });
    }
    return '<div class="manual-picker">' +
      '<p>Votre compte ne correspond à aucun agent connu. Sélectionnez votre nom pour continuer.</p>' +
      '<select id="manual-agent-select">' + opts + '</select>' +
    '</div>';
  }

  function segmentedHtml(){
    var buttons = state.formulairesAgent.map(function(f){
      var active = f.id === state.selectedFormulaireId ? ' active' : '';
      return '<button class="' + active.trim() + '" data-form-id="' + f.id + '" title="' + escapeHtml(f.titre) + '">' +
        '<span class="seg-icon">' + escapeHtml(f.icone) + '</span>' +
        '<span class="seg-label">' + escapeHtml(f.titre) + '</span>' +
      '</button>';
    }).join('');
    return '<div class="segmented">' + buttons + '</div>';
  }

  function dynamicFormHtml(formulaire){
    if (!formulaire) return '';
    var fields = schemaCache[formulaire.table];
    if (!fields){
      return '<div class="panel"><div class="state-screen" style="padding:24px 0;"><div class="spinner"></div>Chargement des champs du formulaire…</div></div>';
    }
    var out = '<form id="dynamic-form"><div class="panel">';

    out += '<h2>Intervention</h2>';
    out += fieldWrap(
      '<label for="field-date-intervention">Date d’intervention</label>' +
      '<input type="date" id="field-date-intervention" value="' + todayStr() + '" required>'
    );

    out += '<h2>' + escapeHtml(formulaire.titre) + '</h2>';
    fields.forEach(function(f){
      out += renderField(f);
    });

    out += '</div></form>';
    return out;
  }

  function fieldWrap(inner){
    return '<div class="field">' + inner + '</div>';
  }

  function renderField(f){
    var reqStar = f.required ? ' <span class="req">*</span>' : '';
    var unit = f.unit ? ' <span class="unit">(' + escapeHtml(f.unit) + ')</span>' : '';
    var labelHtml = '<label>' + escapeHtml(f.label) + reqStar + unit + '</label>';
    var id = 'field-' + f.key;

    if (f.type === 'text'){
      return fieldWrap(labelHtml + '<input type="text" id="' + id + '" ' + (f.required?'required':'') +
        (f.placeholder ? ' placeholder="' + escapeHtml(f.placeholder) + '"' : '') + '>');
    }
    if (f.type === 'textarea'){
      return fieldWrap(labelHtml + '<textarea id="' + id + '" ' + (f.required?'required':'') + '></textarea>');
    }
    if (f.type === 'number'){
      return fieldWrap(labelHtml + '<input type="number" step="' + (f.step||'any') + '" id="' + id + '" ' + (f.required?'required':'') + '>');
    }
    if (f.type === 'date'){
      var val = f.today ? todayStr() : '';
      return fieldWrap(labelHtml + '<input type="date" id="' + id + '" value="' + val + '" ' + (f.required?'required':'') + '>');
    }
    if (f.type === 'attachment'){
      return fieldWrap(labelHtml + '<input type="file" id="' + id + '" accept="image/*,application/pdf" capture="environment" multiple>');
    }
    if (f.type === 'bool'){
      var on = f.def ? ' on' : '';
      var urgentClass = f.urgent ? ' urgent' : '';
      return '<div class="field toggle-row' + urgentClass + '" id="row-' + id + '" data-key="' + id + '" data-value="' + (!!f.def) + '">' +
        '<span class="field-label">' + escapeHtml(f.label) + '</span>' +
        '<span class="switch' + on + '" id="' + id + '"><span class="knob"></span></span>' +
      '</div>';
    }
    if (f.type === 'address'){
      return fieldWrap(
        labelHtml +
        '<div class="address-wrap">' +
          '<input type="text" id="' + id + '" autocomplete="off" ' + (f.required?'required':'') +
            (f.placeholder ? ' placeholder="' + escapeHtml(f.placeholder) + '"' : '') + '>' +
          '<div class="address-suggestions" id="sugg-' + id + '"></div>' +
        '</div>' +
        '<div class="address-status" id="status-' + id + '"></div>'
      );
    }
    if (f.type === 'choice'){
      var pills = f.options.map(function(opt){
        var active = opt === f.def ? ' active' : '';
        return '<button type="button" class="pill' + active + '" data-value="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
      }).join('');
      return '<div class="field" id="' + id + '" data-value="' + escapeHtml(f.def || '') + '">' +
        labelHtml + '<div class="pills">' + pills + '</div></div>';
    }
    return '';
  }

  function versionTagHtml(){
    return '<div style="text-align:center;font-size:.7rem;color:var(--muted);padding:6px 0 90px;">build ' + WIDGET_BUILD + '</div>';
  }

  function actionBarHtml(){
    var formulaire = state.formulaires[state.selectedFormulaireId];
    var fieldsReady = !formulaire || !!schemaCache[formulaire.table];
    var disabled = state.submitting || !fieldsReady;
    return '<div class="actionbar"><div class="inner">' +
      '<button type="button" class="ghost" id="reset-btn">Effacer</button>' +
      '<button type="button" class="primary" id="submit-btn"' + (disabled?' disabled':'') + '>' +
        (state.submitting ? 'Enregistrement…' : 'Enregistrer') +
      '</button>' +
    '</div></div>';
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ---------------------------------------------------------------
  // Bindings
  // ---------------------------------------------------------------
  function bindManualPicker(){
    var sel = document.getElementById('manual-agent-select');
    if (!sel) return;
    sel.addEventListener('change', function(){
      if (!sel.value) return;
      var idx = state.agentsRaw.id.indexOf(Number(sel.value));
      if (idx >= 0){
        applyAgentFromRow(idx);
        render();
      }
    });
  }

  function bindGlobal(){
    var switchAgent = document.getElementById('switch-agent');
    if (switchAgent){
      switchAgent.addEventListener('click', function(){
        state.agent = null;
        render();
      });
    }
    var segBtns = document.querySelectorAll('.segmented button');
    segBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        state.selectedFormulaireId = Number(btn.getAttribute('data-form-id'));
        render();
      });
    });
    var resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', function(){ render(); });
    var submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', handleSubmit);
  }

  function bindDynamicForm(formulaire){
    var formEl = document.getElementById('dynamic-form');
    if (formEl){
      // Empêche toute soumission native du formulaire (touche Entrée sur
      // mobile, "Go"/"Valider" du clavier virtuel, etc.), qui provoquerait
      // un rechargement complet de la page et interromprait l'enregistrement
      // en cours. Seul le bouton "Enregistrer" doit déclencher l'envoi.
      formEl.addEventListener('submit', function(e){ e.preventDefault(); });
      formEl.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA'){
          e.preventDefault();
        }
      });
    }
    if (!formulaire) return;
    var fields = schemaCache[formulaire.table] || [];
    fields.forEach(function(f){
      var id = 'field-' + f.key;
      if (f.type === 'address'){
        bindAddressField(id);
      }
      if (f.type === 'bool'){
        var row = document.getElementById('row-' + id);
        var sw = document.getElementById(id);
        if (sw) sw.addEventListener('click', function(){
          var newVal = row.getAttribute('data-value') !== 'true';
          row.setAttribute('data-value', String(newVal));
          sw.classList.toggle('on', newVal);
        });
      }
      if (f.type === 'choice'){
        var wrap = document.getElementById(id);
        if (!wrap) return;
        wrap.querySelectorAll('.pill').forEach(function(pill){
          pill.addEventListener('click', function(){
            wrap.setAttribute('data-value', pill.getAttribute('data-value'));
            wrap.querySelectorAll('.pill').forEach(function(p){ p.classList.remove('active'); });
            pill.classList.add('active');
          });
        });
      }
    });
  }
