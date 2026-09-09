# Instruction de Travail — Création d'un nouveau formulaire d'intervention

| | |
|---|---|
| **Domaine d'application** | Document Grist « Prototype_Emma40 » et tout document dérivé utilisant la même architecture (table `Reponses` centrale + tables techniques par formulaire) |
| **Public visé** | Administrateur du document Grist (Propriétaire), sans compétence de développement requise pour suivre cette procédure |
| **Documents associés** | `API_Grist_Widget_Reference.md`, `Widgets_Dynamiques_Grist_Reference.md` |
| **Pré-requis** | Être Propriétaire du document, pour pouvoir créer des tables et modifier les Règles d'accès |

---

## 1. Objet

Cette instruction décrit la procédure complète pour ajouter un nouveau type de formulaire d'intervention (ex. « Contrôle vanne », « Inspection réservoir »), de la création de la table jusqu'à sa mise à disposition effective des agents et son apparition dans le tableau de bord — **sans avoir besoin de modifier le code des widgets**, à une exception près signalée en étape 6.

## 2. Vue d'ensemble de la procédure

```
1. Créer la table technique dans Grist
2. Déclarer le formulaire dans la table Formulaires
3. Donner l'accès (par service et/ou par agent)
4. Ajouter les colonnes à plat nécessaires aux règles ACL
5. Ajouter les règles d'accès (Access Rules) sur la nouvelle table
6. (Si besoin) Exclure un champ numérique de la moyenne du tableau de bord
7. Tester avec chaque rôle avant mise en service
```

Les étapes 1 à 3 ne demandent aucune compétence technique particulière. Les étapes 4 et 5 sont les plus sensibles — c'est là que se trouvent presque tous les pièges recensés dans ce document.

---

## 3. Procédure détaillée

### Étape 1 — Créer la table technique

Créez une nouvelle table dans Grist, avec les colonnes correspondant aux champs voulus.

**Règles à respecter impérativement :**

- La table doit contenir une colonne nommée **exactement** `Reponse`, de type **Référence** vers la table `Reponses`. C'est ce qui relie chaque ligne technique à son enregistrement central. Sans cette colonne, ou avec un nom différent, l'écriture échouera.
- Si le formulaire doit comporter un champ d'adresse avec autocomplétion, nommez la colonne **exactement** `Adresse`, en type **Texte**. Ce nom précis déclenche automatiquement l'autocomplétion (API Adresse du gouvernement) et place le champ en premier dans le formulaire.
- N'utilisez **aucune autre colonne de type Référence** dans cette table. Le widget ignore silencieusement toute colonne de type Référence autre que `Reponse` — un champ de ce type n'apparaîtra jamais dans le formulaire, sans message d'erreur, ce qui peut faire croire à un bug alors que c'est un comportement volontaire.
- Utilisez les types Grist natifs standards : Texte, Numérique, Booléen, Date, Choix, Pièce jointe. Évitez le type **Liste de choix** (ChoiceList) : il n'est pas géré par le formulaire (repli en texte libre) ni par le tableau de bord (champ ignoré).
- **Vérifiez que chaque colonne est bien une « Colonne de données », pas une « Colonne vide ».** Une colonne fraîchement créée dans Grist reste, par défaut, dans un état intermédiaire (techniquement une formule sans contenu) tant qu'on n'a pas explicitement choisi son type de données ou saisi une valeur dedans. Dans ce panneau de droite (icône colonne), sous l'onglet Type, assurez-vous que le type choisi correspond bien à une colonne de saisie (Texte, Numérique, Booléen, Date, Choix…) et non à une formule laissée vide. La découverte automatique des champs ignore volontairement toutes les colonnes de type formule (pour exclure les colonnes calculées internes comme `gristHelper_Display*`) — une colonne restée à l'état « vide » est donc invisible dans le widget, sans aucun message d'erreur.

### Étape 2 — Déclarer le formulaire

Dans la table `Formulaires`, ajoutez une ligne :

| Colonne | Valeur à saisir |
|---|---|
| `Titre` | Le nom affiché aux agents (ex. « Contrôle vanne ») |
| `Table_Technique` | Le nom **exact** de la table créée à l'étape 1 |
| `Actif` | Coché (`Vrai`) |
| `Service_Concerne` | Un ou plusieurs services, si l'accès doit être ouvert par service entier (voir étape 3) |

> ⚠️ **Piège le plus fréquent** : `Table_Technique` doit correspondre **au caractère et à la casse près** au nom réel de la table dans Grist — pas un identifiant numérique, pas une variante d'orthographe. Une erreur ici se traduit par un formulaire visible mais **vide** (aucun champ affiché), sans message d'erreur explicite pour l'agent.

### Étape 3 — Donner l'accès au formulaire

Deux mécanismes, cumulables :

- **Par service** : ajoutez le service concerné dans `Formulaires.Service_Concerne` (colonne modifiable par les Managers eux-mêmes, sans intervention du Propriétaire).
- **Par agent individuel** : ajoutez le formulaire dans `Agents.Formulaires_Accessibles`, pour la ou les personnes concernées.

Si aucun des deux n'est renseigné, aucun agent ne verra ce formulaire, même actif.

### Étape 4 — Ajouter les colonnes à plat pour les règles d'accès

C'est l'étape la plus facilement oubliée, et celle qui a la conséquence la plus grave si elle l'est (voir l'encart d'avertissement ci-dessous).

Dans la **nouvelle table technique**, ajoutez trois colonnes formule :

| Nom de la colonne | Formule |
|---|---|
| `Agent_Email` | `$Reponse.Agent_Email` |
| `Resp_Email` | `$Reponse.Resp_Email` |
| `Manager_Email` | `$Reponse.Manager_Email` |

Ces trois colonnes existent déjà sur `Reponses` — on ne fait ici que les rapatrier sur la nouvelle table technique, en un seul niveau de référence (via `Reponse`), car une règle d'accès ne peut pas chaîner plus d'une référence à la fois (voir l'encart « Pièges » plus bas).

### Étape 5 — Ajouter les règles d'accès (Access Rules)

Dans **Règles d'accès → [nom de la nouvelle table]**, ajoutez ces 5 règles, dans cet ordre, avant toute règle finale de type « refuser tout » :

| # | Condition | Permission |
|---|---|---|
| 1 | `user.Access in [OWNER]` | `+CRUD` *(normalement déjà présente par défaut)* |
| 2 | `user.Profile.Role == "Agent" and newRec.Agent_Email == user.Email` | `+C` |
| 3 | `Tous les autres` | `+R` |

> ⚠️ **C'est l'étape la plus critique de toute la procédure — Vérifiez systématiquement, après avoir créé une table, qu'elle a bien reçu ses propres règles avant de la considérer prête.**

### Étape 6 — Exclure un champ numérique du tableau de bord (si besoin)

Si le nouveau formulaire contient un champ Numérique dont la **moyenne n'a pas de sens métier** (un identifiant, une référence, un numéro de série codé en nombre…), il faut l'exclure manuellement — c'est la seule étape de cette procédure qui touche au code d'un widget.

Dans le fichier `data.js` du widget Tableau de bord, ajoutez une ligne dans `EXCLUDED_NUMERIC_FIELDS` :

```js
var EXCLUDED_NUMERIC_FIELDS = {
  'Releve_de_compteur': ['Index_Releve'],
  'Signalement_de_fuite': ['Diametre_Canalisation'],
  'Nom_De_La_Nouvelle_Table': ['Nom_Du_Champ_A_Exclure']  // <- à ajouter
};
```

Sans cette exclusion, le champ apparaîtra simplement comme une carte affichant une moyenne — ce n'est pas une erreur bloquante, juste une information peu pertinente affichée dans le tableau de bord.

### Étape 7 — Tester avant mise en service

Ne considérez jamais un nouveau formulaire prêt sans être passé par ces vérifications, dans cet ordre :

1. **Compte Propriétaire** : remplir le formulaire (avec pièce jointe si applicable), vérifier la création de la ligne dans `Reponses` **et** dans la nouvelle table technique.
2. **Vraie session Agent séparée** (pas « Voir en tant que ») : le formulaire doit apparaître dans les onglets, se remplir, et s'enregistrer sans blocage.
3. **« Voir en tant que » Manager, Responsable_Site et Direction** : vérifier que chacun voit (ou ne voit pas) les nouvelles données du périmètre attendu, dans `Reponses`, dans la nouvelle table technique, et dans le tableau de bord (onglet du nouveau formulaire).
4. Si l'écriture échoue avec le message *« Blocked by row create access rules »* : la règle de création (n° 6 de l'étape 5) est manquante ou mal orthographiée — ce n'est jamais un problème du widget lui-même à ce stade.

---

## 4. Récapitulatif des pièges à éviter

| Piège | Symptôme | Origine |
|---|---|---|
| Colonne laissée en « Colonne vide » plutôt qu'en « Colonne de données » | Le champ n'apparaît jamais, sans erreur | Étape 1 |
| Colonne `Reponse` absente ou mal nommée | Échec à l'enregistrement | Étape 1 |
| Colonne de Référence autre que `Reponse` dans la table technique | Le champ n'apparaît jamais, sans erreur | Étape 1 |
| Type ChoiceList utilisé | Champ en texte libre côté formulaire, ignoré côté tableau de bord | Étape 1 |
| `Actif` non coché sur la ligne `Formulaires` | Formulaire invisible partout | Étape 2 |
| `Table_Technique` mal orthographié ou mauvaise casse | Formulaire visible, mais vide (aucun champ) | Étape 2 |
| Ni `Service_Concerne` ni `Formulaires_Accessibles` renseigné | Aucun agent ne voit le formulaire | Étape 3 |
| Règle ACL qui chaîne plus d'une référence (`rec.A.B.C`) | La règle ne renvoie silencieusement aucune ligne, sans erreur | Étape 4 / 5 |
| **Règles d'accès non ajoutées sur la nouvelle table** | **Aucun symptôme visible — la table est simplement ouverte à tous les Éditeurs** | Étape 5 |

---

## 5. Documents de référence

- **`API_Grist_Widget_Reference.md`** — détail des appels API utilisés par les widgets (lecture, écriture, pièces jointes), utile en cas de comportement inattendu au niveau technique.
- **`Widgets_Dynamiques_Grist_Reference.md`** — explication de la mécanique de découverte automatique des champs, pour comprendre *pourquoi* les étapes 1 et 2 suffisent à faire apparaître un formulaire sans toucher au code.

---

*Document rédigé dans le cadre du projet Prototype_Emma40. À réviser si l'architecture des règles d'accès ou des widgets évolue.*
