// nav.js — barre de navigation partagée entre les 3 widgets.
// À placer à la racine du dépôt, référencée par chaque widget via un
// chemin relatif ("../nav.js").
//
// Chaque widget doit, AVANT de charger ce fichier, définir :
//   window.CURRENT_VIEW = 'formulaire' | 'dashboard' | 'consultation';
//
// -----------------------------------------------------------------
// À COMPLÉTER : remplacez les 3 URL ci-dessous par les vraies URL de
// vos pages Grist (chacune avec ?embed=true ou ?style=singlePage à la
// fin). Ce sont les seules lignes à modifier dans tout ce fichier.
// -----------------------------------------------------------------
var NAV_DESTINATIONS = [
  {
    key: 'formulaire',
    label: 'Formulaire',
    icon: '📝',
    url: 'https://grist.aucarre.tech/o/docs/1uweUafuLSAK/Prototype-Emma40/p/21?embed=true'
  },
  {
    key: 'dashboard',
    label: 'Tableau de bord',
    icon: '📊',
    url: 'https://grist.aucarre.tech/o/docs/1uweUafuLSAK/Prototype-Emma40/p/22?embed=true'
  },
  {
    key: 'consultation',
    label: 'Consultation',
    icon: '🔍',
    url: 'https://docs.getgrist.com/o/docs/1uweUafuLSAK/Prototype-Emma40/p/26?embed=true'
  }
];

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildNav() {
    var current = window.CURRENT_VIEW || null;

    var nav = document.createElement('nav');
    nav.id = 'app-nav';

    NAV_DESTINATIONS.forEach(function (dest) {
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

    // Insérée en tout premier dans <body>, pour rester visible même si
    // le reste du widget n'a pas encore fini de charger ses données.
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
      // Filet de sécurité si la navigation vers window.top est un jour
      // bloquée par le navigateur : on retombe sur la fenêtre courante.
      console.error('[Navigation] échec de la navigation vers window.top, repli sur la fenêtre courante', err);
      window.location.href = url;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();
