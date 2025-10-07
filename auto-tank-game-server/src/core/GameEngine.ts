import { GameState, Player, Bullet, GameConfig } from '../types/GameTypes'

export class GameEngine {
  private gameState: GameState
  private config: GameConfig
  private gameLoop: ReturnType<typeof setInterval> | null = null
  private onStateUpdateCallback: ((state: GameState) => void) | null = null

  constructor(gameId: string, config: GameConfig) {
    this.config = config
    this.gameState = {
      id: gameId,
      status: 'waiting',
      players: new Map(),
      map: this.generateMap(),
      bullets: [],
      gameTime: 0,
      tickCount: 0,
      maxPlayers: config.maxPlayers
    }
  }

  // Generate map matrix (same logic as client for consistency)
  private generateMap(): number[][] {
    const map: number[][] = []
    
    // Initialize empty map
    for (let y = 0; y < this.config.mapHeight; y++) {
      map[y] = []
      for (let x = 0; x < this.config.mapWidth; x++) {
        if (x === 0 || x === this.config.mapWidth - 1 || y === 0 || y === this.config.mapHeight - 1) {
          map[y][x] = 1 // Wall border
        } else {
          map[y][x] = 0 // Empty space
        }
      }
    }
    
    // Add some random walls (consistent with client)
    const tankSpawnPositions = [
      { x: 1, y: 1 },
      { x: this.config.mapWidth - 2, y: 1 },
      { x: 1, y: this.config.mapHeight - 2 },
      { x: this.config.mapWidth - 2, y: this.config.mapHeight - 2 }
    ]

    for (let i = 0; i < 30; i++) {
      const x = Math.floor(Math.random() * (this.config.mapWidth - 4)) + 2
      const y = Math.floor(Math.random() * (this.config.mapHeight - 4)) + 2
      
      // Don't place walls on tank spawn positions
      const isTankSpawn = tankSpawnPositions.some(spawn => 
        Math.abs(spawn.x - x) <= 1 && Math.abs(spawn.y - y) <= 1
      )
      
      if (!isTankSpawn) {
        map[y][x] = 1
      }
    }

    return map
  }

  // Start the game loop
  startGame(): void {
    if (this.gameState.status !== 'waiting') return
    
    this.gameState.status = 'playing'
    console.log(`Game ${this.gameState.id} started with ${this.gameState.players.size} players`)
    
    const tickInterval = 1000 / this.config.tickRate
    this.gameLoop = setInterval(() => {
      this.tick()
    }, tickInterval)
  }

  // Main game tick
  private tick(): void {
    this.gameState.tickCount++
    this.gameState.gameTime += 1000 / this.config.tickRate

    // Update bullets (simple movement for now)
    this.updateBullets()

    // Check win condition
    this.checkWinCondition()

    // Notify about state update
    if (this.onStateUpdateCallback) {
      this.onStateUpdateCallback(this.gameState)
    }
  }

  private updateBullets(): void {
    this.gameState.bullets = this.gameState.bullets.filter(bullet => {
      // Move bullet
      const dx = this.getDirectionX(bullet.direction) * bullet.speed
      const dy = this.getDirectionY(bullet.direction) * bullet.speed
      
      bullet.x += dx
      bullet.y += dy

      // Check bounds
      const gridX = Math.floor(bullet.x)
      const gridY = Math.floor(bullet.y)

      if (gridX < 0 || gridX >= this.config.mapWidth || 
          gridY < 0 || gridY >= this.config.mapHeight) {
        return false // Remove bullet
      }

      // Check wall collision
      if (this.gameState.map[gridY] && this.gameState.map[gridY][gridX] === 1) {
        return false // Remove bullet
      }

      return true // Keep bullet
    })
  }

  private checkWinCondition(): void {
    const alivePlayers = Array.from(this.gameState.players.values()).filter(p => p.isAlive)
    
    if (alivePlayers.length <= 1 && this.gameState.players.size > 1) {
      this.gameState.status = 'finished'
      if (this.gameLoop) {
        clearInterval(this.gameLoop)
        this.gameLoop = null
      }
      console.log(`Game ${this.gameState.id} finished`)
    }
  }

  // Player management
  addPlayer(playerData: { id: string, name: string }): Player | null {
    if (this.gameState.players.size >= this.config.maxPlayers) {
      return null // Room full
    }

    const spawnPositions = [
      { x: 1, y: 1, color: '#ff0000', direction: 0 },
      { x: this.config.mapWidth - 2, y: 1, color: '#0000ff', direction: 2 },
      { x: 1, y: this.config.mapHeight - 2, color: '#00ff00', direction: 0 },
      { x: this.config.mapWidth - 2, y: this.config.mapHeight - 2, color: '#ffff00', direction: 2 }
    ]

    const playerIndex = this.gameState.players.size
    const spawn = spawnPositions[playerIndex]

    const player: Player = {
      id: playerData.id,
      name: playerData.name,
      x: spawn.x,
      y: spawn.y,
      direction: spawn.direction,
      health: 100,
      score: 0,
      color: spawn.color,
      isAlive: true,
      lastAction: null
    }

    this.gameState.players.set(playerData.id, player)
    console.log(`Player ${playerData.name} joined game ${this.gameState.id}`)

    return player
  }

  removePlayer(playerId: string): void {
    if (this.gameState.players.delete(playerId)) {
      console.log(`Player ${playerId} left game ${this.gameState.id}`)
      
      // If no players left, stop the game
      if (this.gameState.players.size === 0) {
        this.stopGame()
      }
    }
  }

  stopGame(): void {
    if (this.gameLoop) {
      clearInterval(this.gameLoop)
      this.gameLoop = null
    }
    this.gameState.status = 'finished'
    console.log(`Game ${this.gameState.id} stopped`)
  }

  // Helper methods
  private getDirectionX(direction: number): number {
    return [0, 1, 0, -1][direction] || 0
  }

  private getDirectionY(direction: number): number {
    return [-1, 0, 1, 0][direction] || 0
  }

  // Getters
  getGameState(): GameState {
    return this.gameState
  }

  getPlayerCount(): number {
    return this.gameState.players.size
  }

  canAcceptPlayers(): boolean {
    return this.gameState.status === 'waiting' && 
           this.gameState.players.size < this.config.maxPlayers
  }

  // Set callback for state updates
  onStateUpdate(callback: (state: GameState) => void): void {
    this.onStateUpdateCallback = callback
  }

  // Convert GameState to serializable format for client
  getSerializableState(): any {
    const playersArray = Array.from(this.gameState.players.values())
    
    return {
      id: this.gameState.id,
      status: this.gameState.status,
      players: playersArray,
      map: this.gameState.map,
      mapWithPlayers: this.getMapWithPlayers(), // Ma trận có players
      bullets: this.gameState.bullets,
      gameTime: this.gameState.gameTime,
      tickCount: this.gameState.tickCount,
      maxPlayers: this.gameState.maxPlayers
    }
  }

  // Tạo ma trận kết hợp map + players
  private getMapWithPlayers(): any[][] {
    // Copy map gốc
    const mapWithPlayers = this.gameState.map.map(row => [...row])
    
    // Thêm players vào map
    const playersArray = Array.from(this.gameState.players.values())
    playersArray.forEach((player, index) => {
      if (player.isAlive && 
          player.x >= 0 && player.x < this.config.mapWidth &&
          player.y >= 0 && player.y < this.config.mapHeight) {
        
        // Sử dụng số 2, 3, 4, 5 để represent players (P1, P2, P3, P4)
        mapWithPlayers[player.y][player.x] = 2 + index
      }
    })
    
    return mapWithPlayers
  }
}