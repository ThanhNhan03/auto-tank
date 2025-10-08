const { io } = require('socket.io-client')

console.log('🤖 Simple Bot Client - Smart Movement!')
console.log('======================================')

// Kết nối đơn giản nhất có thể
const socket = io('http://localhost:8080')

// Bot state
let botPlayer = null
let gameMap = null
let mapWidth = 0
let mapHeight = 0
let isGameStarted = false
let movementInterval = null

// Direction constants
const DIRECTIONS = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3
}

const DIRECTION_NAMES = ['UP', 'RIGHT', 'DOWN', 'LEFT']

socket.on('connect', () => {
  console.log('🤖 Bot connected! Socket ID:', socket.id)
  console.log('🎮 Sending join request...')
  
  // Gửi yêu cầu join game
  const botName = `Bot_${socket.id.substring(0, 6)}`
  socket.emit('join_game', { playerName: botName })
})

socket.on('joined_game', (data) => {
  console.log('🎮 Bot joined game successfully!')
  console.log('🏠 Room:', data.roomId)
  console.log('👤 Player Name:', data.playerData.name)
  console.log('🎨 Color:', data.playerData.color)
  console.log('📍 Position:', `(${data.playerData.x}, ${data.playerData.y})`)
  console.log('🗺️  Map Size:', `${data.gameState.map[0].length}x${data.gameState.map.length}`)
  console.log('')
  
  // Lưu thông tin bot
  botPlayer = data.playerData
  gameMap = data.gameState.map
  mapWidth = data.gameState.map[0].length
  mapHeight = data.gameState.map.length
  
  console.log('🤖 Bot initialized and ready to explore!')
  console.log('⏳ Waiting for game to start...')
})

socket.on('join_error', (data) => {
  console.error('❌ Bot failed to join:', data.message)
})

// function printSimpleMapWithPlayers(mapWithPlayers) {
//   console.log('🎯 MAP WITH PLAYERS:')
//   console.log('====================')
  
//   for (let y = 0; y < mapWithPlayers.length; y++) {
//     let row = ''
//     for (let x = 0; x < mapWithPlayers[y].length; x++) {
//       const value = mapWithPlayers[y][x]
//       if (value === 1) {
//         row += '█'
//       } else if (value === 0) {
//         row += '.'
//       } else if (value === 2) {
//         row += '1'
//       } else if (value === 3) {
//         row += '2'
//       } else if (value === 4) {
//         row += '3'
//       } else if (value === 5) {
//         row += '4'
//       } else {
//         row += '?'
//       }
//     }
//     console.log(row)
//   }
//   console.log('')
// }

socket.on('game_state', (gameState) => {
  console.log(`🔄 Game update - Time: ${gameState.gameTime}ms, Players: ${gameState.players.length}`)
  
  // In ra map với players positions 
  if (gameState.mapWithPlayers) {
    printSimpleMapWithPlayers(gameState.mapWithPlayers)
  }
})

socket.on('game_started', (data) => {
  console.log('🚀 GAME STARTED! Bot is ready to play!')
  isGameStarted = true
  
  // Bắt đầu di chuyển
  startBotMovement()
})

socket.on('player_joined', (data) => {
  console.log(`👋 New player joined: ${data.player.name}`)
})

socket.on('connection_error', (error) => {
  console.log('❌ Connection failed:', error.message)
  process.exit(1)
})

socket.on('disconnect', () => {
  console.log('❌ Bot disconnected')
  process.exit(0)
})

// ============================================
// BOT MOVEMENT LOGIC
// ============================================

function startBotMovement() {
  console.log('🤖 Starting smart movement system...')
  
  // Di chuyển mỗi 500ms (2 moves per second)
  movementInterval = setInterval(() => {
    if (botPlayer && gameMap && isGameStarted) {
      makeSmartMove()
    }
  }, 500)
}

function makeSmartMove() {
  // Lấy vị trí hiện tại
  const currentX = botPlayer.x
  const currentY = botPlayer.y
  const currentDirection = botPlayer.direction
  
  // Tìm direction tốt nhất để di chuyển
  const bestDirection = findBestDirection(currentX, currentY, currentDirection)
  
  if (bestDirection !== null) {
    // Nếu cần xoay, xoay trước
    if (bestDirection !== currentDirection) {
      botPlayer.direction = bestDirection
      console.log(`🔄 Bot rotating to ${DIRECTION_NAMES[bestDirection]}`)
      socket.emit('player_action', {
        type: 'rotate',
        direction: bestDirection
      })
      return
    }
    
    // Di chuyển theo direction hiện tại
    const nextPos = getNextPosition(currentX, currentY, currentDirection)
    
    if (canMoveTo(nextPos.x, nextPos.y)) {
      botPlayer.x = nextPos.x
      botPlayer.y = nextPos.y
      
      console.log(`🚶 Bot moving ${DIRECTION_NAMES[currentDirection]} to (${nextPos.x}, ${nextPos.y})`)
      
      socket.emit('player_action', {
        type: 'move',
        direction: currentDirection
      })
    } else {
      console.log(`🚫 Cannot move ${DIRECTION_NAMES[currentDirection]}, finding new path...`)
    }
  }
}

function findBestDirection(x, y, currentDirection) {
  // Ưu tiên: tiếp tục đi thẳng nếu có thể
  const straight = getNextPosition(x, y, currentDirection)
  if (canMoveTo(straight.x, straight.y)) {
    return currentDirection
  }
  
  // Tạo danh sách directions ưu tiên
  const directions = []
  
  // Thêm các hướng xung quanh (trái/phải so với hướng hiện tại)
  const left = (currentDirection + 3) % 4
  const right = (currentDirection + 1) % 4
  const back = (currentDirection + 2) % 4
  
  directions.push(left, right, back)
  
  // Thử các hướng theo thứ tự ưu tiên
  for (const dir of directions) {
    const nextPos = getNextPosition(x, y, dir)
    if (canMoveTo(nextPos.x, nextPos.y)) {
      return dir
    }
  }
  
  // Không tìm thấy hướng nào hợp lệ
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
  
  // Kiểm tra tường (1 = wall, 0 = empty)
  if (gameMap[y][x] === 1) {
    return false
  }
  
  return true
}

function getRandomDirection() {
  return Math.floor(Math.random() * 4)
}

// Update bot state khi nhận game state
socket.on('game_state', (gameState) => {
  // Cập nhật vị trí bot từ server
  if (gameState.players && botPlayer) {
    const serverPlayer = gameState.players.find(p => p.id === socket.id)
    if (serverPlayer) {
      botPlayer = serverPlayer
    }
  }
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Bot shutting down...')
  if (movementInterval) {
    clearInterval(movementInterval)
  }
  socket.disconnect()
  process.exit(0)
})

console.log('🔌 Connecting to http://localhost:8080...')
console.log('💡 Press Ctrl+C to exit')