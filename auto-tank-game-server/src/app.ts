// src/app.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameEngine } from './core/GameEngine';
import { GameConfig, ClientMessage } from './types/GameTypes';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Game configuration
const gameConfig: GameConfig = {
  mapWidth: 25,
  mapHeight: 19,
  tileSize: 32,
  maxPlayers: 4,
  tickRate: 10,
  bulletSpeed: 1,
  bulletDamage: 25,
  randomWallCount: 20
};

const gameRooms = new Map<string, GameEngine>();

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log(`⚡ New socket connected: ${socket.id}`);

  // Join game
  socket.on('join_game', (data: { playerName?: string }) => {
    const playerName = (data && data.playerName) ? String(data.playerName) : `Player_${socket.id.slice(0,5)}`;
    console.log(`🎮 ${playerName} (${socket.id}) is joining...`);

    // find available room
    let availableRoom: GameEngine | null = null;
    for (const room of gameRooms.values()) {
      if (room.canAcceptPlayers()) {
        availableRoom = room;
        break;
      }
    }

    // create room if none
    if (!availableRoom) {
      const roomId = `room_${gameRooms.size + 1}`;
      availableRoom = new GameEngine(roomId, gameConfig, io);
      gameRooms.set(roomId, availableRoom);
      console.log(`🆕 Created new room: ${roomId}`);
    }

    const player = availableRoom.addPlayer({ id: socket.id, name: playerName });
    if (player) {
      const state = availableRoom.getGameState();
      socket.join(state.id);
      io.to(state.id).emit('player_joined', { player: { ...player } });
      // send initial full game_state to the new socket
      socket.emit('game_state', availableRoom.getSerializableState());
      console.log(`👤 ${playerName} joined ${state.id}`);
    } else {
      socket.emit('join_error', { message: 'Room full or cannot join' });
    }
  });

  // Player action handler
  socket.on('player_action', (data: ClientMessage) => {
    try {
      for (const room of gameRooms.values()) {
        // look up in serializable players array
        const state = room.getGameState();
        if (state.players.some((p: any) => p.id === socket.id)) {
          room.handlePlayerAction(socket.id, data.action);
          break;
        }
      }
    } catch (err) {
      console.error('Error handling player_action:', err);
    }
  });

  // Monitor mode
  socket.on('monitor_mode', (data: { isMonitor?: boolean }) => {
    if (data && data.isMonitor) {
      socket.join('monitor');
      const activeRoom = Array.from(gameRooms.values())[0];
      socket.emit('monitor_connected', {
        success: true,
        roomId: activeRoom?.getGameState().id || 'waiting',
        gameState: activeRoom ? activeRoom.getSerializableState() : null,
        message: activeRoom ? 'Monitoring active game' : 'No active games yet'
      });
      console.log(`🔍 Monitor connected: ${socket.id}`);
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
    for (const [roomId, room] of gameRooms.entries()) {
      const state = room.getGameState();
      if (state.players.some((p: any) => p.id === socket.id)) {
        room.removePlayer(socket.id);
        io.to(roomId).emit('player_left', { playerId: socket.id });
        console.log(`🚪 Player ${socket.id} left ${roomId}`);
        if (room.getPlayerCount() === 0) {
          console.log(`🧹 Removing empty room ${roomId}`);
          gameRooms.delete(roomId);
        }
        break;
      }
    }
  });
});

// start server
const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`🚀 Auto Tank Game Server running on port ${PORT}`);
  console.log(`🎯 GameConfig:`, gameConfig);
});

// global handlers
process.on('uncaughtException', err => console.error('[UNCAUGHT]', err));
process.on('unhandledRejection', err => console.error('[UNHANDLED]', err));
