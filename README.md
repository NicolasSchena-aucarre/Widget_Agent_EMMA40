# Widgets Grist — Prototype Emma40

Widgets personnalisés Grist pour la saisie et la visualisation des interventions terrain (relevés de compteur, signalements de fuite, contrôles qualité réseau…).

Trois widgets, indépendants les uns des autres, chacun dans son propre dossier :

```
.
├── formulaire/     Widget de saisie — utilisé par les agents sur le terrain
├── dashboard/      Widget de visualisation — utilisé par managers, responsables de site et direction
└── liste/   Widget de consultation — détail d'une intervention en lecture seule, avec carte
```

---

## `formulaire/` — Formulaire terrain

Permet à un agent de déclarer une intervention (relevé de compteur, signalement de fuite, contrôle qualité réseau…) directement depuis son téléphone, avec photo à l'appui.

**Points clés :**
- Détecte automatiquement l'agent connecté (aucune sélection de nom nécessaire), à condition que les Règles d'accès du document soient correctement configurées.
- Découvre automatiquement les champs de chaque formulaire à partir de la structure réelle des tables Grist — ajouter un nouveau type de formulaire ne nécessite **aucune modification de ce code**.
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

## `liste/` — Détail d'une intervention

Liste des interventions (filtrée selon les Règles d'accès, comme les deux autres widgets) ; cliquer sur une ligne affiche le formulaire tel qu'il a été rempli, en lecture seule, avec une carte centrée sur l'adresse saisie.

**Points clés :**
- Liste à gauche, détail à droite ; aucune valeur n'est modifiable depuis ce widget.
- Découvre automatiquement les champs à afficher pour chaque type de formulaire, comme les deux autres widgets — un nouveau formulaire y apparaît sans modification de code.
- Pièces jointes affichées en vignette, cliquables pour un agrandissement en fenêtre (sans quitter la page), avec bouton de téléchargement séparé.
- Minimap (Leaflet + fonds OpenStreetMap) géocodant l'adresse saisie via l'API Adresse (BAN), zoom et déplacement disponibles directement dans la carte.

**Fichiers :**

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'entrée, inclut Leaflet (CDN) |
| `style.css` | Habillage visuel, y compris la fenêtre d'agrandissement des pièces jointes et la carte |
| `data.js` | Chargement des données, découverte dynamique des champs, géocodage d'adresse |
| `app.js` | État global, liste, détail, pièces jointes, carte |

Accès requis dans Grist : **Lecture seule**.

---

## Déploiement

Les trois widgets sont des sites statiques : aucun serveur ni build n'est nécessaire.

1. Héberger le contenu d'un dossier (`formulaire/`, `dashboard/` ou `liste/`) tel quel — par exemple via GitHub Pages, ou via un CDN comme jsDelivr pointant sur ce dépôt.
2. Dans Grist, ajouter un widget personnalisé (**Ajouter un widget → Personnalisé**), et renseigner l'URL du `index.html` correspondant.
3. Accorder le niveau d'accès demandé au premier chargement (Complet pour `formulaire/`, Lecture seule pour `dashboard/` et `liste/`).

> ⚠️ Les CDN (jsDelivr notamment) mettent parfois les fichiers en cache plusieurs heures. Si une modification ne semble pas prise en compte après publication, vérifiez d'abord le numéro de version affiché dans le widget (`build AAAA-MM-JJ-vN`, visible à l'écran et dans la console du navigateur) avant de chercher un bug côté code.

## Prérequis côté document Grist

Les trois widgets reposent sur un modèle de données et des Règles d'accès précis (table `Reponses` centrale, tables techniques liées, colonnes « à plat » pour contourner les limites de chaînage des règles ACL, rôles `Agent` / `Manager` / `Responsable_Site` / `Direction`). Ce prototype n'est pas conçu pour fonctionner sur un document Grist quelconque sans adapter les Règles d'accès en conséquence.

## Limites connues

- La découverte automatique des champs ne détecte que le type Grist générique (Texte, Numérique, Booléen, Date, Choix, Pièce jointe) — certains comportements spécifiques (autocomplétion d'adresse, exclusion d'un champ numérique de la moyenne affichée dans le tableau de bord) reposent sur de petites conventions de nommage ou des listes d'exclusion, à tenir à jour manuellement pour tout nouveau formulaire qui en aurait besoin.
- Un agent avec un accès direct aux tables brutes de Grist (hors widget) peut créer une ligne technique vide en référençant une réponse existante — limitation acceptée, sans impact réel puisque la ligne reste définitivement vide (aucun droit de modification).
- La minimap dépend de la qualité de l'adresse saisie : une adresse incomplète ou mal formée peut ne pas être localisée (message affiché à la place de la carte plutôt qu'une carte incorrecte).
- Testé sur l'instance SaaS `docs.getgrist.com` et sur une instance self-hosted ; le comportement peut différer sur une autre instance, en particulier pour tout ce qui touche à l'upload et à la lecture de pièces jointes.
