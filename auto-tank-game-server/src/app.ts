import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { GameEngine } from './core/GameEngine'
import { GameConfig } from './types/GameTypes'

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
})

// Game configuration
const gameConfig: GameConfig = {
  mapWidth: 25,
  mapHeight: 19,
  tileSize: 32,
  maxPlayers: 4,
  tickRate: 10, // 10 FPS for now
  bulletSpeed: 1,
  bulletDamage: 25
}

// Game rooms management
const gameRooms = new Map<string, GameEngine>()
let roomCounter = 0

app.use(cors())
app.use(express.json())

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeRooms: gameRooms.size,
    timestamp: new Date().toISOString()
  })
})

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)
  
  let isMonitorMode = false
  let playerRoom: string | null = null

  // Handle monitor mode request
  socket.on('monitor_mode', (data: { isMonitor: boolean }) => {
    if (data.isMonitor) {
      isMonitorMode = true
      console.log(`🔍 Monitor connected: ${socket.id}`)
      
      // Join default room để monitor tất cả activities
      const defaultRoom = 'game-room-1'
      socket.join(defaultRoom)
      
      // Join tất cả existing rooms
      for (const [roomId, gameRoom] of gameRooms.entries()) {
        socket.join(roomId)
        console.log(`📡 Monitor joined existing room: ${roomId}`)
      }
      
      // Find room có players để gửi initial state
      let activeGameState = null
      for (const [roomId, gameRoom] of gameRooms.entries()) {
        if (gameRoom.getPlayerCount() > 0) {
          activeGameState = gameRoom.getSerializableState()
          break
        }
      }
      
      socket.emit('monitor_connected', {
        success: true,
        roomId: defaultRoom,
        gameState: activeGameState,
        message: activeGameState ? 'Monitoring active game' : 'Waiting for players to join'
      })
      return
    }
  })

  // Auto-add player ONLY if NOT in monitor mode
  setTimeout(() => {
    if (!isMonitorMode) {
      try {
        // Tạo tên player tự động
        const playerName = `Player_${socket.id.substring(0, 6)}`
        
        // Find available room or create new one
        let gameRoom = findAvailableRoom()
        if (!gameRoom) {
          gameRoom = createNewRoom()
        }

        // Add player to room automatically
        const player = gameRoom.addPlayer({ id: socket.id, name: playerName })
        if (!player) {
          socket.emit('connection_error', { message: 'All rooms are full' })
          socket.disconnect()
          return
        }

        // Join socket room
        playerRoom = gameRoom.getGameState().id
        socket.join(playerRoom)
        
        // Send welcome message với game state
        socket.emit('connected_to_game', {
          success: true,
          playerId: socket.id,
          roomId: gameRoom.getGameState().id,
          playerData: player,
          gameState: gameRoom.getSerializableState(),
          message: `Welcome ${playerName}! You have been automatically added to the game.`
        })

        // Add all monitors to this room if they aren't already
        const roomId = gameRoom.getGameState().id
        
        // Broadcast to room 
        io.to(roomId).emit('player_joined', {
          player: player,
          gameState: gameRoom.getSerializableState()
        })
        
        // Also broadcast to default room for monitors
        io.to('game-room-1').emit('player_joined', {
          player: player,
          gameState: gameRoom.getSerializableState()
        })
        
        // Broadcast to all sockets (ensures monitors get it)
        io.emit('player_joined', {
          player: player,
          gameState: gameRoom.getSerializableState()
        })

        console.log(`🎮 Player ${playerName} (${socket.id}) auto-joined room ${roomId}`)
        console.log(`📡 Broadcasting player_joined to all clients and monitors`)

        // Start game if room is full
        if (gameRoom.getPlayerCount() === gameConfig.maxPlayers) {
          gameRoom.startGame()
          io.to(gameRoom.getGameState().id).emit('game_started', {
            gameState: gameRoom.getSerializableState()
          })
        }

      } catch (error) {
        console.error('Error in auto-join:', error)
        socket.emit('connection_error', { message: 'Failed to join game automatically' })
        socket.disconnect()
      }
    }
  }, 100) // Small delay to allow monitor_mode event to be received first

  // OPTIONAL: Handle manual join game (for backwards compatibility)
  socket.on('join_game', (data: { playerName?: string }) => {
    // Player đã được auto-join rồi, chỉ cần update tên nếu muốn
    if (data.playerName) {
      for (const [roomId, gameRoom] of gameRooms.entries()) {
        const gameState = gameRoom.getGameState()
        const player = gameState.players.get(socket.id)
        if (player) {
          player.name = data.playerName
          socket.emit('name_updated', { 
            newName: data.playerName,
            gameState: gameRoom.getSerializableState()
          })
          socket.to(roomId).emit('player_updated', {
            player: player,
            gameState: gameRoom.getSerializableState()
          })
          break
        }
      }
    }
  })

  // Handle disconnection
  socket.on('disconnect', () => {
    if (isMonitorMode) {
      console.log(`Monitor disconnected: ${socket.id}`)
    } else {
      console.log(`Player disconnected: ${socket.id}`)
      
      // Find and remove player from their room
      if (playerRoom) {
        const gameRoom = gameRooms.get(playerRoom)
        if (gameRoom) {
          gameRoom.removePlayer(socket.id)
          
          // Notify other players and monitors
          io.to(playerRoom).emit('player_left', {
            playerId: socket.id,
            gameState: gameRoom.getSerializableState()
          })
          
          // Also broadcast to default room for monitors
          io.to('game-room-1').emit('player_left', {
            playerId: socket.id,
            gameState: gameRoom.getSerializableState()
          })
          
          // Broadcast to all sockets (ensures monitors get it)
          io.emit('player_left', {
            playerId: socket.id,
            gameState: gameRoom.getSerializableState()
          })
          
          console.log(`👋 Player left, broadcasting to all clients and monitors`)

          // Remove empty rooms
          if (gameRoom.getPlayerCount() === 0) {
            gameRoom.stopGame()
            gameRooms.delete(playerRoom)
            console.log(`Room ${playerRoom} deleted (empty)`)
          }
        }
      }
    }
  })

  // Handle AI code submission (for future use)
  socket.on('submit_ai', (data: { aiCode: string }) => {
    // TODO: Implement AI code handling
    socket.emit('ai_submitted', { success: true })
  })
})

// Helper functions
function findAvailableRoom(): GameEngine | null {
  for (const gameRoom of gameRooms.values()) {
    if (gameRoom.canAcceptPlayers()) {
      return gameRoom
    }
  }
  return null
}

function createNewRoom(): GameEngine {
  roomCounter++
  const roomId = `room_${roomCounter}`
  
  const gameRoom = new GameEngine(roomId, gameConfig)
  
  // Set up state update callback to broadcast to clients AND monitors
  gameRoom.onStateUpdate((gameState) => {
    const serializedState = gameRoom.getSerializableState()
    io.to(roomId).emit('game_state', serializedState)
    
    // Also broadcast to all monitors (they join rooms automatically)
    // Monitors will receive updates from any room they're monitoring
  })
  
  gameRooms.set(roomId, gameRoom)
  console.log(`Created new room: ${roomId}`)
  
  return gameRoom
}

// Start server
const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`🚀 Auto Tank Game Server running on port ${PORT}`)
  console.log(`📡 Socket.IO ready for connections`)
  console.log(`🎮 Game config:`, gameConfig)
})