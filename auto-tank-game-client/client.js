const { io } = require('socket.io-client')

console.log('🎮 Auto Tank Game - Test Client')
console.log('================================')

// Kết nối đến server
const socket = io('http://localhost:8080')

// Biến để lưu trữ data
let gameState = null
let playerId = null
let roomId = null

// Event: Kết nối thành công
socket.on('connect', () => {
  console.log('✅ Đã kết nối với server!')
  console.log('📡 Socket ID:', socket.id)
  console.log('🎮 Gửi yêu cầu join game...')
  console.log('')
  
  // Gửi yêu cầu join game với tên ngẫu nhiên
  const randomNum = Math.floor(Math.random() * 1000)
  const playerName = `Player_${randomNum}`
  
  socket.emit('join_game', { playerName: playerName })
})

// Event: Join game thành công
socket.on('joined_game', (data) => {
  console.log('🎯 Join game thành công!')
  console.log('💬 Message:', data.message)
  console.log('👤 Player ID:', data.playerId)
  console.log('🏠 Room ID:', data.roomId)
  console.log('📊 Player Data:', data.playerData)
  console.log('')
  
  playerId = data.playerId
  roomId = data.roomId
  gameState = data.gameState
  
  // In ra toàn bộ JSON data để kiểm tra
  console.log('🔍 TOÀN BỘ DATA NHẬN ĐƯỢC:')
  console.log('==========================')
  console.log('JSON Data:', JSON.stringify(data, null, 2))
  console.log('')
  
  // In ra thông tin map matrix
  printMapMatrix(data.gameState.map)
  
  // In ra map với players nếu có
  if (data.gameState.mapWithPlayers) {
    printMapWithPlayers(data.gameState.mapWithPlayers)
  }
  
  printGameState(data.gameState)
})

// Event: Join game error
socket.on('join_error', (data) => {
  console.error('❌ Lỗi khi join game:', data.message)
  console.log('')
})

// Event: Nhận game state updates
socket.on('game_state', (newGameState) => {
  console.log('🔄 Nhận game state update:')
  console.log('⏰ Game Time:', newGameState.gameTime)
  console.log('🔢 Tick Count:', newGameState.tickCount)
  console.log('👥 Players Count:', newGameState.players.length)
  console.log('💥 Bullets Count:', newGameState.bullets.length)
  console.log('')
  
  gameState = newGameState
  
  // In ra map với players positions
  if (newGameState.mapWithPlayers) {
    printMapWithPlayers(newGameState.mapWithPlayers)
  }
  
  // In ra players info
  printPlayersInfo(newGameState.players)
})

// Event: Player mới join
socket.on('player_joined', (data) => {
  console.log('👋 Player mới join:')
  console.log('👤 Player:', data.player.name)
  console.log('🎨 Color:', data.player.color)
  console.log('📍 Position:', `(${data.player.x}, ${data.player.y})`)
  console.log('👥 Total Players:', data.gameState.players.length)
  console.log('')
})

// Event: Game bắt đầu
socket.on('game_started', (data) => {
  console.log('🎮 GAME ĐÃ BẮT ĐẦU!')
  console.log('👥 Players:', data.gameState.players.length)
  console.log('🗺️  Map Size:', `${data.gameState.map[0].length}x${data.gameState.map.length}`)
  console.log('')
})

// Event: Player rời đi
socket.on('player_left', (data) => {
  console.log('👋 Player left:', data.playerId)
  console.log('👥 Remaining Players:', data.gameState.players.length)
  console.log('')
})

// Event: Lỗi kết nối
socket.on('connection_error', (error) => {
  console.log('❌ Lỗi kết nối tự động:', error.message)
})

// Event: Lỗi join (legacy)
socket.on('join_error', (error) => {
  console.log('❌ Lỗi join game:', error.message)
})

// Event: Cập nhật tên
socket.on('name_updated', (data) => {
  console.log('✏️ Tên đã được cập nhật:', data.newName)
})

// Event: Mất kết nối
socket.on('disconnect', () => {
  console.log('❌ Mất kết nối với server')
})

// Hàm in ra map matrix
function printMapMatrix(map) {
  console.log('🗺️  MAP MATRIX NHẬN ĐƯỢC:')
  console.log('========================')
  console.log('📏 Kích thước:', `${map[0].length}x${map.length}`)
  console.log('')
  
  // In ra RAW MATRIX DATA (dạng số)
  console.log('📊 RAW MATRIX DATA (dạng số):')
  console.log('==============================')
  for (let y = 0; y < map.length; y++) {
    let row = ''
    for (let x = 0; x < map[y].length; x++) {
      row += map[y][x] + ' '
    }
    console.log(`Row ${y.toString().padStart(2, '0')}: [${row.trim()}]`)
  }
  console.log('')
  
  // Phân tích chi tiết từng loại tile
  console.log('🔍 PHÂN TÍCH CHI TIẾT:')
  console.log('======================')
  let tileTypes = {}
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const tileValue = map[y][x]
      if (!tileTypes[tileValue]) {
        tileTypes[tileValue] = 0
      }
      tileTypes[tileValue]++
    }
  }
  
  Object.keys(tileTypes).forEach(tileType => {
    const count = tileTypes[tileType]
    let description = ''
    switch(tileType) {
      case '0': description = 'Empty Space'; break
      case '1': description = 'Wall'; break
      case '2': description = 'Player 1'; break
      case '3': description = 'Player 2'; break
      case '4': description = 'Player 3'; break
      case '5': description = 'Player 4'; break
      default: description = `Unknown Type ${tileType}`
    }
    console.log(`Value ${tileType}: ${count} tiles (${description})`)
  })
  
  console.log('📊 Total tiles:', Object.values(tileTypes).reduce((a, b) => a + b, 0))
  console.log('')
}

// Hàm in ra map với players từ server
function printMapWithPlayers(mapWithPlayers) {
  if (!mapWithPlayers) {
    console.log('❌ Không có mapWithPlayers data')
    return
  }
  
  console.log('🎮 MAP VỚI PLAYERS:')
  console.log('===================')
  console.log('📏 Kích thước:', `${mapWithPlayers[0].length}x${mapWithPlayers.length}`)
  console.log('')
  
  // In ra RAW MATRIX với players
  console.log('📊 RAW MATRIX WITH PLAYERS:')
  console.log('============================')
  for (let y = 0; y < mapWithPlayers.length; y++) {
    let row = ''
    for (let x = 0; x < mapWithPlayers[y].length; x++) {
      row += mapWithPlayers[y][x] + ' '
    }
    console.log(`Row ${y.toString().padStart(2, '0')}: [${row.trim()}]`)
  }
  console.log('')
}

// Hàm in ra thông tin game state
function printGameState(gameState) {
  console.log('🎮 GAME STATE:')
  console.log('==============')
  console.log('🆔 Game ID:', gameState.id)
  console.log('🔄 Status:', gameState.status)
  console.log('👥 Max Players:', gameState.maxPlayers)
  console.log('⏰ Game Time:', gameState.gameTime)
  console.log('🔢 Tick Count:', gameState.tickCount)
  console.log('')
}

// Hàm in ra thông tin players
function printPlayersInfo(players) {
  console.log('👥 PLAYERS INFO:')
  console.log('================')
  players.forEach((player, index) => {
    console.log(`Player ${index + 1}:`)
    console.log(`  👤 Name: ${player.name}`)
    console.log(`  🎨 Color: ${player.color}`)
    console.log(`  📍 Position: (${player.x}, ${player.y})`)
    console.log(`  🧭 Direction: ${player.direction}`)
    console.log(`  ❤️  Health: ${player.health}`)
    console.log(`  🏆 Score: ${player.score}`)
    console.log(`  ✅ Alive: ${player.isAlive}`)
    console.log('')
  })
}

// Bắt tín hiệu thoát
process.on('SIGINT', () => {
  console.log('')
  console.log('👋 Đang thoát client...')
  socket.disconnect()
  process.exit(0)
})

console.log('🔌 Đang kết nối đến server http://localhost:8080...')
console.log('💡 Nhấn Ctrl+C để thoát')
console.log('')