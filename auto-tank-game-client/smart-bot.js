// =====================================================
// 🤖 SMART BOT PRO - ADVANCED INTELLIGENT AI
// =====================================================
const { io } = require("socket.io-client");
const SERVER_URL = "http://localhost:8080";
const socket = io(SERVER_URL);

console.log("🧠 SMART BOT PRO Initialized");
console.log("===================================");

let botPlayer = null;
let latestGameState = null;

const botMemory = {
  explored: new Set(),
  lastPos: null,
  stuckCounter: 0,
  target: null,
  safeMode: false,
};

const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
const DIR_NAMES = ["UP", "RIGHT", "DOWN", "LEFT"];

// =====================================================
// 🎯 SMART BOT AI CORE
// =====================================================
function smartBotAI(player, game) {
  if (!player || !game || !game.map) return { type: "idle" };

  const { x, y, direction } = player;
  const map = game.map;

  botMemory.explored.add(`${x},${y}`);
  checkIfStuck(x, y);

  // --- 1️⃣ Bullet avoidance (threat prediction)
  const dodge = avoidBullets(player, game.bullets, map);
  if (dodge) return dodge;

  // --- 2️⃣ Engage enemy if visible
  const enemy = getClosestEnemy(player, game.players);
  if (enemy && canSeeEnemy(player, enemy, map)) {
    return aimAndShoot(player, enemy);
  }

  // --- 3️⃣ Explore map with A* pathfinding
  if (!botMemory.target || reachedTarget(player, botMemory.target)) {
    botMemory.target = getNewTarget(map);
  }

  const path = findPathAStar(map, { x, y }, botMemory.target);
  if (path && path.length > 1) {
    const nextStep = path[1];
    const newDir = getDirectionTo(x, y, nextStep.x, nextStep.y);
    if (newDir !== direction) return { type: "rotate", direction: newDir };
    return { type: "move", direction: newDir };
  }

  // --- 4️⃣ Random move fallback
  return { type: "move", direction: Math.floor(Math.random() * 4) };
}

// =====================================================
// 🧩 SUPPORT FUNCTIONS
// =====================================================
function checkIfStuck(x, y) {
  if (!botMemory.lastPos) botMemory.lastPos = { x, y };
  if (x === botMemory.lastPos.x && y === botMemory.lastPos.y) {
    botMemory.stuckCounter++;
    if (botMemory.stuckCounter > 2) {
      botMemory.target = null;
      botMemory.stuckCounter = 0;
      console.log("⚠️ Bot unstuck triggered");
    }
  } else {
    botMemory.lastPos = { x, y };
    botMemory.stuckCounter = 0;
  }
}

function avoidBullets(player, bullets, map) {
  for (const b of bullets || []) {
    if (b.ownerId === player.id) continue;
    const dangerDist = 3;
    const { x, y } = player;
    switch (b.direction) {
      case DIR.UP:
        if (b.x === x && b.y > y && b.y - y <= dangerDist)
          return trySidestep(player, map, [DIR.LEFT, DIR.RIGHT]);
        break;
      case DIR.DOWN:
        if (b.x === x && y > b.y && y - b.y <= dangerDist)
          return trySidestep(player, map, [DIR.LEFT, DIR.RIGHT]);
        break;
      case DIR.LEFT:
        if (b.y === y && b.x > x && b.x - x <= dangerDist)
          return trySidestep(player, map, [DIR.UP, DIR.DOWN]);
        break;
      case DIR.RIGHT:
        if (b.y === y && x > b.x && x - b.x <= dangerDist)
          return trySidestep(player, map, [DIR.UP, DIR.DOWN]);
        break;
    }
  }
  return null;
}

function trySidestep(player, map, dirs) {
  for (const d of dirs) {
    const next = getNextPos(player.x, player.y, d);
    if (canMove(next.x, next.y, map))
      return player.direction === d
        ? { type: "move", direction: d }
        : { type: "rotate", direction: d };
  }
  return null;
}

function getClosestEnemy(me, players) {
  let nearest = null;
  let minDist = Infinity;
  for (const p of players) {
    if (p.id === me.id || !p.isAlive) continue;
    const d = Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
    if (d < minDist) {
      minDist = d;
      nearest = p;
    }
  }
  return nearest;
}

function canSeeEnemy(me, enemy, map) {
  if (me.x === enemy.x) {
    const [minY, maxY] = [Math.min(me.y, enemy.y), Math.max(me.y, enemy.y)];
    for (let y = minY + 1; y < maxY; y++) if (map[y][me.x] === 1) return false;
    return true;
  }
  if (me.y === enemy.y) {
    const [minX, maxX] = [Math.min(me.x, enemy.x), Math.max(me.x, enemy.x)];
    for (let x = minX + 1; x < maxX; x++) if (map[me.y][x] === 1) return false;
    return true;
  }
  return false;
}

function aimAndShoot(me, target) {
  const dx = target.x - me.x;
  const dy = target.y - me.y;
  let dir;
  if (Math.abs(dx) > Math.abs(dy))
    dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
  else dir = dy > 0 ? DIR.DOWN : DIR.UP;

  return dir === me.direction
    ? { type: "shoot" }
    : { type: "rotate", direction: dir };
}

function reachedTarget(player, target) {
  return target && player.x === target.x && player.y === target.y;
}

function getNewTarget(map) {
  for (let i = 0; i < 100; i++) {
    const x = Math.floor(Math.random() * map[0].length);
    const y = Math.floor(Math.random() * map.length);
    if (canMove(x, y, map)) return { x, y };
  }
  return { x: 1, y: 1 };
}

function canMove(x, y, map) {
  return (
    map &&
    y >= 0 &&
    y < map.length &&
    x >= 0 &&
    x < map[0].length &&
    map[y][x] === 0
  );
}

function getNextPos(x, y, dir) {
  switch (dir) {
    case DIR.UP:
      return { x, y: y - 1 };
    case DIR.RIGHT:
      return { x: x + 1, y };
    case DIR.DOWN:
      return { x, y: y + 1 };
    case DIR.LEFT:
      return { x: x - 1, y };
    default:
      return { x, y };
  }
}

function getDirectionTo(x1, y1, x2, y2) {
  if (x2 > x1) return DIR.RIGHT;
  if (x2 < x1) return DIR.LEFT;
  if (y2 > y1) return DIR.DOWN;
  return DIR.UP;
}

// =====================================================
// 🧠 A* PATHFINDING
// =====================================================
function findPathAStar(map, start, goal) {
  const open = [start];
  const cameFrom = new Map();
  const g = new Map();
  const key = (x, y) => `${x},${y}`;

  g.set(key(start.x, start.y), 0);

  while (open.length > 0) {
    const current = open.shift();
    if (current.x === goal.x && current.y === goal.y)
      return reconstructPath(cameFrom, current);

    for (const d of [0, 1, 2, 3]) {
      const n = getNextPos(current.x, current.y, d);
      if (!canMove(n.x, n.y, map)) continue;
      const gScore = g.get(key(current.x, current.y)) + 1;
      const nk = key(n.x, n.y);
      if (gScore < (g.get(nk) ?? Infinity)) {
        cameFrom.set(nk, current);
        g.set(nk, gScore);
        open.push(n);
      }
    }
  }
  return null;
}

function reconstructPath(cameFrom, current) {
  const path = [current];
  while (cameFrom.has(`${current.x},${current.y}`)) {
    current = cameFrom.get(`${current.x},${current.y}`);
    path.unshift(current);
  }
  return path;
}

// =====================================================
// 🔗 SOCKET CONNECTIONS
// =====================================================
socket.on("connect", () => {
  const botName = `SmartPro_${socket.id.slice(0, 4)}`;
  console.log(`✅ Connected → ${botName}`);
  socket.emit("join_game", { playerName: botName });
});

socket.on("joined_game", (data) => {
  botPlayer = data.playerData;
  console.log(`🎮 Joined as ${botPlayer.name} → ${data.roomId}`);
});

socket.on("game_state", (gameState) => {
  latestGameState = gameState;
  const me = gameState.players.find((p) => p.id === socket.id);
  if (me) botPlayer = me;
});

setInterval(() => {
  if (!botPlayer || !latestGameState) return;
  const action = smartBotAI(botPlayer, latestGameState);
  if (action && action.type !== "idle") {
    socket.emit("player_action", { action });
    console.log(
      `🤖 ${action.type}${action.direction !== undefined ? ` (${DIR_NAMES[action.direction]})` : ""
      }`
    );
  }
}, 250);

socket.on("disconnect", () => {
  console.log("❌ Disconnected");
  process.exit(0);
});
