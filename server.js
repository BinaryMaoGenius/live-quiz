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

const PORT = process.env.PORT || 3005;

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
  const host = req.get('host');
  const forwardedProto = req.get('X-Forwarded-Proto');
  const protocol = forwardedProto || req.protocol;
  
  // Détection Render
  if (host && host.includes('onrender.com')) {
    const renderUrl = `https://${host}`;
    console.log('🚀 Mode Render détecté:', renderUrl);
    return renderUrl;
  }

  // Détection ngrok
  if (host && (host.includes('ngrok-free.app') || host.includes('ngrok-free.dev') || host.includes('ngrok.io') || host.includes('ngrok'))) {
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
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Digital Day - Mission Hub</title>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        :root {
            --accent: #3b82f6;
            --accent-glow: rgba(59, 130, 246, 0.5);
            --bg: #030712;
            --surface: #0f172a;
            --border: rgba(255, 255, 255, 0.08);
            --text-muted: #64748b;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg);
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background-image: 
                linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px);
            background-size: 40px 40px;
            z-index: -1;
        }

        .container {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 1rem;
            padding: 2.5rem;
            max-width: 500px;
            width: 100%;
            position: relative;
            overflow: hidden;
        }

        .container::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; height: 3px;
            background: var(--accent);
            box-shadow: 0 0 15px var(--accent-glow);
        }

        .header {
            text-align: center;
            margin-bottom: 2rem;
        }

        h1 {
            font-size: 1.5rem;
            letter-spacing: 0.1em;
            font-weight: 900;
            margin-bottom: 0.5rem;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.7rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            padding: 0.4rem 0.8rem;
            background: rgba(16, 185, 129, 0.1);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 2rem;
            margin-bottom: 1.5rem;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            box-shadow: 0 0 10px #10b981;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
            100% { opacity: 1; transform: scale(1); }
        }

        .info-panel {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border);
            padding: 1rem;
            border-radius: 0.5rem;
            margin-bottom: 2rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
            color: var(--text-muted);
            word-break: break-all;
        }

        .btn {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            color: var(--accent);
            padding: 1.25rem;
            border-radius: 0.75rem;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.2s;
            text-align: center;
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            width: 100%;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        .btn:hover {
            background: var(--accent);
            color: white;
            box-shadow: 0 0 20px var(--accent-glow);
            transform: translateY(-2px);
        }

        .result {
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid var(--border);
            text-align: left;
        }

        .result h3 {
            font-size: 1rem;
            color: #10b981;
            margin-bottom: 1rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        .result-item {
            margin-bottom: 1rem;
        }

        .result-label {
            font-size: 0.7rem;
            font-weight: 800;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 0.2rem;
        }

        .result-value {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9rem;
            color: #e2e8f0;
            background: rgba(255, 255, 255, 0.05);
            padding: 0.5rem;
            border-radius: 0.25rem;
            word-break: break-all;
        }
        
        .result a {
            color: var(--accent);
            text-decoration: none;
        }
        
        .result a:hover {
            text-decoration: underline;
        }

        .qr-wrapper {
            background: white;
            padding: 10px;
            border-radius: 0.5rem;
            display: inline-block;
            margin: 1rem 0;
        }

        .qr-wrapper img {
            display: block;
            max-width: 150px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>ZUGENBERG <span style="color: var(--accent)">HUB</span></h1>
          <div class="status-badge">
            <div class="status-dot"></div>
            System Online
          </div>
        </div>
        
        <div class="info-panel">
          > GATEWAY_URL: ${baseUrl}<br>
          > STATUS: READY FOR INITIALIZATION
        </div>
        
        <button class="btn" onclick="createGame()">⚡ Initialize New Session</button>
        
        <div id="result"></div>
      </div>

      <script>
        async function createGame() {
          const response = await fetch('/api/game/create');
          const data = await response.json();
          document.getElementById('result').innerHTML = \`
            <div class="result">
              <h3>[+] Session Established</h3>
              
              <div class="result-item">
                <div class="result-label">Mission ID</div>
                <div class="result-value" style="color: var(--accent); font-weight: bold;">\${data.gameId}</div>
              </div>
              
              <div style="text-align: center;">
                  <div class="qr-wrapper"><img src="\${data.qr}" alt="Access Code"></div>
              </div>

              <div class="result-item">
                <div class="result-label">Player Access Vector</div>
                <div class="result-value"><a href="\${data.url}" target="_blank">\${data.url}</a></div>
              </div>
              
              <div class="result-item">
                <div class="result-label">Command Console</div>
                <div class="result-value"><a href="\${data.adminUrl}" target="_blank">\${data.adminUrl}</a></div>
              </div>
              
              <div class="result-item">
                <div class="result-label">Main Display</div>
                <div class="result-value"><a href="\${data.screenUrl}" target="_blank">\${data.screenUrl}</a></div>
              </div>
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
    if (!game || !game.questionActive || !game.currentQuestion) {
      socket.emit('error', 'Action non autorisée ou question terminée');
      return;
    }
    
    if (game.answeredPlayers.has(socket.id)) return;
    
    const question = game.currentQuestion;
    const responseTime = Date.now() - game.questionStartTime;
    const isCorrect = (parseInt(answer) === parseInt(question.correct));
    
    const player = game.players[socket.id];
    
    if (isCorrect && responseTime <= question.timeLimit * 1000) {
      const points = calculatePoints(question.points, responseTime, question.timeLimit);
      
      if (player) {
        player.score += points;
        game.scores[player.pseudo] = player.score;
        io.to(gameId).emit('leaderboard-update', game.scores);
        console.log(`✅ ${player.pseudo} a répondu correctement (+${points} pts)`);
      }
      
      socket.emit('answer-result', {
        correct: true,
        points: points,
        responseTime: responseTime
      });
    } else {
      socket.emit('answer-result', {
        correct: false,
        points: 0,
        correctAnswer: question.options[question.correct]
      });
      if (player) console.log(`❌ ${player.pseudo} a donné une mauvaise réponse`);
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