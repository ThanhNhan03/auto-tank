// auto-tank-game-server/src/types/GameTypes.ts

export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  direction: number;
  health: number;
  score: number;
  color: string;
  isAlive: boolean;
  lastAction: { type: string; direction?: number; timestamp: number } | null;
  aiCode?: string; // Thêm nếu bot sử dụng AI
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  direction: number;
  speed: number;
  ownerId: string;
  damage: number;
}

export interface GameState {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  players: Map<string, Player>;
  map: number[][];
  bullets: Bullet[];
  gameTime: number;
  tickCount: number;
  maxPlayers: number;
  gameLoop: NodeJS.Timeout | null;
  mapWithPlayers?: number[][];
}

export interface PlayerAction {
  type: 'move' | 'rotate' | 'shoot' | 'idle';
  direction?: number; // Chỉ áp dụng cho move và rotate
  timestamp: number; // Thêm timestamp để khớp với lastAction
}

export interface ClientMessage {
  action: PlayerAction;
}

export interface ServerMessage {
  type: string;
  data: any;
  timestamp: number;
}

export interface GameConfig {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  maxPlayers: number;
  tickRate: number;
  bulletSpeed: number;
  bulletDamage: number;
  randomWallCount: number;
}