const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============ FONCTION POUR TROUVER L'IP AUTOMATIQUEMENT ============
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ============ FONCTION POUR OBTENIR L'URL DE BASE (AUTO-DÉTECTION NGROK) ============
function getBaseUrl(req) {
  const protocol = req.protocol;
  const host = req.get('host');
  
  // Détection ngrok
  if (host && (host.includes('ngrok-free.dev') || host.includes('ngrok.io') || host.includes('ngrok'))) {
    const ngrokUrl = `${protocol}://${host}`;
    console.log('🌐 Mode ngrok détecté:', ngrokUrl);
    return ngrokUrl;
  }
  
  // Mode local
  const localIp = getLocalIp();
  const localUrl = `http://${localIp}:${PORT}`;
  console.log('💻 Mode local détecté:', localUrl);
  return localUrl;
}

// ============ DONNÉES EN MÉMOIRE ============
let games = {};

// ============ FONCTIONS UTILITAIRES ============
function loadQuestions() {
  try {
    const data = fs.readFileSync('./questions.json', 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.log('📝 Utilisation des questions par défaut');
    return [
      {
        id: 1,
        text: "Quelle est la capitale de la France ?",
        options: ["Paris", "Lyon", "Marseille", "Bordeaux"],
        correct: 0,
        timeLimit: 15,
        points: 100,
        image: null
      },
      {
        id: 2,
        text: "Quelle est la couleur du cheval blanc d'Henri IV ?",
        options: ["Blanc", "Noir", "Gris", "Marron"],
        correct: 0,
        timeLimit: 15,
        points: 100,
        image: null
      },
      {
        id: 3,
        text: "Combien de secondes y a-t-il dans une minute ?",
        options: ["50", "60", "70", "80"],
        correct: 1,
        timeLimit: 10,
        points: 50,
        image: null
      },
      {
        id: 4,
        text: "Qui a peint La Joconde ?",
        options: ["Van Gogh", "Picasso", "Léonard de Vinci", "Rembrandt"],
        correct: 2,
        timeLimit: 15,
        points: 100,
        image: null
      },
      {
        id: 5,
        text: "Quelle est la formule chimique de l'eau ?",
        options: ["O2", "CO2", "H2O", "NaCl"],
        correct: 2,
        timeLimit: 10,
        points: 80,
        image: null
      }
    ];
  }
}

function createNewGame() {
  const gameId = uuidv4().substring(0, 8);
  games[gameId] = {
    id: gameId,
    players: {},
    scores: {},
    currentQuestion: null,
    questionStartTime: null,
    questionActive: false,
    answeredPlayers: new Set(),
    questions: loadQuestions(),
    currentQuestionIndex: -1,
    gameActive: false,
    questionTimeout: null
  };
  console.log(`✅ Partie créée: ${gameId}`);
  return gameId;
}

function calculatePoints(maxPoints, responseTime, timeLimit) {
  if (responseTime > timeLimit * 1000) return 0;
  const ratio = 1 - (responseTime / (timeLimit * 1000));
  let points = Math.floor(maxPoints * ratio);
  return Math.max(10, points);
}

// ============ ROUTES ============

// Page d'accueil
app.get('/', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Live Quiz System</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
          max-width: 500px;
          width: 100%;
        }
        h1 { color: #667eea; margin-bottom: 10px; font-size: 2em; }
        p { color: #666; margin-bottom: 30px; }
        button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 12px 30px;
          border-radius: 25px;
          font-size: 16px;
          cursor: pointer;
          transition: transform 0.3s;
        }
        button:hover { transform: translateY(-2px); }
        .result {
          margin-top: 20px;
          text-align: left;
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
        }
        a { color: #667eea; word-break: break-all; }
        .qr-code { text-align: center; margin: 20px 0; }
        img { max-width: 200px; border-radius: 10px; }
        .ip-info {
          background: #e8f4fd;
          padding: 10px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 14px;
          word-break: break-all;
        }
        .status {
          background: #d4edda;
          color: #155724;
          padding: 10px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎮 Live Quiz System</h1>
        <div class="status">
          ✅ Serveur actif
        </div>
        <div class="ip-info">
          📡 Accès: <strong>${baseUrl}</strong>
        </div>
        <p>Créez une partie et partagez le QR code</p>
        <button onclick="createGame()">➕ Créer une nouvelle partie</button>
        <div id="result"></div>
      </div>
      <script>
        async function createGame() {
          const response = await fetch('/api/game/create');
          const data = await response.json();
          document.getElementById('result').innerHTML = \`
            <div class="result">
              <h3>✅ Partie créée !</h3>
              <p><strong>ID:</strong> \${data.gameId}</p>
              <div class="qr-code"><img src="\${data.qr}" alt="QR Code"></div>
              <p>📱 <strong>Lien joueur:</strong><br><a href="\${data.url}" target="_blank">\${data.url}</a></p>
              <p>🎮 <strong>Lien admin:</strong><br><a href="\${data.adminUrl}" target="_blank">\${data.adminUrl}</a></p>
              <p>📺 <strong>Lien écran:</strong><br><a href="\${data.screenUrl}" target="_blank">\${data.screenUrl}</a></p>
              <p style="font-size:12px; color:#666; margin-top:10px;">⚠️ Envoyez le <strong>lien joueur</strong> à vos participants</p>
            </div>
          \`;
        }
      </script>
    </body>
    </html>
  `);
});

// Créer une partie et générer QR code
app.get('/api/game/create', async (req, res) => {
  try {
    const gameId = createNewGame();
    const baseUrl = getBaseUrl(req);
    const gameUrl = `${baseUrl}/player/${gameId}`;
    
    console.log('🔗 URL générée pour les joueurs:', gameUrl);
    
    // Générer le QR code
    const qrUrl = await QRCode.toDataURL(gameUrl);
    
    res.json({ 
      gameId, 
      qr: qrUrl, 
      url: gameUrl,
      adminUrl: `${baseUrl}/admin/${gameId}`,
      screenUrl: `${baseUrl}/screen/${gameId}`
    });
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la partie' });
  }
});

// Récupérer les détails d'une partie
app.get('/api/game/:gameId', (req, res) => {
  const game = games[req.params.gameId];
  if (!game) {
    return res.status(404).json({ error: 'Partie non trouvée' });
  }
  res.json({
    id: game.id,
    playerCount: Object.keys(game.players).length,
    gameActive: game.gameActive,
    currentQuestion: game.currentQuestion,
    scores: game.scores
  });
});

// Servir les pages HTML
app.get('/admin/:gameId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/player/:gameId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player', 'index.html'));
});

app.get('/screen/:gameId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'screen', 'index.html'));
});

// ============ COMMANDES ADMIN ============

app.post('/api/admin/:gameId/start', (req, res) => {
  const game = games[req.params.gameId];
  if (!game) {
    return res.status(404).json({ error: 'Partie non trouvée' });
  }
  
  game.gameActive = true;
  game.currentQuestionIndex = -1;
  io.to(req.params.gameId).emit('game-started');
  console.log(`🎬 Quiz démarré pour la partie ${req.params.gameId}`);
  res.json({ success: true });
});

app.post('/api/admin/:gameId/next-question', (req, res) => {
  const game = games[req.params.gameId];
  if (!game) {
    return res.status(404).json({ error: 'Partie non trouvée' });
  }
  
  game.currentQuestionIndex++;
  
  if (game.currentQuestionIndex >= game.questions.length) {
    // Fin du quiz
    const sortedScores = Object.entries(game.scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    io.to(req.params.gameId).emit('quiz-end', {
      finalScores: game.scores,
      top3: sortedScores
    });
    game.gameActive = false;
    return res.json({ finished: true });
  }
  
  game.currentQuestion = game.questions[game.currentQuestionIndex];
  game.questionActive = true;
  game.answeredPlayers.clear();
  game.questionStartTime = Date.now();
  
  // Envoyer la question à tous
  io.to(req.params.gameId).emit('new-question', {
    question: game.currentQuestion,
    questionNumber: game.currentQuestionIndex + 1,
    totalQuestions: game.questions.length
  });
  
  // Timer pour terminer la question automatiquement
  if (game.questionTimeout) {
    clearTimeout(game.questionTimeout);
  }
  
  game.questionTimeout = setTimeout(() => {
    if (game.questionActive) {
      io.to(req.params.gameId).emit('question-end', {
        correctAnswer: game.currentQuestion.options[game.currentQuestion.correct],
        scores: game.scores,
        timeUp: true
      });
      game.questionActive = false;
    }
  }, game.currentQuestion.timeLimit * 1000);
  
  console.log(`📝 Question ${game.currentQuestionIndex + 1}/${game.questions.length} lancée`);
  res.json({ success: true, question: game.currentQuestion });
});

app.post('/api/admin/:gameId/reset', (req, res) => {
  const game = games[req.params.gameId];
  if (!game) {
    return res.status(404).json({ error: 'Partie non trouvée' });
  }
  
  game.players = {};
  game.scores = {};
  game.currentQuestion = null;
  game.questionActive = false;
  game.answeredPlayers.clear();
  game.currentQuestionIndex = -1;
  game.gameActive = false;
  
  if (game.questionTimeout) {
    clearTimeout(game.questionTimeout);
  }
  
  io.to(req.params.gameId).emit('game-reset');
  console.log(`🔄 Partie ${req.params.gameId} réinitialisée`);
  res.json({ success: true });
});

// ============ WEBSOCKETS ============

io.on('connection', (socket) => {
  console.log('🔌 Nouvelle connexion:', socket.id);
  let currentGame = null;

  socket.on('join-game', ({ gameId, pseudo, avatar }) => {
    const game = games[gameId];
    if (!game) {
      socket.emit('error', 'Partie non trouvée');
      return;
    }

    // Vérifier si le pseudo est déjà pris (sauf pour admin et screen)
    if (pseudo !== 'Admin' && pseudo !== 'Screen') {
      const pseudoExists = Object.values(game.players).some(p => p.pseudo === pseudo);
      if (pseudoExists) {
        socket.emit('error', 'Ce pseudo est déjà utilisé');
        return;
      }
    }

    currentGame = gameId;
    
    // Ajouter le joueur (sauf admin et screen)
    if (pseudo !== 'Admin' && pseudo !== 'Screen') {
      game.players[socket.id] = {
        id: socket.id,
        pseudo: pseudo,
        avatar: avatar || '👤',
        score: 0
      };
      game.scores[pseudo] = 0;
      socket.emit('joined', { playerId: socket.id, pseudo });
      console.log(`👤 ${pseudo} a rejoint la partie ${gameId}`);
    } else {
      console.log(`📺 ${pseudo} connecté à la partie ${gameId}`);
    }
    
    // Rejoindre le salon de la partie
    socket.join(gameId);
    
    // Mettre à jour tous les joueurs
    io.to(gameId).emit('players-update', Object.values(game.players));
    io.to(gameId).emit('leaderboard-update', game.scores);
  });

  socket.on('submit-answer', ({ gameId, answer }) => {
    const game = games[gameId];
    if (!game) return;
    if (!game.questionActive) return;
    if (game.answeredPlayers.has(socket.id)) return;
    
    const question = game.currentQuestion;
    if (!question) return;
    
    const responseTime = Date.now() - game.questionStartTime;
    const isCorrect = (answer === question.correct);
    
    if (isCorrect && responseTime <= question.timeLimit * 1000) {
      const points = calculatePoints(question.points, responseTime, question.timeLimit);
      const player = game.players[socket.id];
      if (player) {
        player.score += points;
        game.scores[player.pseudo] = player.score;
        
        socket.emit('answer-result', {
          correct: true,
          points: points,
          responseTime: responseTime
        });
        
        io.to(gameId).emit('leaderboard-update', game.scores);
        console.log(`✅ ${player.pseudo} a répondu correctement en ${(responseTime/1000).toFixed(1)}s, +${points} points`);
      }
    } else {
      socket.emit('answer-result', {
        correct: false,
        points: 0,
        correctAnswer: question.options[question.correct]
      });
    }
    
    game.answeredPlayers.add(socket.id);
    
    // Vérifier si tous les joueurs ont répondu
    if (game.answeredPlayers.size === Object.keys(game.players).length && Object.keys(game.players).length > 0) {
      if (game.questionTimeout) {
        clearTimeout(game.questionTimeout);
      }
      io.to(gameId).emit('question-end', {
        correctAnswer: question.options[question.correct],
        scores: game.scores
      });
      game.questionActive = false;
    }
  });

  socket.on('disconnect', () => {
    if (currentGame && games[currentGame]) {
      const game = games[currentGame];
      if (game.players[socket.id]) {
        const pseudo = game.players[socket.id].pseudo;
        delete game.players[socket.id];
        delete game.scores[pseudo];
        io.to(currentGame).emit('players-update', Object.values(game.players));
        io.to(currentGame).emit('leaderboard-update', game.scores);
        console.log(`👋 ${pseudo} a quitté la partie`);
      }
    }
  });
});

// ============ DÉMARRAGE DU SERVEUR ============
const localIp = getLocalIp();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 SERVEUR LIVE QUIZ DÉMARRÉ !`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📍 Accès local: http://localhost:${PORT}`);
  console.log(`📍 Accès réseau: http://${localIp}:${PORT}`);
  console.log(`\n🌐 POUR TESTS À DISTANCE:`);
  console.log(`   1. Lance ngrok: ngrok http ${PORT}`);
  console.log(`   2. Ouvre l'URL ngrok dans ton navigateur`);
  console.log(`   3. Crée une partie → liens automatiques !`);
  console.log(`${'='.repeat(50)}\n`);
});