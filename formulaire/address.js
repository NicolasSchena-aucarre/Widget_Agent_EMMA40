// address.js
// Autocomplétion d'adresse via l'API Adresse (Base Adresse Nationale,
// adresse.data.gouv.fr) — publique, gratuite, sans clé.

"use strict";
  // ---------------------------------------------------------------
  // Autocomplétion d'adresse via l'API Adresse (Base Adresse Nationale,
  // adresse.data.gouv.fr) — publique, gratuite, sans clé. On ne branche
  // que la recherche/suggestion pour l'instant ; le champ reste un texte
  // libre en base (colonne Adresse), donc pas de migration de schéma
  // nécessaire pour bénéficier de la fiabilisation de la saisie.
  // ---------------------------------------------------------------
  var BAN_URL = 'https://api-adresse.data.gouv.fr/search/';
  var addressState = {}; // id -> { timer, controller, results, highlighted }

  function debounce(fn, delay){
    var t;
    return function(){
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function(){ fn.apply(null, args); }, delay);
    };
  }

  async function fetchBanSuggestions(query){
    var url = BAN_URL + '?q=' + encodeURIComponent(query) + '&limit=5&autocomplete=1';
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    return (data.features || []).map(function(feat){
      return {
        label: feat.properties.label,
        context: feat.properties.context,
        score: feat.properties.score
      };
    });
  }

  function bindAddressField(id){
    var input = document.getElementById(id);
    var box = document.getElementById('sugg-' + id);
    var status = document.getElementById('status-' + id);
    if (!input || !box) return;
    addressState[id] = { results: [], highlighted: -1 };

    function closeBox(){
      box.classList.remove('open');
      box.innerHTML = '';
      addressState[id].results = [];
      addressState[id].highlighted = -1;
    }

    function renderSuggestions(){
      var st = addressState[id];
      if (!st.results.length){
        box.innerHTML = '<div class="sugg-empty">Aucune adresse trouvée</div>';
        box.classList.add('open');
        return;
      }
      box.innerHTML = st.results.map(function(r, i){
        var cls = 'sugg-item' + (i === st.highlighted ? ' highlighted' : '');
        return '<div class="' + cls + '" data-idx="' + i + '">' + escapeHtml(r.label) +
          (r.context ? ' <span style="color:var(--muted);">— ' + escapeHtml(r.context) + '</span>' : '') +
        '</div>';
      }).join('');
      box.classList.add('open');
      box.querySelectorAll('.sugg-item').forEach(function(el){
        el.addEventListener('mousedown', function(e){
          e.preventDefault(); // évite le blur avant le clic
          var idx = Number(el.getAttribute('data-idx'));
          selectSuggestion(idx);
        });
      });
    }

    function selectSuggestion(idx){
      var st = addressState[id];
      var r = st.results[idx];
      if (!r) return;
      input.value = r.label;
      closeBox();
      if (status) status.textContent = 'Adresse vérifiée (BAN)';
    }

    var doSearch = debounce(function(query){
      if (!query || query.length < 3){
        closeBox();
        if (status) status.textContent = '';
        return;
      }
      if (status) status.textContent = 'Recherche…';
      fetchBanSuggestions(query).then(function(results){
        addressState[id].results = results;
        addressState[id].highlighted = -1;
        renderSuggestions();
        if (status) status.textContent = results.length ? '' : 'Aucune correspondance — vous pouvez saisir librement';
      }).catch(function(err){
        console.error('Recherche adresse BAN échouée', err);
        if (status) status.textContent = 'Recherche indisponible — saisie libre';
        closeBox();
      });
    }, 300);

    input.addEventListener('input', function(){
      if (status) status.textContent = '';
      doSearch(input.value.trim());
    });

    input.addEventListener('keydown', function(e){
      var st = addressState[id];
      if (!st.results.length) return;
      if (e.key === 'ArrowDown'){
        e.preventDefault();
        st.highlighted = Math.min(st.highlighted + 1, st.results.length - 1);
        renderSuggestions();
      } else if (e.key === 'ArrowUp'){
        e.preventDefault();
        st.highlighted = Math.max(st.highlighted - 1, 0);
        renderSuggestions();
      } else if (e.key === 'Enter'){
        if (st.highlighted >= 0){
          e.preventDefault();
          selectSuggestion(st.highlighted);
        }
      } else if (e.key === 'Escape'){
        closeBox();
      }
    });

    input.addEventListener('blur', function(){
      setTimeout(closeBox, 100);
    });
  }

