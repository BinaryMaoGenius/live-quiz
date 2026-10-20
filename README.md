<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner-light.svg" alt="Live Quiz" width="100%">
  </picture>
</div>

Application de quiz **en temps réel** : un animateur lance la partie, les participants répondent depuis leur téléphone et un grand écran affiche le jeu. Conçue pour l’événement [Digital Day](https://github.com/BinaryMaoGenius/digital_day).

![Node.js](https://img.shields.io/badge/Node.js-0E0E0C?style=flat-square&logo=nodedotjs&logoColor=D9A441) ![Express](https://img.shields.io/badge/Express-0E0E0C?style=flat-square&logo=express&logoColor=D9A441) ![Socket.IO](https://img.shields.io/badge/Socket.IO-0E0E0C?style=flat-square&logo=socketdotio&logoColor=D9A441) ![JavaScript](https://img.shields.io/badge/JavaScript-0E0E0C?style=flat-square&logo=javascript&logoColor=D9A441)

## Trois interfaces
| Interface | Route | Rôle |
|---|---|---|
| **Animateur** | `/admin/:gameId` | Démarrer, passer à la question suivante, réinitialiser |
| **Joueur** | `/player/:gameId` | Rejoindre avec un pseudo et un avatar, répondre |
| **Écran** | `/screen/:gameId` | Affichage pour la salle |

Une partie est créée via `/api/game/create`, et un **QR code** permet aux joueurs de la rejoindre. Les questions (15 actuellement) sont dans `questions.json`.

```mermaid
flowchart LR
  A[Animateur] -- start / next --> S[Serveur Express + Socket.IO]
  P[Joueurs] -- join / réponse --> S
  S -- questions / scores --> E[Écran de la salle]
  S -- questions --> P
```

## Lancer le projet
```bash
npm install
node server.js     # http://localhost:3000
```
Un fichier `render.yaml` est fourni pour un déploiement sur Render.

## Licence

Code sous [licence MIT](./LICENSE) · © 2026 Emmanuel Elisé Koné.

---

Construit par **Emmanuel Elisé Koné** ([BinaryMaoGenius](https://github.com/BinaryMaoGenius)) · *La tech en clair*
