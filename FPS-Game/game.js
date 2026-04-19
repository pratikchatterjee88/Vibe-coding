const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playerHealthEl = document.getElementById("playerHealth");
const enemyHealthEl = document.getElementById("enemyHealth");
const statusMessageEl = document.getElementById("statusMessage");
const playerHealthBarEl = document.getElementById("playerHealthBar");
const enemyHealthBarEl = document.getElementById("enemyHealthBar");
const ammoTextEl = document.getElementById("ammoText");

const MAP_SIZE = 16;
const TILE_SIZE = 1;
const FOV = Math.PI / 3;
const RAY_COUNT = canvas.width;
const MAX_VIEW_DISTANCE = 20;

const keys = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
  Space: false,
};

const walls = [];
for (let y = 0; y < MAP_SIZE; y++) {
  walls[y] = [];
  for (let x = 0; x < MAP_SIZE; x++) {
    const border = x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1;
    walls[y][x] = border ? 1 : 0;
  }
}

for (let i = 2; i < MAP_SIZE - 2; i += 3) {
  walls[5][i] = 1;
  walls[10][i + 1 < MAP_SIZE - 1 ? i + 1 : i] = 1;
}

const player = {
  x: 2.5,
  y: 2.5,
  angle: 0.2,
  hp: 100,
  speed: 2.8,
  turnSpeed: 2.1,
  cooldown: 0,
  ammo: 12,
  maxAmmo: 12,
  reloadTimer: 0,
  reloading: false,
};

const enemy = {
  x: 13.5,
  y: 13.5,
  angle: Math.PI,
  hp: 100,
  speed: 1.7,
  cooldown: 0,
  strafeTimer: 0,
  strafeDir: 1,
};

const projectiles = [];
let gameOver = false;
let lastTime = performance.now();

function normalizeAngle(a) {
  let angle = a;
  while (angle < -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function isWall(x, y) {
  const gx = Math.floor(x / TILE_SIZE);
  const gy = Math.floor(y / TILE_SIZE);
  if (gx < 0 || gy < 0 || gx >= MAP_SIZE || gy >= MAP_SIZE) return true;
  return walls[gy][gx] === 1;
}

function moveEntity(entity, dx, dy) {
  const nx = entity.x + dx;
  const ny = entity.y + dy;

  if (!isWall(nx, entity.y)) {
    entity.x = nx;
  }
  if (!isWall(entity.x, ny)) {
    entity.y = ny;
  }
}

function raycast(originX, originY, angle) {
  const step = 0.03;
  let depth = 0;
  while (depth < MAX_VIEW_DISTANCE) {
    const x = originX + Math.cos(angle) * depth;
    const y = originY + Math.sin(angle) * depth;
    if (isWall(x, y)) {
      return depth;
    }
    depth += step;
  }
  return MAX_VIEW_DISTANCE;
}

function lineOfSight(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  const steps = Math.ceil(distance / 0.05);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    if (isWall(x, y)) return false;
  }
  return true;
}

function shoot(shooter, targetTag) {
  const muzzleX = shooter.x + Math.cos(shooter.angle) * 0.3;
  const muzzleY = shooter.y + Math.sin(shooter.angle) * 0.3;
  projectiles.push({
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(shooter.angle) * 10,
    vy: Math.sin(shooter.angle) * 10,
    life: 1.4,
    owner: targetTag === "enemy" ? "player" : "enemy",
    targetTag,
  });
}

function updatePlayer(dt) {
  if (keys.ArrowLeft) player.angle -= player.turnSpeed * dt;
  if (keys.ArrowRight) player.angle += player.turnSpeed * dt;
  player.angle = normalizeAngle(player.angle);

  let move = 0;
  if (keys.ArrowUp) move += 1;
  if (keys.ArrowDown) move -= 1;
  if (move !== 0) {
    const dx = Math.cos(player.angle) * player.speed * move * dt;
    const dy = Math.sin(player.angle) * player.speed * move * dt;
    moveEntity(player, dx, dy);
  }

  player.cooldown -= dt;
  if (player.reloading) {
    player.reloadTimer -= dt;
  }
  if (player.ammo <= 0 && !player.reloading) {
    player.reloading = true;
    player.reloadTimer = 1.1;
  }
  if (player.reloading && player.reloadTimer <= 0) {
    player.ammo = player.maxAmmo;
    player.reloading = false;
  }

  if (keys.Space && player.cooldown <= 0 && !player.reloading && player.ammo > 0) {
    shoot(player, "enemy");
    player.cooldown = 0.45;
    player.ammo -= 1;
  }
}

function updateEnemy(dt) {
  if (enemy.hp <= 0) return;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const targetAngle = Math.atan2(dy, dx);
  const diff = normalizeAngle(targetAngle - enemy.angle);
  enemy.angle += Math.max(-1.8 * dt, Math.min(1.8 * dt, diff));

  const distance = Math.hypot(dx, dy);
  const seesPlayer = lineOfSight(enemy.x, enemy.y, player.x, player.y);

  if (!seesPlayer || distance > 4.5) {
    const forward = enemy.speed * dt;
    moveEntity(enemy, Math.cos(enemy.angle) * forward, Math.sin(enemy.angle) * forward);
  } else {
    enemy.strafeTimer -= dt;
    if (enemy.strafeTimer <= 0) {
      enemy.strafeDir *= -1;
      enemy.strafeTimer = 1 + Math.random() * 1.3;
    }
    const sideAngle = enemy.angle + (Math.PI / 2) * enemy.strafeDir;
    moveEntity(enemy, Math.cos(sideAngle) * enemy.speed * 0.6 * dt, Math.sin(sideAngle) * enemy.speed * 0.6 * dt);
  }

  enemy.cooldown -= dt;
  if (enemy.cooldown <= 0 && seesPlayer && Math.abs(diff) < 0.22 && distance < 10) {
    shoot(enemy, "player");
    enemy.cooldown = 0.8 + Math.random() * 0.5;
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    let remove = p.life <= 0 || isWall(p.x, p.y);
    if (!remove && p.targetTag === "enemy" && enemy.hp > 0) {
      if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < 0.38) {
        enemy.hp = Math.max(0, enemy.hp - 20);
        remove = true;
      }
    }

    if (!remove && p.targetTag === "player" && player.hp > 0) {
      if (Math.hypot(p.x - player.x, p.y - player.y) < 0.34) {
        player.hp = Math.max(0, player.hp - 12);
        remove = true;
      }
    }

    if (remove) projectiles.splice(i, 1);
  }
}

function drawBackground() {
  const halfH = canvas.height / 2;
  const sky = ctx.createLinearGradient(0, 0, 0, halfH);
  sky.addColorStop(0, "#233a5d");
  sky.addColorStop(1, "#1a2b46");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, halfH);

  const floor = ctx.createLinearGradient(0, halfH, 0, canvas.height);
  floor.addColorStop(0, "#3a3a3a");
  floor.addColorStop(1, "#1d1d1d");
  ctx.fillStyle = floor;
  ctx.fillRect(0, halfH, canvas.width, halfH);
}

function drawWalls() {
  const projectionScale = (canvas.width / 2) / Math.tan(FOV / 2);

  for (let x = 0; x < RAY_COUNT; x++) {
    const cameraX = (x / RAY_COUNT) * 2 - 1;
    const rayAngle = player.angle + Math.atan(cameraX * Math.tan(FOV / 2));
    let distance = raycast(player.x, player.y, rayAngle);

    const corrected = distance * Math.cos(rayAngle - player.angle);
    const wallHeight = Math.min(canvas.height, (projectionScale / Math.max(0.001, corrected)) * 1.05);
    const top = (canvas.height - wallHeight) / 2;

    const shade = Math.max(25, 220 - corrected * 25);
    ctx.fillStyle = `rgb(${shade}, ${shade - 20}, ${shade - 35})`;
    ctx.fillRect(x, top, 1, wallHeight);
  }
}

function drawEnemySprite() {
  if (enemy.hp <= 0) return;
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const distance = Math.hypot(dx, dy);
  const angleToEnemy = Math.atan2(dy, dx);
  const relative = normalizeAngle(angleToEnemy - player.angle);

  if (Math.abs(relative) > FOV / 2 + 0.2) return;
  if (!lineOfSight(player.x, player.y, enemy.x, enemy.y)) return;

  const centerX = (0.5 + relative / FOV) * canvas.width;
  const size = Math.min(260, 420 / Math.max(0.4, distance));
  const y = canvas.height / 2 - size / 2;

  const wallDepth = raycast(player.x, player.y, angleToEnemy);
  if (distance > wallDepth + 0.1) return;

  const bodyTop = y + size * 0.06;
  const bodyHeight = size * 0.72;
  const bodyWidth = size * 0.34;
  const bodyX = centerX - bodyWidth / 2;
  const hpRatio = enemy.hp / 100;

  // Soft red back-glow keeps hostile readability.
  const glow = ctx.createRadialGradient(centerX, y + size * 0.2, 2, centerX, y + size * 0.2, size * 0.5);
  glow.addColorStop(0, "rgba(255, 45, 45, 0.28)");
  glow.addColorStop(1, "rgba(255, 45, 45, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centerX, y + size * 0.2, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Pants + legs
  ctx.fillStyle = "#25344a";
  ctx.fillRect(centerX - size * 0.11, bodyTop + size * 0.47, size * 0.09, size * 0.26);
  ctx.fillRect(centerX + size * 0.02, bodyTop + size * 0.47, size * 0.09, size * 0.26);
  ctx.fillStyle = "#161b25";
  ctx.fillRect(centerX - size * 0.115, bodyTop + size * 0.72, size * 0.095, size * 0.05);
  ctx.fillRect(centerX + size * 0.02, bodyTop + size * 0.72, size * 0.095, size * 0.05);

  // Shirt
  ctx.fillStyle = "#8b2c3f";
  ctx.fillRect(bodyX, bodyTop, bodyWidth, bodyHeight);
  ctx.fillStyle = "#a64255";
  ctx.fillRect(bodyX + size * 0.025, bodyTop + size * 0.08, bodyWidth - size * 0.05, size * 0.1);

  // Arms
  ctx.fillStyle = "#e4b38f";
  ctx.fillRect(bodyX - size * 0.06, bodyTop + size * 0.09, size * 0.06, size * 0.24);
  ctx.fillRect(bodyX + bodyWidth, bodyTop + size * 0.09, size * 0.06, size * 0.24);

  // Head + hair
  ctx.fillStyle = "#f0bf99";
  ctx.fillRect(centerX - size * 0.095, y - size * 0.19, size * 0.19, size * 0.18);
  ctx.fillStyle = "#2a1b14";
  ctx.fillRect(centerX - size * 0.1, y - size * 0.215, size * 0.2, size * 0.07);
  ctx.fillRect(centerX - size * 0.1, y - size * 0.19, size * 0.035, size * 0.06);
  ctx.fillRect(centerX + size * 0.065, y - size * 0.19, size * 0.035, size * 0.06);

  // Eyes and mouth.
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(centerX - size * 0.05, y - size * 0.125, size * 0.028, size * 0.017);
  ctx.fillRect(centerX + size * 0.022, y - size * 0.125, size * 0.028, size * 0.017);
  ctx.fillRect(centerX - size * 0.028, y - size * 0.067, size * 0.056, size * 0.012);

  // Enemy weapon.
  ctx.fillStyle = "#1d2028";
  ctx.fillRect(centerX + size * 0.12, bodyTop + size * 0.2, size * 0.22, size * 0.06);
  ctx.fillRect(centerX + size * 0.28, bodyTop + size * 0.18, size * 0.07, size * 0.1);

  // Small enemy health bar over sprite.
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(centerX - size * 0.2, y - size * 0.33, size * 0.4, size * 0.05);
  ctx.fillStyle = "#e03748";
  ctx.fillRect(centerX - size * 0.195, y - size * 0.325, size * 0.39 * hpRatio, size * 0.04);
}

function drawCrosshair() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.strokeStyle = "#ffffffee";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#ff364fcc";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy);
  ctx.lineTo(cx - 7, cy);
  ctx.moveTo(cx + 7, cy);
  ctx.lineTo(cx + 22, cy);
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx, cy - 7);
  ctx.moveTo(cx, cy + 7);
  ctx.lineTo(cx, cy + 22);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayerWeapon() {
  const w = canvas.width;
  const h = canvas.height;
  const kick = Math.max(0, player.cooldown) * 12;
  const x = w * 0.64 + kick;
  const y = h * 0.68 + kick * 0.2;

  // Arms/hands
  ctx.fillStyle = "#c8946f";
  ctx.fillRect(w * 0.58, h * 0.78, w * 0.08, h * 0.2);
  ctx.fillRect(w * 0.84, h * 0.8, w * 0.08, h * 0.18);

  // Rifle body
  ctx.fillStyle = "#2c3946";
  ctx.fillRect(x, y, w * 0.25, h * 0.2);
  ctx.fillStyle = "#10151c";
  ctx.fillRect(x + w * 0.11, y - h * 0.08, w * 0.13, h * 0.1);
  ctx.fillStyle = "#3f4d61";
  ctx.fillRect(x + w * 0.2, y + h * 0.035, w * 0.13, h * 0.045);
  ctx.fillStyle = "#0f1116";
  ctx.fillRect(x + w * 0.3, y + h * 0.025, w * 0.13, h * 0.07);
  ctx.fillStyle = "#8597ad";
  ctx.fillRect(x + w * 0.42, y + h * 0.036, w * 0.08, h * 0.024);

  // Trigger guard
  ctx.strokeStyle = "#0d1117";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + w * 0.11, y + h * 0.085, w * 0.06, h * 0.06);

  // Muzzle flash
  if (player.cooldown > 0.38) {
    ctx.fillStyle = "#ffd066";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.52, y + h * 0.048);
    ctx.lineTo(x + w * 0.58, y + h * 0.02);
    ctx.lineTo(x + w * 0.57, y + h * 0.08);
    ctx.closePath();
    ctx.fill();
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    const dx = p.x - player.x;
    const dy = p.y - player.y;
    const dist = Math.hypot(dx, dy);
    const ang = normalizeAngle(Math.atan2(dy, dx) - player.angle);
    if (Math.abs(ang) > FOV / 2 + 0.05) continue;

    const screenX = (0.5 + ang / FOV) * canvas.width;
    const size = Math.max(2, 32 / Math.max(0.5, dist));
    const screenY = canvas.height / 2;
    const wallDepth = raycast(player.x, player.y, Math.atan2(dy, dx));
    if (dist >= wallDepth) continue;

    ctx.fillStyle = p.owner === "player" ? "#f4ff75" : "#ffb36e";
    ctx.beginPath();
    ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function refreshHud() {
  playerHealthEl.textContent = `${player.hp}`;
  enemyHealthEl.textContent = `${enemy.hp}`;
  playerHealthBarEl.style.width = `${player.hp}%`;
  enemyHealthBarEl.style.width = `${enemy.hp}%`;
  ammoTextEl.textContent =
    player.reloading
      ? "Ammo: RELOADING..."
      : `Ammo: ${player.ammo} / INF`;

  if (!gameOver) {
    statusMessageEl.textContent = "Defeat the enemy bot.";
  }

  if (enemy.hp <= 0 && !gameOver) {
    gameOver = true;
    statusMessageEl.textContent = "You win! Refresh page to play again.";
  } else if (player.hp <= 0 && !gameOver) {
    gameOver = true;
    statusMessageEl.textContent = "You were defeated. Refresh page to retry.";
  }
}

function render() {
  drawBackground();
  drawWalls();
  drawEnemySprite();
  drawProjectiles();
  drawCrosshair();
  drawPlayerWeapon();
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  if (!gameOver) {
    updatePlayer(dt);
    updateEnemy(dt);
    updateProjectiles(dt);
  }

  render();
  refreshHud();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    keys.Space = true;
    e.preventDefault();
    return;
  }
  if (Object.hasOwn(keys, e.key)) keys[e.key] = true;
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    keys.Space = false;
    return;
  }
  if (Object.hasOwn(keys, e.key)) keys[e.key] = false;
});

requestAnimationFrame(loop);
