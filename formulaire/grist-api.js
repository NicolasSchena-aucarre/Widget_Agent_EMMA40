// grist-api.js
// Utilitaires génériques (listes Grist, dates) et communication avec
// l'API REST de Grist via jeton d'accès (upload de pièces jointes,
// écriture d'actions via /apply). Voir API_Grist_Widget_Reference.md pour
// le détail de chaque contournement de bug documenté ici.

"use strict";
  function toList(v){
    if (Array.isArray(v) && v[0] === 'L') return v.slice(1);
    if (Array.isArray(v)) return v;
    if (v === null || v === undefined) return [];
    return [v];
  }

  function todayStr(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function dateStrToEpoch(s){
    if (!s) return null;
    return Math.floor(new Date(s + 'T12:00:00Z').getTime()/1000);
  }

  // grist.docApi.uploadAttachment n'existe pas dans toutes les versions de
  // l'API des widgets. On passe donc par l'API REST du document via un
  // jeton d'accès temporaire (grist.docApi.getAccessToken), ce qui est
  // la méthode plus largement disponible. Chaque échec est isolé : une
  // pièce jointe qui ne s'envoie pas n'empêche pas le reste d'être
  // enregistré.
  // Le docId "court" utilisé dans l'URL du document (ex. f99r74L5RvXs) est
  // différent de l'id canonique interne encodé dans le jeton d'accès (ex.
  // f99r74L5RvXsoLcEZcY1BR) — voir grist-shared.js (chargé avant ce
  // fichier) pour decodeJwtDocId / buildApiBase, qui corrigent ça.

  function buildAttachmentsUrl(tokenInfo){
    return buildApiBase(tokenInfo) + '/attachments?auth=' + encodeURIComponent(tokenInfo.token);
  }

  // Envoie un lot d'actions (même format que grist.docApi.applyUserActions)
  // via l'API REST/jeton, plutôt que via le canal WebSocket habituel. Sert
  // à garder la même identité "côté jeton" que l'upload de pièce jointe,
  // au cas où le serveur distinguerait les deux canaux (hypothèse en cours
  // de vérification sur l'instance self-hosted).
  async function applyActionsViaRest(tokenInfo, actions){
    var url = buildApiBase(tokenInfo) + '/apply?auth=' + encodeURIComponent(tokenInfo.token);
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actions)
    });
    if (!res.ok){
      var bodyText = '';
      try { bodyText = await res.text(); } catch(e){}
      throw new Error('HTTP ' + res.status + (bodyText ? ' — ' + bodyText.slice(0,300) : ''));
    }
    var data = await res.json();
    console.log('[Formulaire terrain] réponse /apply', data);
    // Le format exact de la réponse de /apply n'est pas garanti identique à
    // celui de applyUserActions ; on gère les deux formes plausibles.
    return (data && data.retValues) ? data.retValues : data;
  }

  // Grist exige, pour toute requête POST, l'un de ces deux en-têtes comme
  // protection anti-CSRF : Content-Type: application/json OU
  // X-Requested-With: XMLHttpRequest. Un fetch() avec FormData ne pose
  // aucun des deux par défaut (Content-Type devient multipart/form-data),
  // donc la requête était traitée comme "non authentifiée" avant même de
  // vérifier le jeton — d'où le 401, qui remontait ensuite comme une
  // fausse erreur CORS côté navigateur (la réponse d'erreur de Grist ne
  // porte pas d'en-tête CORS).
  async function uploadAttachmentViaRest(file, tokenInfo){
    var url = buildAttachmentsUrl(tokenInfo);
    console.log('[Formulaire terrain] upload vers ' + url.split('?')[0] + ' (voir onglet Réseau pour le détail)');
    var formData = new FormData();
    formData.append('upload', file, file.name);
    var res;
    try {
      res = await fetch(url, {
        method:'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: formData
      });
    } catch (networkErr) {
      throw new Error('Requête bloquée avant même d’atteindre le serveur (probable CORS) — cible : ' + url.split('?')[0]);
    }
    if (!res.ok){
      var bodyText = '';
      try { bodyText = await res.text(); } catch(e){}
      throw new Error('HTTP ' + res.status + (bodyText ? ' — ' + bodyText.slice(0,200) : ''));
    }
    var data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }
