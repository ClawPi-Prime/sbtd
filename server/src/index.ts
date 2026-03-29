import express from 'express';
import { createServer } from 'http';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { LobbyRoom } from './rooms/LobbyRoom';
import { GameRoom } from './rooms/GameRoom';

const PORT = Number(process.env.PORT) || 2567;

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

// Health check (before rate limiter — must not be throttled)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rate limiting (applied after /health)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Colyseus monitor (admin UI)
app.use('/colyseus', monitor());

// Create HTTP server
const httpServer = createServer(app);

// Create Colyseus server
const gameServer = new Server({
  server: httpServer,
});

// Register rooms
gameServer.define('lobby', LobbyRoom);
gameServer.define('game_room', GameRoom);

// Start
gameServer.listen(PORT).then(() => {
  console.log(`🎮 SquadBattleTD server listening on port ${PORT}`);
  console.log(`📊 Monitor: http://localhost:${PORT}/colyseus`);
});
