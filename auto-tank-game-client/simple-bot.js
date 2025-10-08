const { io } = require('socket.io-client');

console.log('🧠 Smart Bot Client - Advanced AI!');
console.log('===================================');

// Connect to server
const socket = io('http://localhost:8080');

// Bot state
let botPlayer = null;
let gameMap = null;
let allPlayers = [];
let mapWidth = 0;
let mapHeight = 0;

// Direction constants
const DIRECTIONS = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3
};

const DIRECTION_NAMES = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
const DIRECTION_SYMBOLS = ['↑', '→', '↓', '←'];

// AI logic for smart bot
function smartBotAI(player, game) {
  const currentX = player.x;
  const currentY = player.y;
  const currentDirection = player.direction;
  const cellKey = `${currentX},${currentY}`;
  
  // Track explored cells
  if (!global.exploredCells) global.exploredCells = new Set();
  global.exploredCells.add(cellKey);

  // Check if stuck
  if (!global.lastPosition) global.lastPosition = { x: currentX, y: currentY };
  if (global.lastPosition.x === currentX && global.lastPosition.y === currentY) {
    global.stuckCounter = (global.stuckCounter || 0) + 1;
  } else {
    global.stuckCounter = 0;
    global.lastPosition = { x: currentX, y: currentY };
  }

  // If stuck, reset target
  if (global.stuckCounter > 5) {
    global.currentTarget = null;
    global.stuckCounter = 0;
  }

  // Check for incoming bullets and dodge if necessary
  let incomingBullet = null;
  let minBulletDistance = Infinity;
  let bulletApproachTime = Infinity;
  game.bullets.forEach(bullet => {
    if (bullet.ownerId !== player.id) {
      const dx = bullet.x - currentX;
      const dy = bullet.y - currentY;
      const distance = Math.sqrt(dx ** 2 + dy ** 2);

      // Estimate time to impact based on bullet direction and position
      let approachTime = Infinity;
      switch (bullet.direction) {
        case DIRECTIONS.UP:
          if (dy > 0 && Math.abs(dx) < 1) approachTime = dy; // Bullet coming down towards us? Wait, UP means moving up, so if dy < 0? Let's clarify.
          break;
        case DIRECTIONS.RIGHT:
          if (dx < 0 && Math.abs(dy) < 1) approachTime = -dx; // Bullet moving right, so if to our left, approaching if dx < 0? No.
          break;
        case DIRECTIONS.DOWN:
          if (dy < 0 && Math.abs(dx) < 1) approachTime = -dy;
          break;
        case DIRECTIONS.LEFT:
          if (dx > 0 && Math.abs(dy) < 1) approachTime = dx;
          break;
      }

      if (approachTime < bulletApproachTime) {
        bulletApproachTime = approachTime;
        incomingBullet = bullet;
        minBulletDistance = distance;
      }
    }
  });

  if (incomingBullet && bulletApproachTime < 5) {  // Dodge if bullet is approaching within 5 "time units" (cells)
    console.log(`🚨 Dodging incoming bullet from direction ${DIRECTION_NAMES[incomingBullet.direction]}!`);

    // Calculate perpendicular directions to dodge
    const bulletDir = incomingBullet.direction;
    const perpDirs = [(bulletDir + 1) % 4, (bulletDir + 3) % 4];  // Left and right relative to bullet's movement

    // Prefer directions that move away from the bullet's path
    for (const dir of perpDirs) {
      const nextPos = getNextPosition(currentX, currentY, dir);
      if (canMoveTo(nextPos.x, nextPos.y, game.map)) {
        // Check if this move actually avoids the bullet's path
        const wouldBeHit = isPositionInBulletPath(nextPos.x, nextPos.y, incomingBullet);
        if (!wouldBeHit) {
          if (dir !== currentDirection) {
            return { type: 'rotate', direction: dir, timestamp: Date.now() };
          }
          return { type: 'move', direction: dir, timestamp: Date.now() };
        }
      }
    }

    // If perpendicular not possible, try opposite direction (back away)
    const oppositeDir = (bulletDir + 2) % 4;
    const nextPosOpp = getNextPosition(currentX, currentY, oppositeDir);
    if (canMoveTo(nextPosOpp.x, nextPosOpp.y, game.map) && !isPositionInBulletPath(nextPosOpp.x, nextPosOpp.y, incomingBullet)) {
      if (oppositeDir !== currentDirection) {
        return { type: 'rotate', direction: oppositeDir, timestamp: Date.now() };
      }
      return { type: 'move', direction: oppositeDir, timestamp: Date.now() };
    }

    // Last resort: any safe direction not in bullet path
    for (let dir = 0; dir < 4; dir++) {
      const nextPos = getNextPosition(currentX, currentY, dir);
      if (canMoveTo(nextPos.x, nextPos.y, game.map) && !isPositionInBulletPath(nextPos.x, nextPos.y, incomingBullet)) {
        if (dir !== currentDirection) {
          return { type: 'rotate', direction: dir, timestamp: Date.now() };
        }
        return { type: 'move', direction: dir, timestamp: Date.now() };
      }
    }

    // If no escape, just idle or shoot if possible
    return { type: 'idle', timestamp: Date.now() };
  }

  // Find nearest enemy within 5 cells
  let nearestEnemy = null;
  let minDistance = Infinity;
  game.players.forEach(p => {
    if (p.id !== player.id && p.isAlive) {
      const distance = Math.sqrt((p.x - currentX) ** 2 + (p.y - currentY) ** 2);
      if (distance < minDistance && distance <= 5) {  // Changed to 5 cells
        minDistance = distance;
        nearestEnemy = p;
      }
    }
  });

  if (nearestEnemy) {  // Attack if enemy is within 5 cells
    console.log(`⚔️ Targeting enemy at (${nearestEnemy.x}, ${nearestEnemy.y}) - Distance: ${minDistance.toFixed(1)}`);

    // Determine direction to face the enemy
    const dx = nearestEnemy.x - currentX;
    const dy = nearestEnemy.y - currentY;
    let targetDir;
    if (Math.abs(dx) > Math.abs(dy)) {
      targetDir = dx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
    } else {
      targetDir = dy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP;
    }

    // Check if enemy is in shooting line (aligned horizontally or vertically)
    const isAligned = (targetDir === DIRECTIONS.RIGHT || targetDir === DIRECTIONS.LEFT) ? dy === 0 : dx === 0;

    if (isAligned) {
      if (targetDir !== currentDirection) {
        return { type: 'rotate', direction: targetDir, timestamp: Date.now() };
      }
      // If facing enemy and aligned, shoot
      return { type: 'shoot', timestamp: Date.now() };
    } else {
      // If not aligned, move towards enemy to align
      return findDirectionToTarget(currentX, currentY, { x: nearestEnemy.x, y: nearestEnemy.y }, currentDirection, game.map);
    }
  }

  // Exploration if no enemy
  if (!global.currentTarget || (currentX === global.currentTarget.x && currentY === global.currentTarget.y)) {
    global.currentTarget = findNextExplorationTarget(currentX, currentY, game.map);
  }

  // Find best direction
  let bestDirection;
  if (global.currentTarget) {
    bestDirection = findDirectionToTarget(currentX, currentY, global.currentTarget, currentDirection, game.map);
  } else {
    bestDirection = findBestExplorationDirection(currentX, currentY, currentDirection, game.map);
  }

  if (bestDirection !== null) {
    if (bestDirection !== currentDirection) {
      return { type: 'rotate', direction: bestDirection, timestamp: Date.now() };
    }
    const nextPos = getNextPosition(currentX, currentY, currentDirection);
    if (canMoveTo(nextPos.x, nextPos.y, game.map)) {
      return { type: 'move', direction: currentDirection, timestamp: Date.now() };
    } else {
      global.currentTarget = null;
      return { type: 'idle', timestamp: Date.now() };
    }
  }
  return { type: 'idle', timestamp: Date.now() };
}

// Helper function to check if a position is in the bullet's path
function isPositionInBulletPath(x, y, bullet) {
  const bulletPath = [];
  let bx = bullet.x;
  let by = bullet.y;
  for (let i = 0; i < 10; i++) {  // Simulate up to 10 steps ahead
    bulletPath.push(`${bx},${by}`);
    switch (bullet.direction) {
      case DIRECTIONS.UP: by--; break;
      case DIRECTIONS.RIGHT: bx++; break;
      case DIRECTIONS.DOWN: by++; break;
      case DIRECTIONS.LEFT: bx--; break;
    }
    if (bx < 0 || bx >= mapWidth || by < 0 || by >= mapHeight || gameMap[by][bx] === 1) break;
  }
  return bulletPath.includes(`${x},${y}`);
}

function findNextExplorationTarget(x, y, map) {
  let minDistance = Infinity;
  let bestTarget = null;
  const radius = 5;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const targetX = x + dx;
      const targetY = y + dy;
      if (canMoveTo(targetX, targetY, map)) {
        const cellKey = `${targetX},${targetY}`;
        if (!global.exploredCells.has(cellKey)) {
          const distance = Math.abs(dx) + Math.abs(dy);
          if (distance < minDistance) {
            minDistance = distance;
            bestTarget = { x: targetX, y: targetY };
          }
        }
      }
    }
  }

  if (!bestTarget) {
    bestTarget = findRandomValidCell(map);
  }
  return bestTarget;
}

function findRandomValidCell(map) {
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(Math.random() * map[0].length);
    const y = Math.floor(Math.random() * map.length);
    if (canMoveTo(x, y, map)) {
      return { x, y };
    }
  }
  return null;
}

function findDirectionToTarget(x, y, target, currentDirection, map) {
  const dx = target.x - x;
  const dy = target.y - y;
  const priorities = [];

  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy < 0) priorities.push(DIRECTIONS.UP);
    if (dy > 0) priorities.push(DIRECTIONS.DOWN);
    if (dx > 0) priorities.push(DIRECTIONS.RIGHT);
    if (dx < 0) priorities.push(DIRECTIONS.LEFT);
  } else {
    if (dx > 0) priorities.push(DIRECTIONS.RIGHT);
    if (dx < 0) priorities.push(DIRECTIONS.LEFT);
    if (dy < 0) priorities.push(DIRECTIONS.UP);
    if (dy > 0) priorities.push(DIRECTIONS.DOWN);
  }

  for (const dir of priorities) {
    const nextPos = getNextPosition(x, y, dir);
    if (canMoveTo(nextPos.x, nextPos.y, map)) {
      return dir;
    }
  }

  return findBestExplorationDirection(x, y, currentDirection, map);
}

function findBestExplorationDirection(x, y, currentDirection, map) {
  const straight = getNextPosition(x, y, currentDirection);
  if (canMoveTo(straight.x, straight.y, map)) {
    return currentDirection;
  }

  const directions = [
    (currentDirection + 3) % 4,
    (currentDirection + 1) % 4,
    (currentDirection + 2) % 4
  ];

  for (const dir of directions) {
    const nextPos = getNextPosition(x, y, dir);
    if (canMoveTo(nextPos.x, nextPos.y, map)) {
      return dir;
    }
  }

  return null;
}

function getNextPosition(x, y, direction) {
  switch (direction) {
    case DIRECTIONS.UP:
      return { x, y: y - 1 };
    case DIRECTIONS.RIGHT:
      return { x: x + 1, y };
    case DIRECTIONS.DOWN:
      return { x, y: y + 1 };
    case DIRECTIONS.LEFT:
      return { x: x - 1, y };
    default:
      return { x, y };
  }
}

function canMoveTo(x, y, map) {
  if (x < 0 || x >= map[0].length || y < 0 || y >= map.length) {
    return false;
  }
  if (map[y][x] === 1) {
    return false;
  }
  return true;
}

socket.on('connect', () => {
  console.log('🧠 Smart Bot connected! Socket ID:', socket.id);
  console.log('🎮 Sending join request...');
  
  const botName = `SmartBot_${socket.id.substring(0, 4)}`;
  socket.emit('join_game', { 
    type: 'join_game',
    data: { playerName: botName },
    timestamp: Date.now()
  });

  // Submit AI code
  socket.emit('submit_ai', {
    type: 'submit_ai',
    data: { aiCode: `(${smartBotAI.toString()})` },
    timestamp: Date.now()
  });
});

socket.on('joined_game', (data) => {
  console.log('🎮 Smart Bot joined game successfully!');
  console.log('🏠 Room:', data.roomId);
  console.log('👤 Player Name:', data.playerData.name);
  console.log('🎨 Color:', data.playerData.color);
  console.log('📍 Starting Position:', `(${data.playerData.x}, ${data.playerData.y})`);
  console.log('🗺️  Map Size:', `${data.gameState.map[0].length}x${data.gameState.map.length}`);
  console.log('');
  
  botPlayer = data.playerData;
  gameMap = data.gameState.map;
  mapWidth = data.gameState.map[0].length;
  mapHeight = data.gameState.map.length;
  
  console.log('🧠 Smart Bot initialized with advanced pathfinding!');
  console.log('⏳ Waiting for game to start...');
});

socket.on('join_error', (data) => {
  console.error('❌ Smart Bot failed to join:', data.message);
});

socket.on('game_state', (gameState) => {
  console.log(`🔄 Game update - Time: ${gameState.gameTime}ms, Players: ${gameState.players.length}`);
  if (gameState.players && botPlayer) {
    const serverPlayer = gameState.players.find(p => p.id === socket.id);
    if (serverPlayer) {
      botPlayer = serverPlayer;
      const cellKey = `${botPlayer.x},${botPlayer.y}`;
      if (!global.exploredCells.has(cellKey)) {
        global.exploredCells.add(cellKey);
        console.log(`🗺️  Explored: (${botPlayer.x}, ${botPlayer.y}) - Total: ${global.exploredCells.size} cells`);
      }
    }
    allPlayers = gameState.players;
  }
});

socket.on('game_started', (data) => {
  console.log('🚀 GAME STARTED! Smart Bot activating AI systems...');
});

socket.on('player_joined', (data) => {
  console.log(`👋 New player joined: ${data.player.name}`);
});

socket.on('player_left', (data) => {
  console.log('👋 Player left:', data.playerId);
});

socket.on('connection_error', (error) => {
  console.log('❌ Connection failed:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('❌ Smart Bot disconnected');
  process.exit(0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Smart Bot shutting down...');
  console.log(`📊 Explored ${global.exploredCells.size} cells before shutdown`);
  socket.disconnect();
  process.exit(0);
});