# Chrome Web Store - Fiche de publication

## Nom
TenUp - Recherche Licenciés FFT

## Résumé (132 caractères max)
Recherche en lot de licenciés FFT sur Ten'Up : classement, club, palmarès. Export CSV. Connexion tenup.fft.fr requise.

## Description détaillée

Vous êtes dirigeant de club, juge-arbitre, capitaine d'équipe ou simplement joueur curieux ? Cette extension vous permet de rechercher rapidement un ou plusieurs licenciés de la Fédération Française de Tennis (FFT) sur la plateforme Ten'Up, directement depuis votre navigateur — sans jongler entre les pages du site.

Idéale pour préparer une rencontre par équipes, vérifier les classements adverses avant un championnat, ou constituer une liste de joueurs pour votre club.


FONCTIONNALITÉS PRINCIPALES

• Recherche en lot
Collez une liste de numéros de licence (un par ligne, ou séparés par des virgules), et l'extension les recherche tous automatiquement, l'un après l'autre. Plus besoin de chercher chaque joueur individuellement sur Ten'Up.

• Informations complètes par joueur
Pour chaque licence trouvée, l'extension affiche : nom, prénom, année de naissance, club, classement actuel et meilleur classement historique (avec la date).

• Lien direct vers le palmarès
Chaque résultat inclut un lien cliquable vers la fiche palmarès du joueur sur Ten'Up, pour consulter son historique complet en un clic.

• Export CSV
Copiez l'ensemble des résultats au format CSV (séparateur point-virgule) en un clic, prêt à être collé dans Excel, Google Sheets ou LibreOffice Calc. Le CSV inclut 9 colonnes : licence, nom, prénom, année de naissance, club, classement, meilleur classement, licence complète et lien vers la fiche.

• Sauvegarde automatique
Vos numéros saisis et vos résultats sont automatiquement sauvegardés localement. Si vous fermez l'onglet ou le navigateur, vous retrouvez tout en rouvrant l'extension.

• Nettoyage intelligent des numéros
Les lettres de licence (ex: "0877994 R" ou "4826036 B") sont retirées automatiquement avant la recherche. Vous pouvez coller directement depuis un document sans vous soucier du formatage.

• Barre de progression et bouton d'arrêt
Suivez l'avancement de vos recherches en temps réel. Vous pouvez stopper une recherche en cours à tout moment sans perdre les résultats déjà obtenus.

• Gestion intelligente des erreurs
L'extension détecte automatiquement si votre session Ten'Up a expiré et vous en informe clairement. La première licence est testée avec 3 tentatives automatiques, les suivantes avec 2.


COMMENT UTILISER L'EXTENSION

1. Connectez-vous sur tenup.fft.fr avec votre compte FFT habituel
2. Cliquez sur l'icône de l'extension dans la barre d'outils (un onglet dédié s'ouvre)
3. Collez vos numéros de licence dans la zone de texte (un par ligne)
4. Cliquez sur "Rechercher" ou utilisez le raccourci Ctrl+Entrée (Cmd+Entrée sur Mac)
5. Les résultats s'affichent au fur et à mesure dans un tableau
6. Cliquez sur "palmarès" pour consulter la fiche détaillée d'un joueur
7. Cliquez sur "Copier CSV" pour exporter les résultats vers votre tableur

Astuce : les licences introuvables apparaissent en surbrillance orange dans le tableau pour les repérer facilement.


CAS D'USAGE

• Capitaine d'équipe : récupérez les classements de l'équipe adverse avant une rencontre interclubs
• Juge-arbitre : vérifiez rapidement les licences des participants lors d'un tournoi
• Dirigeant de club : constituez un tableau récapitulatif de vos adhérents avec leur classement actuel
• Joueur : comparez les classements de vos partenaires d'entraînement ou de vos prochains adversaires


PRÉREQUIS

• Une connexion active sur tenup.fft.fr est obligatoire AVANT de lancer une recherche (l'extension utilise votre session existante)
• Un compte FFT / Ten'Up valide est nécessaire
• La navigation privée peut empêcher la transmission des cookies de session et causer des dysfonctionnements


PERMISSIONS UTILISÉES

• storage : sauvegarde locale de vos numéros saisis et résultats de recherche, uniquement sur votre ordinateur
• tenup.fft.fr : envoi des requêtes de recherche de licenciés vers le site officiel de la FFT

Aucune autre communication réseau n'est effectuée. Aucune donnée n'est transmise à un tiers. Voir la politique de confidentialité pour plus de détails.


CONFIDENTIALITÉ ET DONNÉES

Cette extension ne collecte, ne stocke ni ne transmet aucune donnée personnelle à des tiers. Toutes les données (numéros de licence, résultats de recherche) restent exclusivement sur votre ordinateur dans le stockage local du navigateur. L'extension communique uniquement avec tenup.fft.fr pour effectuer les recherches.


À PROPOS

Cette extension est un projet open source. Le code source est disponible sur GitHub : https://github.com/florianpoujol/tenup-recherche

Cette extension n'est pas affiliée à la Fédération Française de Tennis ni à la plateforme Ten'Up. Elle facilite simplement la consultation d'informations de licenciés accessibles via l'interface Ten'Up existante.

## Catégorie
Productivité (ou Sports)

## Langue
Français

## Site web
https://github.com/florianpoujol/tenup-recherche


# Procédure de publication Chrome Web Store

1. Créer un compte développeur sur https://chrome.google.com/webstore/devconsole/
   - Frais uniques : 5 $ USD
   - Nécessite un compte Google

2. Préparer le package :
   - Depuis le dossier tenup-extension/ : zipper tout le contenu
   - Commande : cd tenup-extension && zip -r ../tenup-extension-chrome.zip . -x ".*" "STORE_*" "PRIVACY*"

3. Icônes nécessaires pour le store (à fournir séparément) :
   - Icône 128x128 px (déjà dans icons/)
   - Screenshot(s) : 1280x800 ou 640x400 px (au moins 1, jusqu'à 5)
   - Tuile promotionnelle (optionnel) : 440x280 px

4. Soumettre sur https://chrome.google.com/webstore/devconsole/ :
   - "Nouvel élément" → uploader le .zip
   - Remplir la fiche avec les infos ci-dessus
   - Ajouter la politique de confidentialité (voir PRIVACY_POLICY.md)
   - Soumettre pour examen (1-3 jours ouvrés)
