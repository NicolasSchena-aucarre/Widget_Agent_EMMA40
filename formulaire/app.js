// app.js
// Point d'entrée : état global, démarrage (grist.ready), et soumission du
// formulaire (handleSubmit), qui orchestre les autres fichiers.

"use strict";

  var WIDGET_BUILD = '2026-09-04-v17';
  console.log('[Formulaire terrain] build ' + WIDGET_BUILD);

  var grist = window.grist;


  var state = {
    loading:true,
    error:null,
    agent:null,            // {id, nom, site, service, formulaires:[{id,titre,table}]}
    formulaires:{},        // id -> {titre, table, actif}
    agentsRaw:null,        // cached fetchTable('Agents') result, for manual fallback
    manualMode:false,
    selectedFormulaireId:null,
    fieldsLoading:{},     // tableId technique -> booléen, pour éviter les requêtes en double
    submitting:false,
    toast:null
  };

  var app = document.getElementById('app');

  // ---------------------------------------------------------------
  // Soumission
  // ---------------------------------------------------------------
  async function handleSubmit(){
    if (state.submitting) return;
    var formulaire = state.formulaires[state.selectedFormulaireId];
    if (!formulaire) return;

    var formEl = document.getElementById('dynamic-form');
    if (formEl && !formEl.reportValidity()) return;

    // IMPORTANT : on lit toutes les valeurs du formulaire AVANT de toucher
    // au DOM ou à state.submitting. Un render() ici régénérerait le HTML
    // (y compris les champs) et effacerait ce que l'agent a saisi.
    var dateVal = document.getElementById('field-date-intervention').value;
    var dateEpoch = dateStrToEpoch(dateVal);

    var fields = schemaCache[formulaire.table] || [];
    var values = {};
    var pendingFiles = [];

    for (var i = 0; i < fields.length; i++){
      var f = fields[i];
      var id = 'field-' + f.key;

      if (f.type === 'attachment'){
        var fileInput = document.getElementById(id);
        if (fileInput && fileInput.files && fileInput.files.length){
          pendingFiles.push({ key: f.key, files: fileInput.files });
        }
      } else if (f.type === 'bool'){
        var row = document.getElementById('row-' + id);
        values[f.key] = row ? row.getAttribute('data-value') === 'true' : false;
      } else if (f.type === 'choice'){
        var wrap = document.getElementById(id);
        values[f.key] = wrap ? (wrap.getAttribute('data-value') || null) : null;
      } else if (f.type === 'number'){
        var el = document.getElementById(id);
        values[f.key] = (el && el.value !== '') ? Number(el.value) : null;
      } else if (f.type === 'date'){
        var elD = document.getElementById(id);
        values[f.key] = dateStrToEpoch(elD ? elD.value : null);
      } else {
        var elT = document.getElementById(id);
        values[f.key] = elT ? elT.value : '';
      }
    }

    // On avait tenté de pré-assigner l'id de la future ligne Reponses pour
    // tout envoyer en un seul lot atomique. Grist refuse cependant les id
    // "trop hauts" par rapport à la taille actuelle de la table (structure
    // interne dimensionnée sur l'id max utilisé) — donc un id choisi côté
    // client, quelle que soit sa valeur, n'est pas fiable ici.
    //
    // On revient à la méthode standard : laisser Grist assigner les id
    // automatiquement, en deux appels séparés. Pour ne pas laisser de
    // ligne orpheline dans Reponses si la deuxième écriture échoue (règle
    // ACL, validation…), on supprime automatiquement la ligne Reponses
    // qu'on vient de créer dans ce cas précis (compensation).
    async function addReponseAndDetail(tokenInfo, reponseFields, technicalTable, technicalValuesBase){
      var addReponseRet = await applyActionsViaRest(tokenInfo, [
        ['AddRecord', 'Reponses', null, reponseFields]
      ]);
      var reponseId = Array.isArray(addReponseRet) ? addReponseRet[0] : addReponseRet;
      var technicalValues = Object.assign({}, technicalValuesBase, { Reponse: reponseId });

      try {
        await applyActionsViaRest(tokenInfo, [
          ['AddRecord', technicalTable, null, technicalValues]
        ]);
      } catch (detailErr) {
        try {
          await applyActionsViaRest(tokenInfo, [
            ['RemoveRecord', 'Reponses', reponseId]
          ]);
        } catch (rollbackErr) {
          console.error('Échec de la compensation (suppression de la ligne Reponses orpheline)', rollbackErr);
        }
        throw detailErr;
      }
    }

    // À partir d'ici, on ne redessine plus le formulaire tant que la
    // soumission n'est pas terminée : on grise juste le bouton directement.
    state.submitting = true;
    state.toast = null;
    var submitBtn = document.getElementById('submit-btn');
    if (submitBtn){
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enregistrement…';
    }

    try {
      // Un seul jeton pour toute la soumission (upload des pièces jointes ET
      // création des lignes via /apply), pour que tout se fasse sous la
      // même identité côté serveur.
      var tokenInfo;
      try {
        tokenInfo = await grist.docApi.getAccessToken({ readOnly: false });
      } catch (tokenErr) {
        throw new Error('Jeton d’accès refusé : ' + (tokenErr && tokenErr.message ? tokenErr.message : tokenErr));
      }

      // Les pièces jointes sont envoyées AVANT la création des lignes :
      // ça ne dépend d'aucun id de ligne, et si l'upload échoue on continue
      // quand même (on ne bloque jamais l'enregistrement pour une photo).
      var attachmentWarning = false;
      var attachmentErrorDetail = '';
      for (var j = 0; j < pendingFiles.length; j++){
        var pf = pendingFiles[j];
        var attIds = [];
        try {
          for (var k = 0; k < pf.files.length; k++){
            var attId = await uploadAttachmentViaRest(pf.files[k], tokenInfo);
            attIds.push(attId);
          }
          // Les colonnes Pièce jointe attendent un tableau préfixé par
          // l'indicateur de type "L" (Liste), pas un tableau brut
          // d'identifiants — sinon Grist essaie d'interpréter le premier
          // élément comme un code de type et affiche #KeyError.
          values[pf.key] = ['L'].concat(attIds);
        } catch (uploadErr) {
          console.error('Échec upload pièce jointe (' + pf.key + ')', uploadErr);
          attachmentWarning = true;
          attachmentErrorDetail = uploadErr && uploadErr.message ? uploadErr.message : String(uploadErr);
          // on continue sans cette pièce jointe plutôt que de tout bloquer
        }
      }

      await addReponseAndDetail(
        tokenInfo,
        {
          Agent: state.agent.id,
          Formulaire: state.selectedFormulaireId,
          Date_Intervention: dateEpoch,
          Statut: 'Déclaré'
        },
        formulaire.table,
        values
      );

      state.toast = attachmentWarning
        ? { type:'error', msg:'Enregistré, mais la photo n’a pas pu être envoyée (' + attachmentErrorDetail + ').' }
        : { type:'success', msg:'Formulaire enregistré.' };
    } catch (err) {
      console.error(err);
      state.toast = { type:'error', msg:'Échec de l’enregistrement : ' + (err && err.message ? err.message : err) };
    } finally {
      state.submitting = false;
      render();
      if (state.toast && state.toast.type === 'success'){
        setTimeout(function(){ state.toast = null; render(); }, 3500);
      }
    }
  }

  // ---------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------
  // Filet de sécurité : toute erreur JS non interceptée ailleurs s'affiche
  // ici plutôt que de rester silencieuse (utile pour déboguer sur mobile,
  // où la console n'est pas accessible).
  window.addEventListener('error', function(e){
    state.toast = { type:'error', msg:'Erreur : ' + (e.message || e) };
    render();
  });
  window.addEventListener('unhandledrejection', function(e){
    var reason = e.reason && e.reason.message ? e.reason.message : e.reason;
    state.toast = { type:'error', msg:'Erreur : ' + reason };
    render();
  });

  grist.ready({ requiredAccess: 'full' });

  loadData()
    .then(function(){
      state.loading = false;
      render();
    })
    .catch(function(err){
      console.error(err);
      state.loading = false;
      state.error = 'Impossible de charger les données du document : ' + (err && err.message ? err.message : err);
      render();
    });

