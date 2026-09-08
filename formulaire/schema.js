// schema.js
// Découverte dynamique des champs d'un formulaire à partir des tables de
// métadonnées internes de Grist (_grist_Tables, _grist_Tables_column).
// Ajouter une colonne à une table technique dans Grist suffit à la faire
// apparaître ici, sans modification de ce fichier.

"use strict";
  // ---------------------------------------------------------------
  // Découverte dynamique des champs d'un formulaire
  // ---------------------------------------------------------------
  // Plutôt qu'une liste de champs codée en dur par table technique, on
  // interroge les tables de métadonnées internes de Grist
  // (_grist_Tables, _grist_Tables_column) pour découvrir automatiquement
  // les colonnes d'une table technique, leur type, et — pour les colonnes
  // de type Choix — leurs options. Ajouter une colonne à une table
  // technique dans Grist suffit alors à la faire apparaître dans le
  // widget, sans modification ni redéploiement de ce fichier.
  //
  // Limite connue et assumée : seul le type Grist générique est détecté
  // (Texte, Numérique, Booléen, Date, Choix, Pièce jointe). Les
  // comportements spécifiques qu'avaient les anciens formulaires codés en
  // dur (autocomplétion d'adresse, unité affichée à côté d'un nombre,
  // mise en forme "urgent") ne peuvent pas être devinés à partir du seul
  // type de colonne — seule l'exception "Adresse" (nom de colonne exact)
  // est reconnue automatiquement, car cette convention de nommage est
  // déjà utilisée dans toutes les tables techniques existantes.
  //
  // Point non vérifié en conditions réelles : la lecture de
  // _grist_Tables / _grist_Tables_column par un compte non-Propriétaire.
  // Les tables de métadonnées sont généralement lisibles par quiconque a
  // accès au document (c'est ce qui permet à Grist d'afficher les en-têtes
  // de colonnes à un Éditeur), mais ce point mérite d'être testé
  // spécifiquement avec chaque rôle avant mise en production.
  var GRIST_TYPE_MAP = {
    'Bool': 'bool',
    'Numeric': 'number',
    'Int': 'number',
    'Date': 'date',
    'DateTime': 'date',
    'Attachments': 'attachment',
    'Text': 'text'
  };

  var schemaCache = {}; // tableId technique -> tableau de champs déjà découverts

  function humanizeLabel(colId){
    return colId.replace(/_/g, ' ');
  }

  function parseWidgetOptionsJson(raw){
    try { return raw ? JSON.parse(raw) : null; } catch (e){ return null; }
  }

  async function discoverFieldSchema(tableId){
    if (schemaCache[tableId]) return schemaCache[tableId];

    var tablesMeta = await grist.docApi.fetchTable('_grist_Tables');
    var idx = tablesMeta.tableId.indexOf(tableId);
    if (idx === -1){
      throw new Error('Table technique introuvable dans les métadonnées : ' + tableId);
    }
    var internalTableId = tablesMeta.id[idx];

    var colsMeta = await grist.docApi.fetchTable('_grist_Tables_column');
    var fields = [];

    for (var i = 0; i < colsMeta.id.length; i++){
      if (colsMeta.parentId[i] !== internalTableId) continue;

      var colId = colsMeta.colId[i];
      var type = colsMeta.type[i];
      var isFormula = colsMeta.isFormula[i];

      // On ignore : les colonnes calculées (formules), le tri interne,
      // l'id, et la colonne Reponse (gérée séparément par le widget, pas
      // affichée comme un champ à remplir).
      if (isFormula) continue;
      if (colId === 'manualSort' || colId === 'id' || colId === 'Reponse') continue;
      if (type && type.indexOf('Ref:') === 0) continue; // autres références, non gérées ici

      var field = { key: colId, label: humanizeLabel(colId) };

      if (colId === 'Adresse' && type === 'Text'){
        field.type = 'address';
        field.required = true;
        field.placeholder = 'Commencez à taper une adresse…';
      } else if (type === 'Choice'){
        field.type = 'choice';
        var opts = parseWidgetOptionsJson(colsMeta.widgetOptions[i]);
        field.options = (opts && opts.choices) ? opts.choices : [];
      } else if (GRIST_TYPE_MAP[type]){
        field.type = GRIST_TYPE_MAP[type];
        if (field.type === 'number') field.step = '0.01';
      } else {
        // Type non géré explicitement (ex. ChoiceList) : repli en texte
        // libre plutôt que de faire disparaître le champ.
        field.type = 'text';
      }

      fields.push(field);
    }

    // L'adresse doit toujours être le premier champ du formulaire, quel
    // que soit l'ordre réel des colonnes dans la table Grist — cet ordre
    // dépend de l'historique de création des colonnes, pas d'un choix
    // volontaire, donc il n'est pas fiable à lui seul pour ce champ-là.
    fields.sort(function (a, b) {
      var aFirst = a.type === 'address' ? 0 : 1;
      var bFirst = b.type === 'address' ? 0 : 1;
      return aFirst - bFirst;
    });

    schemaCache[tableId] = fields;
    return fields;
  }

  // Déclenche la découverte des champs pour une table technique si ce
  // n'est pas déjà fait ou en cours, et redessine le widget une fois le
  // résultat disponible.
  function ensureFieldsLoaded(tableId){
    if (!tableId || schemaCache[tableId] || state.fieldsLoading[tableId]) return;
    state.fieldsLoading[tableId] = true;
    discoverFieldSchema(tableId)
      .then(function(){
        state.fieldsLoading[tableId] = false;
        render();
      })
      .catch(function(err){
        state.fieldsLoading[tableId] = false;
        console.error('[Formulaire terrain] échec de la découverte des champs pour ' + tableId, err);
        schemaCache[tableId] = []; // évite de reboucler indéfiniment
        render();
      });
  }
