# Eyecare 20-20-20

**Eyecare 20-20-20** est une application conçue pour réduire la fatigue oculaire en suivant la règle des 20-20-20 : toutes les 20 minutes, regardez à 20 pieds (6 mètres) pendant 20 secondes.

## Fonctionnalités

### 🛡️ Protection Oculaire (Cœur de l'application)
*   **Cycle Automatique de 20 Minutes** : Un compte à rebours se lance dès le démarrage.
*   **Alertes Sonores et Notifications** : Notification système et signal sonore à la fin des 20 minutes.
*   **Rappels Persistants** : Notification toutes les 10 minutes si la pause de 20 secondes n'est pas effectuée.
*   **Mode "Pause" Manuel** : L'utilisateur lance le décompte de 20 secondes. Une alerte signale la fin de la pause et relance le cycle.

### ⚙️ Personnalisation et Flexibilité
*   **Réglages Sur Mesure** : Ajustez les durées de travail et de pause selon vos préférences.
*   **Mode "Ne Pas Déranger"** : Suspendez temporairement les alertes lors de vos réunions ou présentations.
*   **Bibliothèque de Sons** : Choisissez le signal sonore qui vous convient le mieux.

### 📊 Statistiques et Motivation
*   **Tableau de Bord** : Suivez le nombre de pauses effectuées par jour et par semaine.
*   **Objectifs Quotidiens** : Relevez le défi d'atteindre votre quota de pauses pour protéger votre vue.

### ✨ Expérience Utilisateur (UX)
*   **Mode "Strict" (Overlay)** : Option pour afficher un voile sur l'écran pendant les 20 secondes, vous incitant à détacher votre regard.
*   **Mini-Minuteur Flottant** : Un décompte discret dans un coin de l'écran pour anticiper la prochaine pause.
*   **Thèmes Adaptatifs** : Support complet des modes clair et sombre (Dark Mode) de votre système.

### 💻 Intégration Système
*   **Multiplateforme** : Compatible avec Windows, macOS et Linux (grâce à Electron).
*   **Lancement Automatique** : S'exécute au démarrage de l'OS.
*   **Icône de Zone de Notification** : Accès rapide via la barre des tâches.
*   **Détection d'Activité** : Le minuteur se met automatiquement en pause si l'ordinateur est verrouillé ou si aucune activité n'est détectée.

## Installation

> ℹ️ **Migration en cours** : l'application, historiquement écrite en Java, est en cours de migration vers [Electron](https://www.electronjs.org/) (Node.js + Chromium) afin de proposer une expérience multiplateforme unifiée (Windows, macOS, Linux).

### Prérequis
*   [Node.js](https://nodejs.org/) 18 ou supérieur (et `npm`) pour lancer l'application depuis les sources.

### Depuis les sources
1.  Clonez le dépôt et installez les dépendances : `npm install`.
2.  Lancez l'application en mode développement : `npm start`.
3.  Générez un exécutable distribuable pour votre plateforme : `npm run build` (utilise [electron-builder](https://www.electron.build/)).

### Windows
1.  Téléchargez l'exécutable (`.exe`) généré ou fourni dans les releases.
2.  Pour le lancement automatique : Appuyez sur `Win + R`, tapez `shell:startup` et placez-y un raccourci vers l'application.

### macOS
1.  Téléchargez l'image disque (`.dmg`) et glissez l'application dans le dossier `Applications`.
2.  Pour le lancement automatique : Ajoutez l'application dans Préférences Système > Utilisateurs et groupes > Ouverture.

### Linux
1.  Téléchargez le paquet adapté à votre distribution (`.AppImage`, `.deb`, …) et rendez-le exécutable si besoin : `chmod +x eyecare-20-20-20.AppImage`.
2.  Pour le lancement automatique : Ajoutez l'application dans "Applications au démarrage" ou créez un fichier `.desktop` dans `~/.config/autostart/`.

## Utilisation

1.  **Démarrage** : L'application se lance en arrière-plan et commence le cycle.
2.  **Alerte** : Après 20 minutes, vous recevez une notification.
3.  **Action** : Cliquez sur l'icône ou l'interface pour lancer les 20 secondes de repos.
4.  **Reprise** : Le cycle de 20 minutes repart automatiquement après la pause.

---
*Prenez soin de vos yeux !*
