// nav.js — barre de navigation partagée entre les 3 widgets.
// À placer à la racine du dépôt, référencée par chaque widget via un
// chemin relatif ("../nav.js").
//
// IMPORTANT : ce fichier doit être chargé en FIN de <body>, après les
// scripts propres au widget (notamment après l'appel à grist.ready()
// fait par app.js) — les vérifications d'accès ci-dessous ont besoin
// que la connexion avec Grist soit déjà établie pour fonctionner.
//
// Chaque widget doit, AVANT de charger ce fichier, définir :
//   window.CURRENT_VIEW = 'formulaire' | 'dashboard' | 'consultation';
//
// La liste des destinations (NAV_DESTINATIONS) n'est pas définie ici :
// elle vient de grist-config.js, à charger AVANT ce fichier — c'est
// l'unique endroit à modifier en cas de changement de document ou
// d'instance Grist. Voir ce fichier pour le détail de chaque champ.

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Vérifie si l'utilisateur connecté a accès à une destination, en
  // interrogeant la table qui sert de "porte" à sa page. Une table
  // sans aucune ligne visible, ou dont la lecture échoue carrément
  // (accès refusé au niveau de la table elle-même, pas seulement
  // filtrée ligne par ligne), compte comme un accès refusé = bouton
  // masqué.
  //
  // En cas d'échec de la vérification elle-même, on masque le bouton
  // par prudence plutôt que de le montrer : la vraie sécurité reste de
  // toute façon assurée par les Règles d'accès de Grist derrière la
  // page, donc se tromper dans ce sens-là (cacher un bouton auquel la
  // personne aurait en fait droit) n'est qu'une gêne mineure — l'autre
  // sens (montrer un bouton à quelqu'un qui ne devrait pas le voir)
  // est justement le problème qu'on corrige ici.
  async function canAccess(dest) {
    if (!dest.gateTable) return true;
    try {
      var table = await grist.docApi.fetchTable(dest.gateTable);
      return table.id.length > 0;
    } catch (err) {
      console.error('[Navigation] accès refusé (ou vérification impossible) pour "' + dest.key + '" (table ' + dest.gateTable + ')', err);
      return false;
    }
  }

  async function buildNav() {
    var current = window.CURRENT_VIEW || null;

    var visibility = await Promise.all(NAV_DESTINATIONS.map(canAccess));

    var nav = document.createElement('nav');
    nav.id = 'app-nav';

    NAV_DESTINATIONS.forEach(function (dest, i) {
      if (!visibility[i]) return; // pas accès : le bouton n'est même pas créé

      var btn = document.createElement('button');
      btn.type = 'button';
      if (dest.key === current) btn.classList.add('active');

      var icon = document.createElement('span');
      icon.className = 'nav-icon';
      icon.textContent = dest.icon;

      var label = document.createElement('span');
      label.className = 'nav-label';
      label.textContent = dest.label;

      btn.appendChild(icon);
      btn.appendChild(label);

      btn.addEventListener('click', function () {
        if (dest.key === current) return; // déjà sur cette page
        navigateTo(dest.url);
      });

      nav.appendChild(btn);
    });

    // Si aucune destination n'est accessible (cas limite improbable),
    // on n'insère pas de barre vide plutôt que d'afficher un bandeau
    // sans aucun bouton.
    if (nav.children.length === 0) return;

    document.body.insertBefore(nav, document.body.firstChild);
  }

  // Navigue la fenêtre du navigateur tout entière (pas seulement notre
  // widget) — c'est ce qui permet de changer de page Grist sans jamais
  // imbriquer un widget dans un autre. Cette navigation "vers le haut"
  // depuis un widget hébergé sur un autre domaine est explicitement
  // autorisée par les navigateurs (contrairement à la lecture/écriture
  // des propriétés d'une fenêtre d'une autre origine, qui elle est
  // bloquée).
  function navigateTo(url) {
    try {
      window.top.location.href = url;
    } catch (err) {
      console.error('[Navigation] échec de la navigation vers window.top, repli sur la fenêtre courante', err);
      window.location.href = url;
    }
  }

  buildNav();
})();
