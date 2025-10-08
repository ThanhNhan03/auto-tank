# Auto Tank Game - Multiplayer Tank Battle

Multiplayer tank battle game với real-time Socket.IO communication. Server hỗ trợ tối đa 4 players mỗi room, với AI bot và monitoring system.

---

## 📦 Project Structure

```
auto-tank/
├── auto-tank-game-server/    # Game server (Node.js + TypeScript + Socket.IO)
├── auto-tank-game-client/    # Bot clients (Node.js + Socket.IO)
├── auto-tank-game-ui/         # Web UI Monitor (Vite + Phaser + TypeScript)
└── README.md                  # Documentation
```

---

## 🚀 Quick Start

### 1. Start Server
```bash
cd auto-tank-game-server
npm install
npm start
```
Server chạy trên: `http://localhost:8080`

### 2. Run Bot Client
```bash
cd auto-tank-game-client
npm install
node simple-bot.js
```

### 3. Open UI Monitor (Optional)
```bash
cd auto-tank-game-ui
npm install
npm run dev
```
UI chạy trên: `http://localhost:5173`

---

## 🎮 Game Configuration

```typescript
{
  mapWidth: 25,
  mapHeight: 19,
  tileSize: 32,
  maxPlayers: 4,
  tickRate: 10,        // 10 FPS
  bulletSpeed: 1,
  bulletDamage: 25
}
```

- **Map**: 25x19 grid với tường (walls) và không gian trống (empty space)
- **Players**: Tối đa 4 players/room, spawn ở 4 góc map
- **Directions**: 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT

---

## 📡 Socket.IO API Documentation

### Connection URL
```
ws://localhost:8080
```

---

## 🔵 Client → Server Events (Gửi lên server)

### 1. `monitor_mode` (Optional - Để monitor không tham gia game)
**Description:** Request monitor mode để quan sát game mà không tham gia.

**Request:**
```json
{
  "isMonitor": true
}
```

**Response:** Server sẽ emit `monitor_connected`

**Example:**
```javascript
socket.emit('monitor_mode', { isMonitor: true })
```

---

### 2. `join_game` ⭐ (Required - Để tham gia game)
**Description:** Gửi request tham gia game. Bắt buộc để trở thành player.

**Request:**
```json
{
  "playerName": "Bot_abc123"  // Optional, server sẽ tự tạo nếu không có
}
```

**Response:** Server sẽ emit `joined_game` hoặc `join_error`

**Example:**
```javascript
socket.emit('join_game', { 
  playerName: 'MyBot' 
})
```

---

### 3. `player_action` ⭐ (Gameplay - Di chuyển/Xoay/Bắn)
**Description:** Gửi hành động của player (move, rotate, shoot).

**Request cho MOVE:**
```json
{
  "type": "move",
  "direction": 1  // 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT
}
```

**Request cho ROTATE:**
```json
{
  "type": "rotate",
  "direction": 2
}
```

**Request cho SHOOT:**
```json
{
  "type": "shoot"
}
```

**Response:** Server sẽ broadcast `game_state` mới cho tất cả clients

**Example:**
```javascript
// Di chuyển lên
socket.emit('player_action', { 
  type: 'move', 
  direction: 0 
})

// Xoay sang phải
socket.emit('player_action', { 
  type: 'rotate', 
  direction: 1 
})

// Bắn đạn
socket.emit('player_action', { 
  type: 'shoot' 
})
```

---

### 4. `submit_ai` (Future Feature)
**Description:** Submit AI code để chạy bot tự động.

**Request:**
```json
{
  "aiCode": "function move() { ... }"
}
```

**Response:** `ai_submitted`

---

## 🔴 Server → Client Events (Server broadcast)

### 1. `monitor_connected` (Unicast - Chỉ gửi cho monitor)
**Description:** Xác nhận monitor mode đã được kích hoạt.

**Broadcast Type:** Single client only

**Response:**
```json
{
  "success": true,
  "roomId": "game-room-1",
  "gameState": {
    // Game State Object (xem bên dưới)
  },
  "message": "Monitoring active game"
}
```

**Example:**
```javascript
socket.on('monitor_connected', (data) => {
  console.log('Monitor mode active:', data.message)
  console.log('Current game state:', data.gameState)
})
```

---

### 2. `joined_game` (Unicast - Chỉ gửi cho player vừa join)
**Description:** Xác nhận player đã join game thành công.

**Broadcast Type:** Single client only

**Response:**
```json
{
  "success": true,
  "playerId": "socket-id-abc123",
  "roomId": "room_1",
  "playerData": {
    "id": "socket-id-abc123",
    "name": "Bot_abc123",
    "x": 1,
    "y": 1,
    "direction": 0,
    "health": 100,
    "score": 0,
    "color": "#ff0000",
    "isAlive": true,
    "lastAction": null
  },
  "gameState": {
    // Game State Object (xem bên dưới)
  },
  "message": "Welcome Bot_abc123! You joined the game."
}
```

**Example:**
```javascript
socket.on('joined_game', (data) => {
  console.log('You joined as:', data.playerData.name)
  console.log('Your position:', data.playerData.x, data.playerData.y)
  console.log('Your color:', data.playerData.color)
})
```

---

### 3. `join_error` (Unicast - Khi join thất bại)
**Description:** Lỗi khi join game.

**Broadcast Type:** Single client only

**Response:**
```json
{
  "message": "All rooms are full"
}
```

**Possible errors:**
- `"Monitors cannot join as players"` - Monitor không thể join như player
- `"You are already in a game"` - Bạn đã ở trong game rồi
- `"All rooms are full"` - Tất cả rooms đã đầy (4/4 players)
- `"Failed to join game"` - Lỗi không xác định

**Example:**
```javascript
socket.on('join_error', (data) => {
  console.error('Failed to join:', data.message)
})
```

---

### 4. `player_joined` ⭐ (Broadcast - Gửi cho TẤT CẢ clients và monitors)
**Description:** Thông báo có player mới join vào game.

**Broadcast Type:** Global broadcast (tất cả clients + monitors)

**Response:**
```json
{
  "player": {
    "id": "socket-id-def456",
    "name": "Bot_def456",
    "x": 23,
    "y": 1,
    "direction": 2,
    "health": 100,
    "score": 0,
    "color": "#0000ff",
    "isAlive": true,
    "lastAction": null
  },
  "gameState": {
    // Game State Object (xem bên dưới)
  }
}
```

**Example:**
```javascript
socket.on('player_joined', (data) => {
  console.log('New player joined:', data.player.name)
  console.log('Total players now:', data.gameState.players.length)
})
```

---

### 5. `game_started` ⭐ (Broadcast - Gửi cho room)
**Description:** Game bắt đầu khi đủ 4 players.

**Broadcast Type:** Room only (4 players trong cùng room)

**Response:**
```json
{
  "gameState": {
    // Game State Object (xem bên dưới)
  }
}
```

**Example:**
```javascript
socket.on('game_started', (data) => {
  console.log('GAME STARTED!')
  console.log('Players:', data.gameState.players.length)
  // Bắt đầu AI logic ở đây
})
```

---

### 6. `game_state` ⭐ (Broadcast - Real-time updates)
**Description:** Cập nhật game state mỗi khi có thay đổi (di chuyển, bắn, etc).

**Broadcast Type:** Room + Monitors (realtime updates mỗi action)

**Response:**
```json
{
  "id": "room_1",
  "status": "playing",
  "players": [
    {
      "id": "socket-id-1",
      "name": "Bot_abc123",
      "x": 5,
      "y": 3,
      "direction": 1,
      "health": 100,
      "score": 0,
      "color": "#ff0000",
      "isAlive": true,
      "lastAction": {
        "type": "move",
        "direction": 1,
        "timestamp": 1696723456789
      }
    },
    {
      "id": "socket-id-2",
      "name": "Bot_def456",
      "x": 20,
      "y": 3,
      "direction": 3,
      "health": 75,
      "score": 25,
      "color": "#0000ff",
      "isAlive": true,
      "lastAction": {
        "type": "shoot",
        "timestamp": 1696723456790
      }
    }
  ],
  "map": [
    [1, 1, 1, 1, 1, 1, 1, ...],  // 1 = wall, 0 = empty
    [1, 0, 0, 0, 0, 0, 1, ...],
    [1, 0, 0, 0, 0, 0, 1, ...],
    ...
  ],
  "mapWithPlayers": [
    [1, 1, 1, 1, 1, 1, 1, ...],  // 2,3,4,5 = players 1,2,3,4
    [1, 2, 0, 0, 0, 3, 1, ...],
    [1, 0, 0, 0, 0, 0, 1, ...],
    ...
  ],
  "bullets": [
    {
      "id": "bullet-1",
      "x": 10.5,
      "y": 5.2,
      "direction": 1,
      "speed": 1,
      "ownerId": "socket-id-1",
      "damage": 25
    }
  ],
  "gameTime": 15432,
  "tickCount": 154,
  "maxPlayers": 4
}
```

**Map Values:**
- `0` = Empty space (có thể đi qua)
- `1` = Wall (không thể đi qua)
- `2` = Player 1 position
- `3` = Player 2 position
- `4` = Player 3 position
- `5` = Player 4 position

**Example:**
```javascript
socket.on('game_state', (gameState) => {
  console.log('Game tick:', gameState.tickCount)
  console.log('Players:', gameState.players.length)
  console.log('Bullets:', gameState.bullets.length)
  
  // Tìm vị trí của bot
  const myPlayer = gameState.players.find(p => p.id === socket.id)
  if (myPlayer) {
    console.log('My position:', myPlayer.x, myPlayer.y)
    console.log('My health:', myPlayer.health)
  }
})
```

---

### 7. `player_left` ⭐ (Broadcast - Gửi cho TẤT CẢ)
**Description:** Thông báo player rời game.

**Broadcast Type:** Global broadcast (tất cả clients + monitors)

**Response:**
```json
{
  "playerId": "socket-id-abc123",
  "gameState": {
    // Game State Object (xem bên dưới)
  }
}
```

**Example:**
```javascript
socket.on('player_left', (data) => {
  console.log('Player left:', data.playerId)
  console.log('Remaining players:', data.gameState.players.length)
})
```

---

## 📊 Broadcast Patterns Summary

| Event | Broadcast Type | Nhận bởi | Trigger |
|-------|---------------|----------|---------|
| `monitor_connected` | Unicast | Monitor đó | Client gửi `monitor_mode` |
| `joined_game` | Unicast | Player vừa join | Client gửi `join_game` |
| `join_error` | Unicast | Client lỗi | Lỗi khi join |
| `player_joined` | **Global** | **TẤT CẢ** clients & monitors | Player join thành công |
| `game_started` | Room | 4 players trong room | Đủ 4 players |
| `game_state` | Room + Monitors | Players trong room + monitors | Mỗi `player_action` |
| `player_left` | **Global** | **TẤT CẢ** clients & monitors | Player disconnect |

---

## 🎯 Game State Object Structure (Chi tiết)

### Root Object
```typescript
{
  id: string              // Room ID (e.g., "room_1")
  status: string          // "waiting" | "playing" | "finished"
  players: Player[]       // Array of players (max 4)
  map: number[][]         // Map matrix 25x19
  mapWithPlayers: number[][]  // Map với vị trí players (để render)
  bullets: Bullet[]       // Array of bullets
  gameTime: number        // Milliseconds since game start
  tickCount: number       // Number of game ticks (tickRate = 10 FPS)
  maxPlayers: number      // Always 4
}
```

### Player Object
```typescript
{
  id: string              // Socket ID (unique)
  name: string            // Player name (e.g., "Bot_abc123")
  x: number               // X position (0-24)
  y: number               // Y position (0-18)
  direction: number       // 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT
  health: number          // 0-100
  score: number           // Score points
  color: string           // Hex color (e.g., "#ff0000")
  isAlive: boolean        // true/false
  lastAction: {
    type: string          // "move" | "shoot" | "rotate" | "idle"
    direction?: number    // Optional direction
    timestamp: number     // Unix timestamp in milliseconds
  } | null
}
```

### Bullet Object
```typescript
{
  id: string              // Unique bullet ID
  x: number               // Float X position
  y: number               // Float Y position
  direction: number       // 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT
  speed: number           // Movement speed (1)
  ownerId: string         // Socket ID of shooter
  damage: number          // Damage amount (25)
}
```

---

## 🎨 Player Spawn Positions & Colors

Players spawn với màu sắc và vị trí cố định theo thứ tự join:

| Order | Color | Hex | Position | Direction |
|-------|-------|-----|----------|-----------|
| 1st | Red | `#ff0000` | (1, 1) - Góc trên trái | UP (0) |
| 2nd | Blue | `#0000ff` | (23, 1) - Góc trên phải | DOWN (2) |
| 3rd | Green | `#00ff00` | (1, 17) - Góc dưới trái | UP (0) |
| 4th | Yellow | `#ffff00` | (23, 17) - Góc dưới phải | DOWN (2) |

---

## 🚦 Complete Game Flow

```
1. CLIENT CONNECT
   └─> Socket established
   
2. CLIENT EMIT: join_game
   └─> { playerName: "MyBot" }
   
3. SERVER EMIT (unicast): joined_game
   └─> Client nhận player data & game state
   
4. SERVER BROADCAST (global): player_joined
   └─> Tất cả clients & monitors nhận thông báo
   
5. IF 4 PLAYERS
   └─> SERVER BROADCAST (room): game_started
       └─> Game loop bắt đầu (10 FPS)
   
6. CLIENT EMIT: player_action
   └─> { type: "move", direction: 1 }
   
7. SERVER PROCESS
   └─> Validate movement
   └─> Update player position
   
8. SERVER BROADCAST (room + monitors): game_state
   └─> Tất cả clients nhận state mới
   
9. IF CLIENT DISCONNECT
   └─> SERVER BROADCAST (global): player_left
       └─> Tất cả clients & monitors nhận thông báo
```

---

## 🤖 Complete Bot Client Example

```javascript
const { io } = require('socket.io-client')

// Kết nối đến server
const socket = io('http://localhost:8080')

let myPlayerId = null
let currentMap = null
let isGameStarted = false

// 1. Khi kết nối thành công
socket.on('connect', () => {
  console.log('✅ Connected! Socket ID:', socket.id)
  
  // 2. Gửi request join game
  socket.emit('join_game', { 
    playerName: `Bot_${Date.now()}` 
  })
})

// 3. Nhận confirmation join thành công
socket.on('joined_game', (data) => {
  console.log('🎮 Joined game successfully!')
  console.log('Player:', data.playerData.name)
  console.log('Position:', data.playerData.x, data.playerData.y)
  console.log('Color:', data.playerData.color)
  
  myPlayerId = data.playerId
  currentMap = data.gameState.map
})

// 4. Lắng nghe game start
socket.on('game_started', (data) => {
  console.log('🚀 GAME STARTED!')
  isGameStarted = true
  
  // Bắt đầu AI movement
  startAI()
})

// 5. Nhận game state updates
socket.on('game_state', (gameState) => {
  // Tìm vị trí của bot
  const myPlayer = gameState.players.find(p => p.id === myPlayerId)
  if (myPlayer) {
    console.log(`📍 Position: (${myPlayer.x}, ${myPlayer.y}), HP: ${myPlayer.health}`)
  }
})

// 6. Lắng nghe player mới join
socket.on('player_joined', (data) => {
  console.log('👋 New player:', data.player.name)
  console.log('Total players:', data.gameState.players.length)
})

// 7. Lắng nghe player rời đi
socket.on('player_left', (data) => {
  console.log('👋 Player left:', data.playerId)
})

// 8. Xử lý lỗi
socket.on('join_error', (data) => {
  console.error('❌ Join failed:', data.message)
})

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server')
})

// AI Logic
function startAI() {
  setInterval(() => {
    if (!isGameStarted) return
    
    // Random movement
    const randomDirection = Math.floor(Math.random() * 4)
    
    socket.emit('player_action', {
      type: 'move',
      direction: randomDirection
    })
    
    console.log('🚶 Moving:', ['UP', 'RIGHT', 'DOWN', 'LEFT'][randomDirection])
  }, 500) // Move every 500ms
}
```

---

## 🔌 REST API Endpoints

### `GET /health`
Health check endpoint.

**URL:** `http://localhost:8080/health`

**Method:** GET

**Response:**
```json
{
  "status": "ok",
  "activeRooms": 2,
  "timestamp": "2025-10-08T12:34:56.789Z"
}
```

**Example:**
```bash
curl http://localhost:8080/health
```

---

## 🛠️ Development Commands

### Server
```bash
cd auto-tank-game-server
npm install          # Install dependencies
npm run dev         # Development mode with hot reload (ts-node-dev)
npm run build       # Build TypeScript to JavaScript
npm start           # Production mode
```

### Client
```bash
cd auto-tank-game-client
npm install          # Install socket.io-client
node client.js       # Full client with detailed logging
node simple-bot.js   # Smart bot with AI movement
node smart-bot.js    # Advanced bot (if exists)
```

### UI Monitor
```bash
cd auto-tank-game-ui
npm install          # Install Vite, Phaser, etc
npm run dev         # Development server (hot reload)
npm run build       # Build for production
npm run preview     # Preview production build
```

---

## 📝 Testing Guide

### Test 1: Single Bot
```bash
# Terminal 1: Start server
cd auto-tank-game-server
npm start

# Terminal 2: Run bot
cd auto-tank-game-client
node simple-bot.js
```

Expected: Bot connects, joins game, waits for more players

---

### Test 2: Multiple Bots (4 players)
```bash
# Terminal 1: Server
cd auto-tank-game-server && npm start

# Terminal 2-5: Run 4 bots
cd auto-tank-game-client
node simple-bot.js  # Bot 1
node simple-bot.js  # Bot 2
node simple-bot.js  # Bot 3
node simple-bot.js  # Bot 4
```

Expected: Game auto-starts when 4th bot joins

---

### Test 3: Monitor Mode
```bash
# Terminal 1: Server
cd auto-tank-game-server && npm start

# Terminal 2: UI Monitor
cd auto-tank-game-ui && npm run dev

# Terminal 3-6: Run bots
cd auto-tank-game-client
node simple-bot.js  # Repeat 4 times
```

Expected: UI shows real-time game updates

---

## ⚠️ Important Notes

1. **Client PHẢI gửi `join_game`** để tham gia - không còn tự động join
2. **Monitor mode** (`monitor_mode` event) không tham gia game, chỉ quan sát
3. **Game auto-start** khi đủ 4 players trong cùng room
4. **Directions**: 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT (QUAN TRỌNG!)
5. **Map bounds**: x: 0-24, y: 0-18
6. **Collision detection**: Server tự động kiểm tra walls và bounds
7. **Real-time updates**: Server broadcast `game_state` sau mỗi action
8. **Player colors** được gán tự động theo thứ tự join (Red, Blue, Green, Yellow)

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot không di chuyển | Kiểm tra game đã start (`game_started` event) |
| Connection refused | Đảm bảo server chạy trên port 8080 |
| Player không join được | Kiểm tra đã gửi `join_game` event chưa |
| UI không hiển thị players | Đảm bảo gửi `monitor_mode` với `isMonitor: true` |
| "You are already in a game" | Client đã join rồi, không thể join lại |
| "All rooms are full" | Room đã đủ 4 players |

---

## 📚 Related Documentation

- [SERVER_API_DOCUMENTATION.md](./SERVER_API_DOCUMENTATION.md) - Detailed API docs (nếu có)
- [THAY_DOI.md](./THAY_DOI.md) - Change log và lịch sử thay đổi
- [HUONG_DAN_TEST_DI_CHUYEN.md](./HUONG_DAN_TEST_DI_CHUYEN.md) - Hướng dẫn test movement

---

## 📊 Technology Stack

- **Server**: Node.js, TypeScript, Express, Socket.IO
- **Client**: Node.js, Socket.IO Client
- **UI**: Vite, Phaser 3, TypeScript
- **Real-time**: Socket.IO (WebSocket + fallbacks)

---

## 📄 License

MIT

---

## 👥 Contributors

- ThanhNhan03

---

**Built with ❤️ using Node.js, Socket.IO, TypeScript, and Phaser**

**Last Updated:** October 8, 2025
