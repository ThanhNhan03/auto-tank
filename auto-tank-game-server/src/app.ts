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

  // Handle manual join game - Client phải gửi yêu cầu join
  socket.on('join_game', (data: { playerName?: string }) => {
    if (isMonitorMode) {
      socket.emit('join_error', { message: 'Monitors cannot join as players' })
      return
    }

    // Check if player already joined
    if (playerRoom) {
      socket.emit('join_error', { message: 'You are already in a game' })
      return
    }

    try {
      // Tạo tên player - sử dụng tên từ client hoặc tạo tự động
      const playerName = data.playerName || `Player_${socket.id.substring(0, 6)}`
      
      // Find available room or create new one
      let gameRoom = findAvailableRoom()
      if (!gameRoom) {
        gameRoom = createNewRoom()
      }

      // Add player to room
      const player = gameRoom.addPlayer({ id: socket.id, name: playerName })
      if (!player) {
        socket.emit('join_error', { message: 'All rooms are full' })
        return
      }

      // Join socket room
      playerRoom = gameRoom.getGameState().id
      socket.join(playerRoom)
      
      // Send welcome message với game state
      socket.emit('joined_game', {
        success: true,
        playerId: socket.id,
        roomId: gameRoom.getGameState().id,
        playerData: player,
        gameState: gameRoom.getSerializableState(),
        message: `Welcome ${playerName}! You joined the game.`
      })

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

      console.log(`🎮 Player ${playerName} (${socket.id}) joined room ${roomId}`)
      console.log(`📡 Broadcasting player_joined to all clients and monitors`)

      // Start game if room is full
      if (gameRoom.getPlayerCount() === gameConfig.maxPlayers) {
        gameRoom.startGame()
        io.to(gameRoom.getGameState().id).emit('game_started', {
          gameState: gameRoom.getSerializableState()
        })
      }

    } catch (error) {
      console.error('Error in join_game:', error)
      socket.emit('join_error', { message: 'Failed to join game' })
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

  // Handle player actions (move, shoot, rotate)
  socket.on('player_action', (data: { type: string, direction?: number }) => {
    if (isMonitorMode || !playerRoom) return
    
    const gameRoom = gameRooms.get(playerRoom)
    if (!gameRoom) return
    
    const gameState = gameRoom.getGameState()
    const player = gameState.players.get(socket.id)
    
    if (!player || !player.isAlive) return
    
    // Xử lý action
    if (data.type === 'move' && data.direction !== undefined) {
      // Di chuyển player
      const newPos = getNewPosition(player.x, player.y, data.direction)
      
      // Kiểm tra có thể di chuyển không
      if (canMove(gameState.map, newPos.x, newPos.y, gameConfig)) {
        player.x = newPos.x
        player.y = newPos.y
        player.direction = data.direction
        player.lastAction = { type: 'move', direction: data.direction, timestamp: Date.now() }
        
        console.log(`🚶 Player ${player.name} moved to (${newPos.x}, ${newPos.y})`)
      }
    } else if (data.type === 'rotate' && data.direction !== undefined) {
      // Xoay player
      player.direction = data.direction
      player.lastAction = { type: 'rotate', direction: data.direction, timestamp: Date.now() }
      
      console.log(`🔄 Player ${player.name} rotated to direction ${data.direction}`)
    } else if (data.type === 'shoot') {
      // Bắn đạn (TODO: implement later)
      console.log(`💥 Player ${player.name} attempted to shoot`)
    }
    
    // Broadcast state update
    io.to(playerRoom).emit('game_state', gameRoom.getSerializableState())
    io.to('game-room-1').emit('game_state', gameRoom.getSerializableState())
  })

  // Handle AI code submission (for future use)
  socket.on('submit_ai', (data: { aiCode: string }) => {
    // TODO: Implement AI code handling
    socket.emit('ai_submitted', { success: true })
  })
})

// Helper function for movement
function getNewPosition(x: number, y: number, direction: number): { x: number, y: number } {
  switch (direction) {
    case 0: return { x, y: y - 1 } // UP
    case 1: return { x: x + 1, y } // RIGHT
    case 2: return { x, y: y + 1 } // DOWN
    case 3: return { x: x - 1, y } // LEFT
    default: return { x, y }
  }
}

function canMove(map: number[][], x: number, y: number, config: GameConfig): boolean {
  // Kiểm tra bounds
  if (x < 0 || x >= config.mapWidth || y < 0 || y >= config.mapHeight) {
    return false
  }
  
  // Kiểm tra tường
  if (map[y][x] === 1) {
    return false
  }
  
  return true
}

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