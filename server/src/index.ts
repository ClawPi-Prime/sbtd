import express from 'express';
import { createServer } from 'http';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { LobbyRoom } from './LobbyRoom';

const PORT = Number(process.env.PORT) || 2567;

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});
app.use(limiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

// Start
gameServer.listen(PORT).then(() => {
  console.log(`🎮 SquadBattleTD server listening on port ${PORT}`);
  console.log(`📊 Monitor: http://localhost:${PORT}/colyseus`);
});
