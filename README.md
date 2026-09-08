# Widgets Grist — Prototype Emma40

Widgets personnalisés Grist pour la saisie et la visualisation des interventions terrain (relevés de compteur, signalements de fuite, contrôles qualité réseau…).

Deux widgets, indépendants l'un de l'autre, chacun dans son propre dossier :

```
.
├── formulaire/     Widget de saisie — utilisé par les agents sur le terrain
├── dashboard/      Widget de visualisation — utilisé par managers, responsables de site et direction
└── docs/
    ├── API_Grist_Widget_Reference.md
    ├── Widgets_Dynamiques_Grist_Reference.md
    └── IT_Creation_Nouveau_Formulaire.md
```

---

## `formulaire/` — Formulaire terrain

Permet à un agent de déclarer une intervention (relevé de compteur, signalement de fuite, contrôle qualité réseau…) directement depuis son téléphone, avec photo à l'appui.

**Points clés :**
- Détecte automatiquement l'agent connecté (aucune sélection de nom nécessaire), à condition que les Règles d'accès du document soient correctement configurées.
- Découvre automatiquement les champs de chaque formulaire à partir de la structure réelle des tables Grist — ajouter un nouveau type de formulaire ne nécessite **aucune modification de ce code** (voir `docs/Widgets_Dynamiques_Grist_Reference.md` et `docs/IT_Creation_Nouveau_Formulaire.md`).
- Autocomplétion d'adresse via l'API Adresse (BAN, data.gouv.fr).
- Gère l'envoi de pièces jointes (photos) directement vers l'API Grist.

**Fichiers :**

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'entrée, ordre de chargement des scripts |
| `style.css` | Habillage visuel |
| `grist-api.js` | Communication bas niveau avec Grist (upload de pièces jointes, écriture via l'API REST) |
| `schema.js` | Découverte dynamique des champs d'un formulaire |
| `data.js` | Chargement des données (`Agents`, `Formulaires`) et détection de l'agent connecté |
| `address.js` | Autocomplétion d'adresse |
| `ui.js` | Rendu de l'interface et liaison des événements |
| `app.js` | État global et démarrage — se charge en dernier |

Accès requis dans Grist : **Complet** (lecture et écriture).

---

## `dashboard/` — Tableau de bord

Vue d'ensemble des interventions déclarées, avec filtres Site / Service et un jeu de graphiques par type de formulaire.

**Points clés :**
- Filtres Site → Service en cascade, alimentés uniquement par les données que l'utilisateur connecté est autorisé à voir (un Manager ne verra que son propre site/service dans les listes).
- Vue générale (répartition par formulaire, par site, par service) quand aucun formulaire spécifique n'est sélectionné.
- Vue par formulaire : en cliquant sur un type de formulaire, les graphiques se reconstruisent automatiquement à partir de ses champs propres (Choix, Booléen, Numérique), sans configuration supplémentaire pour un nouveau formulaire.

**Fichiers :**

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'entrée |
| `style.css` | Habillage visuel (même palette que le widget formulaire) |
| `data.js` | Chargement des données et découverte dynamique des champs à visualiser |
| `charts.js` | Rendu des graphiques (Chart.js) |
| `app.js` | État global, filtres, démarrage |

Accès requis dans Grist : **Lecture seule**.

---

## Déploiement

Les deux widgets sont des sites statiques : aucun serveur ni build n'est nécessaire.

1. Héberger le contenu d'un dossier (`formulaire/` ou `dashboard/`) tel quel — par exemple via GitHub Pages, ou via un CDN comme jsDelivr pointant sur ce dépôt.
2. Dans Grist, ajouter un widget personnalisé (**Ajouter un widget → Personnalisé**), et renseigner l'URL du `index.html` correspondant.
3. Accorder le niveau d'accès demandé au premier chargement (Complet pour `formulaire/`, Lecture seule pour `dashboard/`).

> ⚠️ Les CDN (jsDelivr notamment) mettent parfois les fichiers en cache plusieurs heures. Si une modification ne semble pas prise en compte après publication, vérifiez d'abord le numéro de version affiché dans le widget (`build AAAA-MM-JJ-vN`, visible à l'écran et dans la console du navigateur) avant de chercher un bug côté code.

## Limites connues

- La découverte automatique des champs ne détecte que le type Grist générique (Texte, Numérique, Booléen, Date, Choix, Pièce jointe) — les comportements spécifiques (autocomplétion d'adresse, exclusion d'un champ numérique de la moyenne affichée) reposent sur de petites conventions documentées dans `docs/Widgets_Dynamiques_Grist_Reference.md`.
- Un agent avec un accès direct aux tables brutes de Grist (hors widget) peut créer une ligne technique vide en référençant une réponse existante — limitation acceptée, sans impact réel puisque la ligne reste définitivement vide (aucun droit de modification).
- Testé sur l'instance SaaS `docs.getgrist.com` et sur une instance self-hosted ; en cas de comportement différent sur une autre instance, consulter en priorité la section « pièces jointes » de `docs/API_Grist_Widget_Reference.md`.
