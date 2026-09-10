// data.js
// Chargement des tables Agents et Formulaires, et détection automatique
// de l'agent connecté (repose sur les Règles d'accès du document, qui
// restreignent la table Agents à sa seule ligne).

"use strict";
  // ---------------------------------------------------------------
  // Chargement des données
  // ---------------------------------------------------------------
  async function loadData(){
    var agentsTable = await grist.docApi.fetchTable('Agents');
    var formulairesTable = await grist.docApi.fetchTable('Formulaires');

    state.agentsRaw = agentsTable;

    formulairesTable.id.forEach(function(id, i){
      state.formulaires[id] = {
        titre: formulairesTable.Titre[i],
        table: formulairesTable.Table_Technique[i],
        actif: formulairesTable.Actif[i],
        // Colonne facultative : si elle n'existe pas encore sur la table
        // Formulaires (ancien document, ou pas encore configurée), on
        // retombe sur une icône générique plutôt que de faire planter le
        // widget.
        icone: (formulairesTable.Icone && formulairesTable.Icone[i]) || '📄',
        servicesConcernes: toList(formulairesTable.Service_Concerne[i])
      };
    });

    // Pas de colonne "qui suis-je" : on s'appuie sur les Règles d'accès du
    // document, qui restreignent la table Agents à la seule ligne de
    // l'utilisateur connecté (voir instructions de configuration). Si la
    // restriction est bien en place, on ne reçoit qu'une seule ligne.
    if (agentsTable.id.length === 1) {
      applyAgentFromRow(0);
    } else {
      // 0 ligne : l'agent connecté n'a pas de ligne correspondante (ou la
      // règle d'accès n'est pas configurée). Plusieurs lignes : compte
      // propriétaire/administrateur qui voit tout, ou règle absente.
      // Dans les deux cas, on retombe sur la sélection manuelle.
      state.manualMode = true;
    }
  }

  function applyAgentFromRow(idx){
    var t = state.agentsRaw;
    var agentServiceId = t.Service ? t.Service[idx] : null;

    // Un formulaire est accessible à l'agent si soit il est listé
    // individuellement dans Agents.Formulaires_Accessibles, soit le
    // service de l'agent fait partie des services concernés par ce
    // formulaire (Formulaires.Service_Concerne) — les deux mécanismes
    // se cumulent, pas besoin de choisir l'un ou l'autre par agent.
    var individualIds = toList(t.Formulaires_Accessibles[idx]);
    var serviceWideIds = Object.keys(state.formulaires)
      .map(Number)
      .filter(function(fid){
        var f = state.formulaires[fid];
        return agentServiceId != null && f.servicesConcernes.indexOf(agentServiceId) !== -1;
      });
    var formIds = individualIds.slice();
    serviceWideIds.forEach(function(fid){
      if (formIds.indexOf(fid) === -1) formIds.push(fid);
    });

    var forms = formIds
      .map(function(id){ return Object.assign({id:id}, state.formulaires[id] || {}); })
      .filter(function(f){ return f.titre && f.actif; });

    state.agent = {
      id: t.id[idx],
      nom: t.Nom_Complet_Agent[idx],
      site: t.gristHelper_Display2 ? t.gristHelper_Display2[idx] : '',
      service: t.gristHelper_Display3 ? t.gristHelper_Display3[idx] : ''
    };
    state.formulairesAgent = forms;
    state.selectedFormulaireId = forms.length ? forms[0].id : null;
  }
