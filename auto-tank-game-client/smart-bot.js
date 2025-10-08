const { io } = require('socket.io-client')

console.log('🧠 Smart Bot Client - Advanced AI!')
console.log('===================================')

// Kết nối với server
const socket = io('http://localhost:8080')

// Bot state
let botPlayer = null
let gameMap = null
let allPlayers = []
let mapWidth = 0
let mapHeight = 0
let isGameStarted = false
let movementInterval = null
let exploredCells = new Set()
let currentTarget = null
let stuckCounter = 0
let lastPosition = null

// Direction constants
const DIRECTIONS = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3
}

const DIRECTION_NAMES = ['UP', 'RIGHT', 'DOWN', 'LEFT']
const DIRECTION_SYMBOLS = ['↑', '→', '↓', '←']

socket.on('connect', () => {
  console.log('🧠 Smart Bot connected! Socket ID:', socket.id)
  console.log('🎮 Sending join request...')
  
  const botName = `SmartBot_${socket.id.substring(0, 4)}`
  socket.emit('join_game', { playerName: botName })
})

socket.on('joined_game', (data) => {
  console.log('🎮 Smart Bot joined game successfully!')
  console.log('🏠 Room:', data.roomId)
  console.log('👤 Player Name:', data.playerData.name)
  console.log('🎨 Color:', data.playerData.color)
  console.log('📍 Starting Position:', `(${data.playerData.x}, ${data.playerData.y})`)
  console.log('🗺️  Map Size:', `${data.gameState.map[0].length}x${data.gameState.map.length}`)
  console.log('')
  
  botPlayer = data.playerData
  gameMap = data.gameState.map
  mapWidth = data.gameState.map[0].length
  mapHeight = data.gameState.map.length
  lastPosition = { x: botPlayer.x, y: botPlayer.y }
  
  console.log('🧠 Smart Bot initialized with advanced pathfinding!')
  console.log('⏳ Waiting for game to start...')
})

socket.on('join_error', (data) => {
  console.error('❌ Smart Bot failed to join:', data.message)
})

socket.on('game_started', (data) => {
  console.log('🚀 GAME STARTED! Smart Bot activating AI systems...')
  isGameStarted = true
  
  startSmartMovement()
})

socket.on('game_state', (gameState) => {
  // Cập nhật state từ server
  if (gameState.players && botPlayer) {
    const serverPlayer = gameState.players.find(p => p.id === socket.id)
    if (serverPlayer) {
      // Kiểm tra xem bot có bị stuck không
      if (lastPosition && lastPosition.x === serverPlayer.x && lastPosition.y === serverPlayer.y) {
        stuckCounter++
      } else {
        stuckCounter = 0
        lastPosition = { x: serverPlayer.x, y: serverPlayer.y }
      }
      
      botPlayer = serverPlayer
      
      // Đánh dấu ô đã explore
      const cellKey = `${botPlayer.x},${botPlayer.y}`
      if (!exploredCells.has(cellKey)) {
        exploredCells.add(cellKey)
        console.log(`🗺️  Explored: (${botPlayer.x}, ${botPlayer.y}) - Total: ${exploredCells.size} cells`)
      }
    }
    
    allPlayers = gameState.players
  }
})

socket.on('player_joined', (data) => {
  console.log(`👋 New player joined: ${data.player.name}`)
})

socket.on('connection_error', (error) => {
  console.log('❌ Connection failed:', error.message)
  process.exit(1)
})

socket.on('disconnect', () => {
  console.log('❌ Smart Bot disconnected')
  process.exit(0)
})

// ============================================
// SMART MOVEMENT LOGIC
// ============================================

function startSmartMovement() {
  console.log('🧠 Starting advanced AI movement system...')
  console.log('📊 Features: Pathfinding, Exploration, Obstacle Avoidance')
  console.log('')
  
  // Di chuyển mỗi 400ms (faster than simple bot)
  movementInterval = setInterval(() => {
    if (botPlayer && gameMap && isGameStarted && botPlayer.isAlive) {
      makeSmartMove()
    }
  }, 400)
}

function makeSmartMove() {
  const currentX = botPlayer.x
  const currentY = botPlayer.y
  const currentDirection = botPlayer.direction
  
  // Nếu bị stuck quá lâu, random direction mới
  if (stuckCounter > 5) {
    console.log('🔄 Bot seems stuck, trying random direction...')
    currentTarget = null
    stuckCounter = 0
  }
  
  // Nếu không có target hoặc đã đến target, tìm target mới
  if (!currentTarget || (currentX === currentTarget.x && currentY === currentTarget.y)) {
    currentTarget = findNextExplorationTarget(currentX, currentY)
    if (currentTarget) {
      console.log(`🎯 New target: (${currentTarget.x}, ${currentTarget.y})`)
    }
  }
  
  // Tìm hướng di chuyển tốt nhất
  let bestDirection
  
  if (currentTarget) {
    // Sử dụng pathfinding để đi đến target
    bestDirection = findDirectionToTarget(currentX, currentY, currentTarget, currentDirection)
  } else {
    // Không có target, explore ngẫu nhiên
    bestDirection = findBestExplorationDirection(currentX, currentY, currentDirection)
  }
  
  if (bestDirection !== null) {
    // Xoay nếu cần
    if (bestDirection !== currentDirection) {
      botPlayer.direction = bestDirection
      const symbol = DIRECTION_SYMBOLS[bestDirection]
      console.log(`${symbol} Rotating to ${DIRECTION_NAMES[bestDirection]}`)
      
      socket.emit('player_action', {
        type: 'rotate',
        direction: bestDirection
      })
      return
    }
    
    // Di chuyển
    const nextPos = getNextPosition(currentX, currentY, currentDirection)
    
    if (canMoveTo(nextPos.x, nextPos.y)) {
      const symbol = DIRECTION_SYMBOLS[currentDirection]
      console.log(`${symbol} Moving to (${nextPos.x}, ${nextPos.y})`)
      
      botPlayer.x = nextPos.x
      botPlayer.y = nextPos.y
      
      socket.emit('player_action', {
        type: 'move',
        direction: currentDirection
      })
    } else {
      console.log(`🚫 Path blocked, recalculating...`)
      currentTarget = null
    }
  } else {
    console.log('🤔 No valid direction found, staying put...')
  }
}

function findNextExplorationTarget(x, y) {
  // Tìm ô chưa explore gần nhất
  let minDistance = Infinity
  let bestTarget = null
  
  // Scan vùng lân cận (radius 5)
  const radius = 5
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const targetX = x + dx
      const targetY = y + dy
      
      if (canMoveTo(targetX, targetY)) {
        const cellKey = `${targetX},${targetY}`
        
        if (!exploredCells.has(cellKey)) {
          const distance = Math.abs(dx) + Math.abs(dy)
          if (distance < minDistance) {
            minDistance = distance
            bestTarget = { x: targetX, y: targetY }
          }
        }
      }
    }
  }
  
  // Nếu không tìm thấy ô chưa explore gần, chọn random
  if (!bestTarget) {
    bestTarget = findRandomValidCell()
  }
  
  return bestTarget
}

function findRandomValidCell() {
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(Math.random() * mapWidth)
    const y = Math.floor(Math.random() * mapHeight)
    
    if (canMoveTo(x, y)) {
      return { x, y }
    }
  }
  return null
}

function findDirectionToTarget(x, y, target, currentDirection) {
  // Simple greedy approach - di chuyển về phía target
  const dx = target.x - x
  const dy = target.y - y
  
  // Ưu tiên axis có khoảng cách lớn hơn
  const priorities = []
  
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy < 0) priorities.push(DIRECTIONS.UP)
    if (dy > 0) priorities.push(DIRECTIONS.DOWN)
    if (dx > 0) priorities.push(DIRECTIONS.RIGHT)
    if (dx < 0) priorities.push(DIRECTIONS.LEFT)
  } else {
    if (dx > 0) priorities.push(DIRECTIONS.RIGHT)
    if (dx < 0) priorities.push(DIRECTIONS.LEFT)
    if (dy < 0) priorities.push(DIRECTIONS.UP)
    if (dy > 0) priorities.push(DIRECTIONS.DOWN)
  }
  
  // Thử các direction theo thứ tự ưu tiên
  for (const dir of priorities) {
    const nextPos = getNextPosition(x, y, dir)
    if (canMoveTo(nextPos.x, nextPos.y)) {
      return dir
    }
  }
  
  // Không có direction nào đi được về phía target, tìm bất kỳ direction nào
  return findBestExplorationDirection(x, y, currentDirection)
}

function findBestExplorationDirection(x, y, currentDirection) {
  // Ưu tiên: tiếp tục đi thẳng
  const straight = getNextPosition(x, y, currentDirection)
  if (canMoveTo(straight.x, straight.y)) {
    return currentDirection
  }
  
  // Thử các hướng khác
  const directions = [
    (currentDirection + 3) % 4, // Trái
    (currentDirection + 1) % 4, // Phải
    (currentDirection + 2) % 4  // Quay lại
  ]
  
  for (const dir of directions) {
    const nextPos = getNextPosition(x, y, dir)
    if (canMoveTo(nextPos.x, nextPos.y)) {
      return dir
    }
  }
  
  return null
}

function getNextPosition(x, y, direction) {
  switch (direction) {
    case DIRECTIONS.UP:
      return { x, y: y - 1 }
    case DIRECTIONS.RIGHT:
      return { x: x + 1, y }
    case DIRECTIONS.DOWN:
      return { x, y: y + 1 }
    case DIRECTIONS.LEFT:
      return { x: x - 1, y }
    default:
      return { x, y }
  }
}

function canMoveTo(x, y) {
  // Kiểm tra bounds
  if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) {
    return false
  }
  
  // Kiểm tra tường
  if (gameMap[y][x] === 1) {
    return false
  }
  
  // Kiểm tra collision với player khác (optional)
  // TODO: implement later if needed
  
  return true
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Smart Bot shutting down...')
  console.log(`📊 Explored ${exploredCells.size} cells before shutdown`)
  
  if (movementInterval) {
    clearInterval(movementInterval)
  }
  socket.disconnect()
  process.exit(0)
})

console.log('🔌 Connecting to http://localhost:8080...')
console.log('💡 Press Ctrl+C to exit')
