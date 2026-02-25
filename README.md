# TenUp - Recherche Licenciés FFT

Extension Chrome pour rechercher en lot des licenciés de la Fédération Française de Tennis sur [Ten'Up](https://tenup.fft.fr).

## Fonctionnalités

- Recherche en lot par numéros de licence (un par ligne)
- Affichage du classement, club, meilleur classement, année de licence
- Détails complets par joueur : profil, fiche, palmarès, bilan classement, historique, simulation
- Export CSV (copie dans le presse-papier)
- Export Markdown (.md) avec toutes les données détaillées
- Les lettres de licence (ex: "R", "B") sont retirées automatiquement
- Raccourci `Ctrl+Entrée` pour lancer la recherche

## Prérequis

- Google Chrome version 111+
- Être connecté sur [tenup.fft.fr](https://tenup.fft.fr) dans un onglet ouvert

## Installation

### Depuis le Chrome Web Store

*(publication en cours)*

### En mode développeur

1. Cloner ce dépôt
2. Ouvrir `chrome://extensions/` dans Chrome
3. Activer le **Mode développeur** (en haut à droite)
4. Cliquer sur **Charger l'extension non empaquetée**
5. Sélectionner le dossier `tenup-extension/`

## Utilisation

1. Se connecter sur [tenup.fft.fr](https://tenup.fft.fr)
2. Cliquer sur l'icône de l'extension dans la barre Chrome
3. Saisir les numéros de licence (un par ligne)
4. Cliquer sur **Rechercher** ou `Ctrl+Entrée`
5. Les résultats s'affichent avec les détails chargés en arrière-plan
6. Cliquer sur **détails** pour voir les informations complètes d'un joueur
7. Exporter via **Copier CSV** ou **Exporter MD**

## Build

Le script `build.sh` génère le fichier ZIP pour le Chrome Web Store :

```bash
./build.sh
```

Le ZIP est créé dans `store-assets/tenup-extension-chrome.zip`.

## Structure du projet

```
tenup-extension/       # Code source de l'extension
  manifest.json        # Manifest V3
  background.js        # Service worker (proxy API, gestion session DataDome)
  popup.html           # Interface utilisateur
  popup.css            # Styles
  popup.js             # Logique (recherche, formatters, export)
  icons/               # Icônes 16/48/128px
store-assets/          # Screenshots et assets pour le Chrome Web Store
build.sh               # Script de build du ZIP
PRIVACY_POLICY.md      # Politique de confidentialité
```

## Notes techniques

- L'API Ten'Up (`/back/v1/`) est protégée par DataDome (anti-bot). L'extension recharge automatiquement l'onglet Ten'Up pour rafraîchir le cookie de session avant les appels API.
- Les appels API sont exécutés dans le contexte de la page Ten'Up via `chrome.scripting.executeScript` avec `world: "MAIN"`.
- Les détails des joueurs sont récupérés séquentiellement (un joueur à la fois) pour éviter les blocages DataDome.
- En cas d'erreur 401, un retry automatique avec refresh de session est effectué.

## Licence

MIT
