// src/core/GameEngine.ts
import { Server } from 'socket.io';
import { GameConfig, GameState, Player, PlayerAction, Bullet } from '../types/GameTypes';

export class GameEngine {
  id: string;
  io: Server;
  config: GameConfig;
  private state: GameState;

  constructor(id: string, config: GameConfig, io: Server) {
    this.id = id;
    this.io = io;
    this.config = config;

    this.state = {
      id,
      status: 'waiting',
      players: new Map<string, Player>(),
      map: this.generateMap(config),
      bullets: [],
      gameTime: 0,
      tickCount: 0,
      maxPlayers: config.maxPlayers,
      gameLoop: null
    };
  }

  // ========== Map generation ==========
  private generateMap(config: GameConfig): number[][] {
    const map = Array.from({ length: config.mapHeight }, () => Array(config.mapWidth).fill(0));

    // Create border walls
    for (let x = 0; x < config.mapWidth; x++) {
      map[0][x] = 1;
      map[config.mapHeight - 1][x] = 1;
    }
    for (let y = 0; y < config.mapHeight; y++) {
      map[y][0] = 1;
      map[y][config.mapWidth - 1] = 1;
    }

    // Add random inner walls but avoid spawn corners
    const attempts = Math.max(0, config.randomWallCount || 0);
    let placed = 0;
    const spawnZones = [
      { x: 1, y: 1 },
      { x: config.mapWidth - 2, y: 1 },
      { x: 1, y: config.mapHeight - 2 },
      { x: config.mapWidth - 2, y: config.mapHeight - 2 }
    ];
    while (placed < attempts) {
      const x = Math.floor(Math.random() * (config.mapWidth - 2)) + 1;
      const y = Math.floor(Math.random() * (config.mapHeight - 2)) + 1;
      const nearSpawn = spawnZones.some(s => Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1);
      if (!nearSpawn && map[y][x] === 0) {
        map[y][x] = 1;
        placed++;
      } else {
        // break condition to avoid potential infinite loop if map full
        if (placed > attempts * 5) break;
      }
    }

    return map;
  }

  // ========== Player management ==========
  public addPlayer(playerData: { id: string; name: string }): Player | null {
    if (this.state.players.size >= this.config.maxPlayers) return null;

    // Find a spawn position (simple fixed spawns)
    const spawnPositions = [
      { x: 1, y: 1 },
      { x: this.config.mapWidth - 2, y: 1 },
      { x: 1, y: this.config.mapHeight - 2 },
      { x: this.config.mapWidth - 2, y: this.config.mapHeight - 2 }
    ];
    const idx = this.state.players.size % spawnPositions.length;
    const spawn = spawnPositions[idx];

    const player: Player = {
      id: playerData.id,
      name: playerData.name,
      x: spawn.x,
      y: spawn.y,
      direction: 0,
      health: 100,
      score: 0,
      color: this.getRandomColor(),
      isAlive: true,
      lastAction: null
    };

    this.state.players.set(player.id, player);

    if (this.state.players.size >= 1 && this.state.status === 'waiting') {
      // start the game when at least 1 player present (you can change policy)
      this.startGame();
    }

    return player;
  }

  public removePlayer(playerId: string): void {
    this.state.players.delete(playerId);
    if (this.getPlayerCount() === 0) {
      this.stopGame();
    }
  }

  public canAcceptPlayers(): boolean {
    return this.state.players.size < this.config.maxPlayers && this.state.status !== 'finished';
  }

  public getPlayerCount(): number {
    return this.state.players.size;
  }

  // ========== Game loop ==========
  public startGame(): void {
    if (this.state.gameLoop) return;
    this.state.status = 'playing';
    const tickInterval = 1000 / this.config.tickRate;
    this.state.gameLoop = setInterval(() => this.update(), tickInterval);
    console.log(`🎮 Game started in ${this.id}`);
  }

  public stopGame(): void {
    if (this.state.gameLoop) {
      clearInterval(this.state.gameLoop);
      this.state.gameLoop = null;
    }
    this.state.status = 'finished';
    console.log(`🛑 Room ${this.id} stopped.`);
  }

  private update(): void {
    this.state.tickCount++;
    this.state.gameTime += 1000 / this.config.tickRate;
    this.updateBullets();
    // broadcast a cleaned serializable state
    this.broadcastState();
  }

  // ========== Bullets logic ==========
  updateBullets(): void {
    const newBullets: Bullet[] = [];

    // Duyệt qua từng viên đạn
    for (let i = 0; i < this.state.bullets.length; i++) {
      const bullet = this.state.bullets[i];
      const b = bullet as any;

      // Tăng bộ đếm phạm vi
      b.rangeCounter = (b.rangeCounter ?? 0) + 1;
      b.maxDistance = b.maxDistance ?? 3; // bay tối đa 3 ô

      // Di chuyển
      switch (bullet.direction) {
        case 0: bullet.y -= 1; break;
        case 1: bullet.x += 1; break;
        case 2: bullet.y += 1; break;
        case 3: bullet.x -= 1; break;
      }

      // ❌ Hết tầm bay
      if (b.rangeCounter >= b.maxDistance) continue;

      // ❌ Ra ngoài bản đồ
      if (
        bullet.x < 0 || bullet.y < 0 ||
        bullet.x >= this.config.mapWidth ||
        bullet.y >= this.config.mapHeight
      ) continue;

      // ❌ Va chạm tường
      if (this.state.map[bullet.y]?.[bullet.x] === 1) continue;

      // 💥 Kiểm tra va chạm đạn - đạn
      let bulletHit = false;
      for (let j = 0; j < this.state.bullets.length; j++) {
        if (i === j) continue;
        const other = this.state.bullets[j];
        if (other.ownerId === bullet.ownerId) continue; // bỏ qua đạn cùng người bắn

        // Nếu 2 viên đạn trùng tọa độ → cả hai biến mất
        if (bullet.x === other.x && bullet.y === other.y) {
          (other as any).destroyedByCollision = true;
          bulletHit = true;
          break;
        }
      }
      if (bulletHit) continue; // bỏ viên này

      // 💥 Kiểm tra va chạm người chơi
      let hitPlayer = false;
      for (const [id, player] of this.state.players.entries()) {
        if (
          player.isAlive &&
          player.x === bullet.x &&
          player.y === bullet.y &&
          player.id !== bullet.ownerId
        ) {
          player.health -= bullet.damage;
          if (player.health <= 0) {
            player.isAlive = false;
            console.log(`💀 ${player.name} bị tiêu diệt!`);
          }
          hitPlayer = true;
          break;
        }
      }

      if (!hitPlayer) newBullets.push(bullet);
    }

    // Loại bỏ các viên đạn bị phá do đạn-đạn
    this.state.bullets = newBullets.filter(b => !(b as any).destroyedByCollision);
  }

  // ========== Player actions ==========
  public handlePlayerAction(playerId: string, action: PlayerAction): void {
    const player = this.state.players.get(playerId);
    if (!player || !player.isAlive) return;
    player.lastAction = action;

    switch (action.type) {
      case 'move':
        if (action.direction !== undefined) this.movePlayer(player, action.direction);
        break;
      case 'rotate':
        if (action.direction !== undefined) player.direction = action.direction;
        break;
      case 'shoot':
        this.spawnBullet(player);
        break;
      case 'idle':
      default:
        break;
    }
  }

  private movePlayer(player: Player, direction: number) {
    let nx = player.x;
    let ny = player.y;
    if (direction === 0) ny--;
    else if (direction === 1) nx++;
    else if (direction === 2) ny++;
    else if (direction === 3) nx--;

    if (nx >= 0 && ny >= 0 && nx < this.config.mapWidth && ny < this.config.mapHeight && this.state.map[ny][nx] !== 1) {
      player.x = nx;
      player.y = ny;
      player.direction = direction;
    }
  }

  private spawnBullet(player: Player) {
    const playerBullets = this.state.bullets.filter(b => b.ownerId === player.id);
    if (playerBullets.length >= 3) return; // Giới hạn 3 viên mỗi người

    const b: Bullet = {
      id: `${player.id}_${Date.now()}`,
      x: player.x,
      y: player.y,
      direction: player.direction,
      speed: this.config.bulletSpeed,
      ownerId: player.id,
      damage: this.config.bulletDamage
    };

    (b as any).rangeCounter = 0;
    (b as any).maxDistance = 3;

    this.state.bullets.push(b);

    console.log(`🔫 ${player.name} bắn đạn hướng ${player.direction}`);
  }

  // ========== Serialization & broadcasting ==========
  // Return a plain, safe-to-serialize object for clients/monitor
  public getSerializableState() {
    return {
      id: this.state.id,
      status: this.state.status,
      players: Array.from(this.state.players.values()).map(p => ({ ...p })), // shallow copy
      map: this.state.map.map(row => [...row]),
      bullets: this.state.bullets.map(b => ({ ...b })),
      gameTime: this.state.gameTime,
      tickCount: this.state.tickCount,
      maxPlayers: this.state.maxPlayers
    };
  }

  // Alias kept for compatibility
  public getGameState() {
    return this.getSerializableState();
  }

  private broadcastState(): void {
    // emit only serializable data (no Map, no gameLoop)
    this.io.to(this.id).emit('game_state', this.getSerializableState());
    // also emit to monitor channel (if desired)
    this.io.to('monitor').emit('game_state', this.getSerializableState());
  }

  // ========== Utils ==========
  private getRandomColor() {
    const colors = ['#ff4d4d', '#4dff4d', '#4d4dff', '#ffff4d'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
