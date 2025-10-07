export interface GameState {
  id: string
  status: 'waiting' | 'playing' | 'finished'
  players: Map<string, Player>
  map: number[][]
  bullets: Bullet[]
  gameTime: number
  tickCount: number
  maxPlayers: number
}

export interface Player {
  id: string
  name: string
  x: number
  y: number
  direction: number // 0=up, 1=right, 2=down, 3=left
  health: number
  score: number
  color: string
  isAlive: boolean
  lastAction: PlayerAction | null
}

export interface Bullet {
  id: string
  x: number
  y: number
  direction: number
  speed: number
  ownerId: string
  damage: number
}

export interface PlayerAction {
  type: 'move' | 'shoot' | 'rotate' | 'idle'
  direction?: number
  timestamp: number
}

export interface GameConfig {
  mapWidth: number
  mapHeight: number
  tileSize: number
  maxPlayers: number
  tickRate: number
  bulletSpeed: number
  bulletDamage: number
}

// Network message types
export interface ServerMessage {
  type: 'game_state' | 'player_joined' | 'player_left' | 'game_started' | 'game_ended'
  data: any
  timestamp: number
}

export interface ClientMessage {
  type: 'join_game' | 'submit_ai' | 'leave_game'
  data: any
  timestamp: number
}