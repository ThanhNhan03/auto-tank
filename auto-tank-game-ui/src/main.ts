import './style.css'
import Phaser from 'phaser'
import { io, Socket } from 'socket.io-client'

// UI Mode - tự động kết nối server
let isViewerMode = true
let isConnectedToServer = false
let monitorSocket: Socket

// Game configuration
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-canvas',
  backgroundColor: '#000000',
  scene: {
    preload: preload,
    create: create,
    update: update
  }
}

// Game variables
let map: number[][] = []
let tanks: Phaser.GameObjects.Rectangle[] = []
let bullets: Phaser.GameObjects.Graphics[] = []
let mapGraphics: Phaser.GameObjects.Graphics
let gameScene: Phaser.Scene | null = null
const TILE_SIZE = 32
const MAP_WIDTH = 25
const MAP_HEIGHT = 19

// Game state from server
let currentGameState: any = null
let playerId: string | null = null

// Tank colors
const TANK_COLORS: { [key: string]: number } = {
  '#ff0000': 0xff0000, // Red
  '#0000ff': 0x0000ff, // Blue
  '#00ff00': 0x00ff00, // Green
  '#ffff00': 0xffff00  // Yellow
}

function preload(this: Phaser.Scene) {
  // No assets needed - using simple shapes
}

function create(this: Phaser.Scene) {
  gameScene = this
  
  // Generate static demo map for display
  generateDemoMap()
  
  // Create graphics object for drawing
  mapGraphics = this.add.graphics()
  
  // Draw the initial map (empty - no players)
  drawMap()
  
  // Tự động kết nối đến server ngay lập tức (delay nhỏ để UI load xong)
  setTimeout(() => {
    connectToServer()
  }, 500)
}

function update(this: Phaser.Scene) {
  // Static demo - no real-time updates
  // Could add animation effects here later
}

function generateDemoMap() {
  map = []
  
  // Initialize empty map
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y] = []
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
        map[y][x] = 1 // Wall border
      } else {
        map[y][x] = 0 // Empty space
      }
    }
  }
  
  // Add demo walls pattern
  const demoWalls = [
    {x: 5, y: 5}, {x: 6, y: 5}, {x: 7, y: 5},
    {x: 10, y: 8}, {x: 11, y: 8}, {x: 12, y: 8},
    {x: 15, y: 12}, {x: 16, y: 12}, {x: 17, y: 12},
    {x: 8, y: 3}, {x: 16, y: 6}, {x: 12, y: 15},
    {x: 3, y: 10}, {x: 20, y: 10}, {x: 18, y: 4}
  ]
  
  demoWalls.forEach(wall => {
    if (wall.x > 0 && wall.x < MAP_WIDTH - 1 && 
        wall.y > 0 && wall.y < MAP_HEIGHT - 1) {
      map[wall.y][wall.x] = 1
    }
  })
}

// Tank rendering functions for when players connect
function renderTank(x: number, y: number, color: number, direction: number, name: string) {
  if (!gameScene) return null
  
  const pixelX = x * TILE_SIZE + TILE_SIZE / 2
  const pixelY = y * TILE_SIZE + TILE_SIZE / 2
  
  // Tank body
  const tank = gameScene.add.rectangle(pixelX, pixelY, TILE_SIZE - 4, TILE_SIZE - 4, color)
  tank.setStrokeStyle(2, 0xffffff)
  
  // Tank barrel (direction indicator)
  const barrel = gameScene.add.rectangle(pixelX, pixelY, 4, 16, 0xffffff)
  
  // Set barrel rotation based on direction
  switch (direction) {
    case 0: // Up
      barrel.y = pixelY - 12
      break
    case 1: // Right
      barrel.setSize(16, 4)
      barrel.x = pixelX + 12
      break
    case 2: // Down
      barrel.y = pixelY + 12
      break
    case 3: // Left
      barrel.setSize(16, 4)
      barrel.x = pixelX - 12
      break
  }
  
  tanks.push(tank)
  
  // Store tank data
  tank.setData('name', name)
  tank.setData('gridX', x)
  tank.setData('gridY', y)
  tank.setData('direction', direction)
  tank.setData('barrel', barrel)
  
  return tank
}

function clearAllTanks() {
  tanks.forEach(tank => {
    const barrel = tank.getData('barrel')
    if (barrel) barrel.destroy()
    tank.destroy()
  })
  tanks = []
}

function drawMap() {
  mapGraphics.clear()
  
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const pixelX = x * TILE_SIZE
      const pixelY = y * TILE_SIZE
      
      if (map[y][x] === 1) {
        // Wall - brown color
        mapGraphics.fillStyle(0x8B4513)
        mapGraphics.fillRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE)
        
        // Wall border
        mapGraphics.lineStyle(1, 0x654321)
        mapGraphics.strokeRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE)
      } else {
        // Empty space - dark gray
        mapGraphics.fillStyle(0x333333)
        mapGraphics.fillRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE)
        
        // Grid lines
        mapGraphics.lineStyle(1, 0x555555)
        mapGraphics.strokeRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE)
      }
    }
  }
}

// Initialize the game
function initGame() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  
  app.innerHTML = `
    <div class="game-container">
      <h1 class="game-title">Auto Tank Battle - Live Monitor</h1>
      <div class="status-bar">
        <div class="status-item">
          <span class="status-label">Status:</span>
          <span class="status-value" id="connection-status">Connecting...</span>
        </div>
      </div>
      <div id="game-canvas"></div>
      <div class="game-info">
        <div class="info-section">
          <h3>Players</h3>
          <div id="players-list">
            <p class="no-players">🔗 Connecting to server...</p>
          </div>
        </div>
        <div class="info-section">
          <h3>Map Info</h3>
          <p>Size: ${MAP_WIDTH}x${MAP_HEIGHT}</p>
          <p>Mode: Live Monitor</p>
          <p>Purpose: Real-time Display</p>
        </div>
        <div class="info-section">
          <h3>Instructions</h3>
          <p>• Monitoring live game state</p>
          <p>• Players spawn automatically</p>
          <p>• Up to 4 players per room</p>
          <p>• Auto-refresh every update</p>
        </div>
      </div>
    </div>
  `
  
  // Start Phaser game
  new Phaser.Game(config)
}

function connectToServer() {
  const statusEl = document.getElementById('connection-status')!
  const playersListEl = document.getElementById('players-list')!
  
  try {
    statusEl.textContent = 'Connecting...'
    
    // Kết nối Socket.IO trực tiếp
    monitorSocket = io('http://localhost:8080')
    
    monitorSocket.on('connect', () => {
      statusEl.textContent = 'Connected - Live Monitoring'
      isConnectedToServer = true
      console.log('🔍 Connected to server for live monitoring')
      
      // Send special monitoring flag (doesn't create player)
      setTimeout(() => {
        monitorSocket.emit('monitor_mode', { isMonitor: true })
      }, 100) // Small delay to ensure connection is stable
    })
    
    // Listen for monitor connection confirmation
    monitorSocket.on('monitor_connected', (data) => {
      console.log('🔍 Monitor connected:', data.message)
      if (data.gameState && data.gameState.players) {
        console.log('📊 Initial players:', data.gameState.players.length)
        updatePlayersDisplay(data.gameState.players)
        updateMapFromServer(data.gameState.map)
      } else {
        // No active game to monitor
        playersListEl.innerHTML = `
          <p class="no-players">🔍 Monitoring active</p>
          <p class="no-players">No active games found</p>
          <p class="no-players">Start clients to see players</p>
        `
      }
    })
    
    monitorSocket.on('game_state', (gameState) => {
      console.log('🎮 Game state update received')
      updatePlayersDisplay(gameState.players)
      if (gameState.map) {
        updateMapFromServer(gameState.map)
      }
    })
    
    monitorSocket.on('player_joined', (data) => {
      console.log('🎮 Player joined event received:', data.player ? data.player.name : 'unknown')
      updatePlayersDisplay(data.gameState.players)
      if (data.gameState.map) {
        updateMapFromServer(data.gameState.map)
      }
    })
    
    monitorSocket.on('player_left', (data) => {
      console.log('👋 Player left event received')
      updatePlayersDisplay(data.gameState.players)
      if (data.gameState.map) {
        updateMapFromServer(data.gameState.map)
      }
    })
    
    // Debug: Listen to ALL events
    monitorSocket.onAny((eventName, ...args) => {
      console.log(`📡 Socket event received: ${eventName}`, args)
    })
    
    monitorSocket.on('connect_error', () => {
      statusEl.textContent = 'Connection Failed - Retrying...'
      console.error('Failed to connect to server')
      
      // Retry after 3 seconds
      setTimeout(() => {
        console.log('Retrying connection...')
        connectToServer()
      }, 3000)
    })
    
    monitorSocket.on('disconnect', () => {
      statusEl.textContent = 'Disconnected - Reconnecting...'
      isConnectedToServer = false
      console.log('📱 Disconnected from server, will auto-reconnect')
    })
    
  } catch (error) {
    statusEl.textContent = 'Connection Failed - Retrying...'
    console.error('Failed to connect:', error)
    
    // Retry after 3 seconds
    setTimeout(() => {
      console.log('Retrying connection...')
      connectToServer()
    }, 3000)
  }
}

function updatePlayersDisplay(players: any[]) {
  const playersListEl = document.getElementById('players-list')!
  
  console.log('🎮 Updating players display:', players ? players.length : 0, 'players')
  
  if (!players || players.length === 0) {
    console.log('📭 No players to display')
    playersListEl.innerHTML = `
      <p class="no-players">🎯 No players connected</p>
      <p class="no-players">Waiting for connections...</p>
    `
    clearAllTanks()
    return
  }
  
  console.log('👥 Players data:', players.map(p => `${p.name} at (${p.x},${p.y})`))
  
  // Update players list
  playersListEl.innerHTML = players.map((player) => `
    <div class="player-item">
      <div class="player-color" style="background-color: ${player.color}"></div>
      <span>${player.name}</span>
      <span class="player-stats">♥${player.health} ⭐${player.score}</span>
    </div>
  `).join('')
  
  // Update tanks on map
  clearAllTanks()
  players.forEach(player => {
    if (player.isAlive) {
      const colorHex = player.color.replace('#', '0x')
      const color = parseInt(colorHex, 16)
      renderTank(player.x, player.y, color, player.direction, player.name)
    }
  })
}

function updateMapFromServer(serverMap: number[][]) {
  if (!serverMap) return
  
  map = serverMap
  drawMap()
}

// Start the game
initGame()
