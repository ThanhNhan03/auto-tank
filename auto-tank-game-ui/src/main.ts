// src/main.ts (Phaser client) - improved bullet interpolation & UI
import './style.css'
import Phaser from 'phaser'
import { io, Socket } from 'socket.io-client'

// ===================== CONFIG =====================
const TILE_SIZE = 32
const MAP_WIDTH = 25
const MAP_HEIGHT = 19

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: MAP_WIDTH * TILE_SIZE,
  height: MAP_HEIGHT * TILE_SIZE,
  parent: 'game-canvas',
  backgroundColor: '#0d0d0d',
  scene: { preload, create, update }
}

// ===================== GLOBALS =====================
let map: number[][] = []
const tanks = new Map<string, { body: Phaser.GameObjects.Rectangle; barrel: Phaser.GameObjects.Rectangle; lastHealth?: number }>()
let bullets: Array<{
  id: string
  ownerId?: string
  prevGrid: { x: number; y: number }
  targetGrid: { x: number; y: number }
  sprite: Phaser.GameObjects.Rectangle
  progress: number
  alive: boolean
  createdAt: number
}> = []
let mapGraphics: Phaser.GameObjects.Graphics
let gameScene: Phaser.Scene | null = null
let monitorSocket: Socket
let currentGameState: any = null
let lastPlayersSnapshot: any[] = []
let tickDurationMs = 100 // fallback; will adjust if server provides tickRate

// ===================== PHASER LIFECYCLE =====================
function preload(this: Phaser.Scene) {
  // optionally load assets
}

function create(this: Phaser.Scene) {
  gameScene = this
  generateEmptyMap()
  mapGraphics = this.add.graphics()
  drawMap()

  // UI: quick legend
  createLegend(this)

  // connect to server shortly after scene ready
  setTimeout(connectToServer, 300)
}

function update(this: Phaser.Scene, time: number, delta: number) {
  // delta is ms since last frame
  updateBullets(delta)
}

// ===================== MAP =====================
function generateEmptyMap() {
  map = []
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y] = []
    for (let x = 0; x < MAP_WIDTH; x++) {
      map[y][x] = x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1 ? 1 : 0
    }
  }
}

function drawMap() {
  if (!gameScene || !mapGraphics) return
  mapGraphics.clear()
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const color = map[y][x] === 1 ? 0x8b4513 : 0x1f1f1f
      mapGraphics.fillStyle(color)
      mapGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      mapGraphics.lineStyle(1, 0x222222)
      mapGraphics.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
    }
  }
}

// ===================== SOCKET =====================
function connectToServer() {
  const statusEl = document.getElementById('connection-status')!
  const playersListEl = document.getElementById('players-list')!

  monitorSocket = io('http://localhost:8080', { transports: ['websocket'] })

  monitorSocket.on('connect', () => {
    statusEl.textContent = '✅ Connected'
    monitorSocket.emit('monitor_mode', { isMonitor: true })
  })

  monitorSocket.on('disconnect', () => {
    statusEl.textContent = '❌ Disconnected - Reconnecting...'
  })

  // Main game update from server
  monitorSocket.on('game_state', (gs: any) => {
    currentGameState = gs

    // If server provides tickRate in config portion, compute tickDuration
    if (gs.tickRate) tickDurationMs = Math.round(1000 / gs.tickRate)

    // update map and players UI
    if (gs.map) updateMapFromServer(gs.map)
    if (gs.players) updatePlayersDisplay(gs.players)

    // sync bullets with interpolation
    updateBulletsFromServer(gs.bullets || [])

    // detect health changes to show hit effects
    detectPlayerHealthChanges(gs.players || [])
    lastPlayersSnapshot = gs.players ? gs.players.map((p: any) => ({ id: p.id, health: p.health })) : []
  })

  monitorSocket.on('connect_error', () => {
    statusEl.textContent = '⚠️ Connection Failed - Retry...'
  })
}

// ===================== PLAYERS / TANKS =====================
function renderTank(player: any) {
  if (!gameScene) return
  const color = parseInt((player.color || '#ffffff').replace('#', '0x'), 16)
  const x = player.x * TILE_SIZE + TILE_SIZE / 2
  const y = player.y * TILE_SIZE + TILE_SIZE / 2

  const body = gameScene.add.rectangle(x, y, TILE_SIZE - 6, TILE_SIZE - 6, color)
  body.setStrokeStyle(2, 0x000000)
  const barrel = gameScene.add.rectangle(x, y, 4, 16, 0x000000)
  setBarrelDirection(barrel, player.direction, x, y)

  tanks.set(player.id, { body, barrel, lastHealth: player.health })
}

function updateTank(player: any) {
  if (!gameScene) return
  const tank = tanks.get(player.id)
  const x = player.x * TILE_SIZE + TILE_SIZE / 2
  const y = player.y * TILE_SIZE + TILE_SIZE / 2
  if (!tank) {
    renderTank(player)
    return
  }
  // smooth move: lerp towards target position (simple smoothing)
  tank.body.x = Phaser.Math.Linear(tank.body.x, x, 0.5)
  tank.body.y = Phaser.Math.Linear(tank.body.y, y, 0.5)
  tank.barrel.x = tank.body.x
  tank.barrel.y = tank.body.y
  setBarrelDirection(tank.barrel, player.direction, tank.barrel.x, tank.barrel.y)

  // health bar / flash if hit
  if (tank.lastHealth !== undefined && player.health < tank.lastHealth) {
    flashSprite(tank.body)
  }
  tank.lastHealth = player.health
}

function setBarrelDirection(barrel: Phaser.GameObjects.Rectangle, direction: number, x: number, y: number) {
  barrel.rotation = 0
  barrel.x = x; barrel.y = y
  switch (direction) {
    case 0: barrel.y = y - 12; barrel.rotation = 0; break // up
    case 1: barrel.x = x + 12; barrel.rotation = Math.PI / 2; break // right
    case 2: barrel.y = y + 12; barrel.rotation = Math.PI; break // down
    case 3: barrel.x = x - 12; barrel.rotation = -Math.PI / 2; break // left
  }
}

function clearAllTanks() {
  tanks.forEach(({ body, barrel }) => { body.destroy(); barrel.destroy() })
  tanks.clear()
}

function updatePlayersDisplay(players: any[]) {
  const playersListEl = document.getElementById('players-list')!
  if (!players || players.length === 0) {
    playersListEl.innerHTML = `<p class="muted">🎯 No players</p>`
    clearAllTanks()
    return
  }

  // update sidebar
  playersListEl.innerHTML = players.map(p =>
    `<div class="player-item"><div class="color" style="background:${p.color}"></div><div class="meta">${escapeHtml(p.name || p.id)} <small>♥${p.health}</small></div></div>`
  ).join('')

  // remove tanks not present
  const ids = new Set(players.map(p => p.id))
  for (const id of Array.from(tanks.keys())) {
    if (!ids.has(id)) {
      const t = tanks.get(id)
      if (t) { t.body.destroy(); t.barrel.destroy() }
      tanks.delete(id)
    }
  }

  // update or create
  players.forEach(p => updateTank(p))
}

// ===================== BULLETS - interpolation + lifecycle =====================

// serverBullets: array of { id, x, y, direction, speed, ownerId }
function updateBulletsFromServer(serverBullets: any[]) {
  if (!gameScene) return

  // Map server bullets by id for quick lookup
  const serverById = new Map<string, any>()
  for (const sb of serverBullets) serverById.set(sb.id, sb)

  // 1) Mark bullets that disappeared on server -> trigger explosion/fade on client
  const toRemoveClientIds = new Set<string>()
  for (const local of bullets) {
    if (!serverById.has(local.id)) {
      // disappeared (hit something or expired) -> animate explosion and schedule removal
      explodeAt(local.sprite.x, local.sprite.y)
      local.alive = false
      toRemoveClientIds.add(local.id)
    }
  }

  // remove disappeared after explosion animation (immediately here for simplicity)
  bullets = bullets.filter(b => {
    if (toRemoveClientIds.has(b.id)) {
      b.sprite.destroy()
      return false
    }
    return true
  })

  // 2) Update existing bullets or create new ones
  for (const sb of serverBullets) {
    const local = bullets.find(b => b.id === sb.id)
    const targetGrid = { x: Math.floor(sb.x), y: Math.floor(sb.y) } // server grid coords
    if (!local) {
      // create visual bullet at grid position (start with same prev/target)
      const px = targetGrid.x * TILE_SIZE + TILE_SIZE / 2
      const py = targetGrid.y * TILE_SIZE + TILE_SIZE / 2
      const sprite = gameScene.add.rectangle(px, py, 6, 6, 0xffdd55)
      sprite.setDepth(5)
      bullets.push({
        id: sb.id,
        ownerId: sb.ownerId,
        prevGrid: { x: targetGrid.x, y: targetGrid.y },
        targetGrid,
        sprite,
        progress: 0,
        alive: true,
        createdAt: Date.now()
      })
    } else {
      // shift prev <- current position; set new target; reset progress
      local.prevGrid = { x: Math.floor(local.targetGrid.x), y: Math.floor(local.targetGrid.y) }
      local.targetGrid = { x: targetGrid.x, y: targetGrid.y }
      local.progress = 0
      local.ownerId = sb.ownerId
    }
  }
}

// Called each frame to animate bullets
function updateBullets(deltaMs: number) {
  if (!gameScene) return
  if (!bullets.length) return

  // progress increment = delta / tickDurationMs; tickDurationMs is approx server tick interval
  const step = tickDurationMs > 0 ? deltaMs / (tickDurationMs || 100) : deltaMs / 100

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    if (!b.alive) {
      // destroy if still present
      if (b.sprite && b.sprite.active) {
        b.sprite.destroy()
      }
      bullets.splice(i, 1)
      continue
    }

    b.progress = Math.min(1, b.progress + step)
    const pxPrev = b.prevGrid.x * TILE_SIZE + TILE_SIZE / 2
    const pyPrev = b.prevGrid.y * TILE_SIZE + TILE_SIZE / 2
    const pxTarget = b.targetGrid.x * TILE_SIZE + TILE_SIZE / 2
    const pyTarget = b.targetGrid.y * TILE_SIZE + TILE_SIZE / 2

    // Linear interpolate
    b.sprite.x = Phaser.Math.Linear(pxPrev, pxTarget, b.progress)
    b.sprite.y = Phaser.Math.Linear(pyPrev, pyTarget, b.progress)

    // if fully reached target and server no longer contains this bullet soon, we will remove it via updateBulletsFromServer
    // small safety: if bullet stuck beyond some time, remove it
    if (Date.now() - b.createdAt > 5000) {
      b.sprite.destroy()
      bullets.splice(i, 1)
    }
  }
}

// handy explosion visual
function explodeAt(px: number, py: number) {
  if (!gameScene) return
  const s = gameScene.add.circle(px, py, 6, 0xff9933, 0.9)
  s.setDepth(10)
  gameScene.tweens.add({
    targets: s,
    alpha: 0,
    scale: 2,
    duration: 250,
    onComplete: () => s.destroy()
  })
}

// ===================== HELPERS =====================
function updateMapFromServer(serverMap: number[][] | undefined) {
  if (!serverMap) return
  map = serverMap.map(r => [...r])
  drawMap()
}

function flashSprite(sprite: Phaser.GameObjects.Rectangle) {
  if (!gameScene) return
  gameScene.tweens.killTweensOf(sprite)
  sprite.setFillStyle(0xffffff)
  gameScene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 250,
    onComplete: () => {
      // restore color (we don't have original easily, so minor fade)
      sprite.setFillStyle(0xaaaaaa)
    }
  })
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' } as any)[c])
}

function createLegend(scene: Phaser.Scene) {
  const style = { font: '12px Arial', color: '#ffffff' }
  scene.add.text(8, MAP_HEIGHT * TILE_SIZE - 60, 'Legend: Yellow = bullet  • Tanks = colored squares', style).setDepth(20)
}

// detect changes in health and show hit effect
function detectPlayerHealthChanges(newPlayers: any[]) {
  if (!newPlayers) return
  for (const p of newPlayers) {
    const t = tanks.get(p.id)
    if (t && t.lastHealth !== undefined && p.health < t.lastHealth) {
      // show hit flash + small particle
      flashSprite(t.body)
      // optional: small blood particles
      spawnHitParticles(t.body.x, t.body.y)
    }
    // ensure tank present and lastHealth updated (updateTank will set it too)
    if (!t) renderTank(p)
  }
}

function spawnHitParticles(px: number, py: number) {
  if (!gameScene) return
  for (let i = 0; i < 6; i++) {
    const c = gameScene.add.circle(px, py, 2, 0xff5555, 1).setDepth(15)
    const vx = (Math.random() - 0.5) * 80
    const vy = (Math.random() - 0.5) * 80
    gameScene.tweens.add({
      targets: c,
      x: px + vx,
      y: py + vy,
      alpha: 0,
      duration: 300 + Math.random() * 200,
      onComplete: () => c.destroy()
    })
  }
}

// ===================== UI INIT =====================
function initGameUI() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <div class="main-layout">
      <header class="header">
        <h1>⚙️ Auto Tank Battle — Live Monitor</h1>
        <div id="connection-status" class="status">⏳ Connecting...</div>
      </header>
      <div class="content">
        <div id="game-canvas" class="game-area"></div>
        <aside class="sidebar">
          <h2>Players</h2>
          <div id="players-list" class="players-list"><p class="muted">Waiting...</p></div>
          <hr />
          <div><small>Tip: server controls damage & collisions — client only visualizes.</small></div>
        </aside>
      </div>
    </div>
  `
  document.body.style.margin = '0'
  new Phaser.Game(config)
}

initGameUI()
