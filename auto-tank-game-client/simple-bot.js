const { io } = require('socket.io-client')

console.log('🤖 Simple Bot Client - No Dependencies!')
console.log('======================================')

// Kết nối đơn giản nhất có thể
const socket = io('http://localhost:8080')

socket.on('connect', () => {
  console.log('🤖 Bot connected! Socket ID:', socket.id)
  console.log('⏳ Waiting for auto-join...')
})

socket.on('connected_to_game', (data) => {
  console.log('🎮 Bot auto-joined game!')
  console.log('🏠 Room:', data.roomId)
  console.log('👤 Player Name:', data.playerData.name)
  console.log('🎨 Color:', data.playerData.color)
  console.log('📍 Position:', `(${data.playerData.x}, ${data.playerData.y})`)
  console.log('🗺️  Map Size:', `${data.gameState.map[0].length}x${data.gameState.map.length}`)
  console.log('')
  
  // In ra map với players
  if (data.gameState.mapWithPlayers) {
    printSimpleMapWithPlayers(data.gameState.mapWithPlayers)
  }
})

function printSimpleMapWithPlayers(mapWithPlayers) {
  console.log('🎯 MAP WITH PLAYERS:')
  console.log('====================')
  
  for (let y = 0; y < mapWithPlayers.length; y++) {
    let row = ''
    for (let x = 0; x < mapWithPlayers[y].length; x++) {
      const value = mapWithPlayers[y][x]
      if (value === 1) {
        row += '█'
      } else if (value === 0) {
        row += '.'
      } else if (value === 2) {
        row += '1'
      } else if (value === 3) {
        row += '2'
      } else if (value === 4) {
        row += '3'
      } else if (value === 5) {
        row += '4'
      } else {
        row += '?'
      }
    }
    console.log(row)
  }
  console.log('')
}

socket.on('game_state', (gameState) => {
  console.log(`🔄 Game update - Time: ${gameState.gameTime}ms, Players: ${gameState.players.length}`)
  
  // In ra map với players positions 
  if (gameState.mapWithPlayers) {
    printSimpleMapWithPlayers(gameState.mapWithPlayers)
  }
})

socket.on('game_started', (data) => {
  console.log('🚀 GAME STARTED! Bot is ready to play!')
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Bot shutting down...')
  socket.disconnect()
  process.exit(0)
})

console.log('🔌 Connecting to http://localhost:8080...')
console.log('💡 Press Ctrl+C to exit')