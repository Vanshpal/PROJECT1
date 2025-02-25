// Global variables
let scene, camera, monster, timerElement;
let startTime;
let playerHealth = 3;
let monsterHealth = 15; // Warrior dies after enough hits
let isGameOver = false;
let isBlocking = false;
let bushes = [];
let oceanPieces = [];
let redZones = [];
let darts = [];

// For dropped items, healing, etc.
let droppedItems = [];
let potionPicked = false;
let gunPicked = false;
let artifactPicked = false;
let healingEnabled = false;
let healingUsed = false;

// Attack cooldowns
let attackCooldown = 1000;
let lastMonsterAttackTime = 0;
let lastDragonAttackTime = 0;

// Interval for continuous firing
let firingIntervalId = null;

// Dragon-related
let dragonSpawned = false;
let dragon = null;
let dragonHealth = 15;
let dragonDamageDisabled = false;

// Red zone damage
let redZoneSize = 10;
let redZoneDamageCooldown = 1000;
let lastRedZoneDamageTime = 0;

// Audio
let pistolShotAudio = new Audio("pistol shot.mp3");
let potionAudio = new Audio("Potion.mp3");
let smgAudio = new Audio("SMG.mp3");
let footstepAudio = new Audio("Footstep.mp3");
let hitAudio = new Audio("Hit.mp3");  // Hit sound for when damage is taken
let reloadAudio = new Audio("Reload.mp3"); // Reload sound during cooldown
let shieldHoldAudio = new Audio("Shield Hold.mp3"); // Sound while shield is held

// New: Ammo count and reloading flag for the gun (level 1)
let reloadAmmo = 20;
let reloading = false;

// New: Shield variables – allow blocking (shield) for 5 seconds then 1 second cooldown
let shieldTimeout = null;
let shieldCooldownTimeout = null;
let shieldOnCooldown = false;

// Timer ID
let timerIntervalId;

// Footstep tracking
let lastCameraPos = new THREE.Vector3();

// Flags to indicate if an enemy is in the middle of an attack sequence
let monsterIsAttacking = false;
let dragonIsAttacking = false;

// Flags to track if movement lock is active (to prevent re‑locking within 0.5 second)
let movementLockActive = false;
let dragonMovementLockActive = false;

// Dart class
class Dart {
  constructor() {
    this.obj = document.createElement("a-sphere");
    this.obj.setAttribute("radius", 0.5);
    this.obj.setAttribute("material", "color: red");
    let pos = camera.object3D.position;
    this.obj.setAttribute("position", { x: pos.x, y: pos.y, z: pos.z });
    scene.append(this.obj);

    let theta = camera.object3D.rotation.y + Math.PI;
    let phi = camera.object3D.rotation.x;
    let v = 0.5;
    let v_xz = v * Math.cos(phi);
    this.dz = v_xz * Math.cos(theta);
    this.dx = v_xz * Math.sin(theta);
    this.dy = v * Math.sin(phi);

    console.log("Created dart at", pos, "with velocity", { dx: this.dx, dy: this.dy, dz: this.dz });
  }
  fly() {
    this.obj.object3D.position.x += this.dx;
    this.obj.object3D.position.y += this.dy;
    this.obj.object3D.position.z += this.dz;
  }
}

// Prevent default context menu on right-click
document.addEventListener("contextmenu", (e) => e.preventDefault());

// Right-click to block (shield)
// If not in red zone and shield is not on cooldown, enable blocking,
// play/restart the shieldHold sound, and start a 5s timer.
document.addEventListener("mousedown", (e) => {
  if (e.button === 2) {
    if (isInRedZone()) {
      console.log("Blocking disabled in red zone.");
      return;
    }
    if (shieldOnCooldown) {
      console.log("Shield is on cooldown.");
      return;
    }
    isBlocking = true;
    stopFiring();
    // Restart the shield hold sound
    shieldHoldAudio.currentTime = 0;
    shieldHoldAudio.play();
    // Start shield timer for 5 seconds
    shieldTimeout = setTimeout(() => {
      isBlocking = false;
      shieldHoldAudio.pause();
      shieldHoldAudio.currentTime = 0;
      console.log("Shield time expired. Cooldown initiated.");
      shieldOnCooldown = true;
      shieldCooldownTimeout = setTimeout(() => {
        shieldOnCooldown = false;
        console.log("Shield cooldown ended.");
      }, 1000);
    }, 5000);
  }
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 2) {
    if (isBlocking) {
      isBlocking = false;
      // Stop the shield sound on release
      shieldHoldAudio.pause();
      shieldHoldAudio.currentTime = 0;
      // Clear the shield timer if released early
      if (shieldTimeout) {
        clearTimeout(shieldTimeout);
        shieldTimeout = null;
      }
      shieldOnCooldown = true;
      shieldCooldownTimeout = setTimeout(() => {
        shieldOnCooldown = false;
        console.log("Shield cooldown ended.");
      }, 1000);
    }
  }
});

// Left-click to shoot
document.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    if (isBlocking) return;
    if (isInRedZone()) {
      console.log("Shooting disabled: Player is in red zone.");
      return;
    }
    if (gunPicked) {
      startFiring();
    } else {
      shootDart();
    }
  }
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 0 && gunPicked) {
    stopFiring();
  }
});

// Press E to heal
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "e") {
    healPlayer();
  }
});

// Helper function to update the reload indicator
function updateReloadIndicator() {
  const reloadElem = document.getElementById("reload-indicator");
  if (reloadElem) {
    reloadElem.innerText = reloadAmmo + "/∞";
  }
}

// Updated: Shoot a dart with unified reloading logic for both guns
function shootDart() {
  const playerPos = camera.object3D.position;
  let inBush = false;
  for (let i = 0; i < bushes.length; i++) {
    const bushPos = bushes[i].object3D.position;
    const dx = playerPos.x - bushPos.x;
    const dz = playerPos.z - bushPos.z;
    if (Math.sqrt(dx * dx + dz * dz) < 2.5) {
      inBush = true;
      break;
    }
  }
  let inOcean = false;
  for (let i = 0; i < oceanPieces.length; i++) {
    const oceanPos = oceanPieces[i].object3D.position;
    if (Math.abs(playerPos.x - oceanPos.x) < 10 && Math.abs(playerPos.z - oceanPos.z) < 10) {
      inOcean = true;
      break;
    }
  }
  if (isInRedZone()) {
    console.log("Shooting disabled: Player is in red zone.");
    return false;
  }
  if (inBush || inOcean) {
    console.log("Shooting disabled: Player is in a bush or ocean.");
    return false;
  }
  
  // Unified reloading logic for both guns
  if (reloading) {
    console.log("Reloading...");
    return false;
  }
  if (reloadAmmo <= 0) {
    reloading = true;
    console.log("Out of ammo, reloading...");
    // Play reload sound during cooldown
    reloadAudio.play();
    setTimeout(() => {
      reloadAmmo = 20;
      reloading = false;
      updateReloadIndicator();
    }, 1500);
    return false;
  }
  
  reloadAmmo--;
  updateReloadIndicator();
  
  // If not using the gun, play the pistol sound. (SMG audio is handled in startFiring().)
  if (!gunPicked) {
    pistolShotAudio.play();
  }
  
  let newDart = new Dart();
  darts.push(newDart);
  return true;
}

// Start continuous firing (SMG)
function startFiring() {
  if (firingIntervalId !== null) return;
  let shotFired = shootDart();
  if (gunPicked) {
    if (shotFired) {
      if (smgAudio.paused) {
        smgAudio.loop = true;
        smgAudio.play();
      }
    } else {
      if (!smgAudio.paused) {
        smgAudio.pause();
        smgAudio.currentTime = 0;
      }
    }
  }
  firingIntervalId = setInterval(() => {
    let shot = shootDart();
    if (gunPicked) {
      if (shot) {
        if (smgAudio.paused) {
          smgAudio.loop = true;
          smgAudio.play();
        }
      } else {
        if (!smgAudio.paused) {
          smgAudio.pause();
          smgAudio.currentTime = 0;
        }
      }
    }
  }, 150);
}

// Stop continuous firing
function stopFiring() {
  if (firingIntervalId !== null) {
    clearInterval(firingIntervalId);
    firingIntervalId = null;
  }
  if (gunPicked) {
    if (!smgAudio.paused) {
      smgAudio.pause();
      smgAudio.currentTime = 0;
    }
  }
}

// Dragon spawning (unchanged)
function spawnDragon() {
  dragon = document.createElement("a-entity");
  dragon.setAttribute("gltf-model", "Dragon.glb");
  dragon.setAttribute("position", "0 0 -30");
  dragon.setAttribute("rotation", "0 0 0");
  dragon.setAttribute("scale", "6 6 6");
  scene.appendChild(dragon);
  console.log("Dragon spawned in Level 2!");
  document.getElementById("dragon-health").style.display = "block";
  updateDragonHealthBar();
}

function updateDragonHealthBar() {
  const healthBar = document.getElementById("dragon-health-bar");
  let blocks = "";
  for (let i = 0; i < dragonHealth; i++) {
    blocks += "█";
  }
  healthBar.textContent = blocks;
}

// Add red zones
function addRedZones() {
  const numRedZones = 9;
  const range = 90;
  const minDistance = 15;
  for (let i = 0; i < numRedZones; i++) {
    let x, z, positionFound = false, attempts = 0;
    while (!positionFound && attempts < 100) {
      x = Math.random() * (range * 2) - range;
      z = Math.random() * (range * 2) - range;
      let valid = true;
      for (let j = 0; j < redZones.length; j++) {
        let zonePos = redZones[j].object3D.position;
        let dx = zonePos.x - x;
        let dz = zonePos.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < minDistance) {
          valid = false;
          break;
        }
      }
      if (valid) {
        positionFound = true;
      }
      attempts++;
    }
    let redZone = document.createElement("a-ocean");
    redZone.setAttribute("width", redZoneSize);
    redZone.setAttribute("depth", redZoneSize);
    redZone.setAttribute("position", `${x} 0.4 ${z}`);
    redZone.setAttribute("rotation", "-90 0 0");
    redZone.setAttribute("material", "color: red; opacity: 0.8");
    scene.appendChild(redZone);
    redZones.push(redZone);
  }
}

function isInRedZone() {
  const playerPos = camera.object3D.position;
  for (let i = 0; i < redZones.length; i++) {
    let zonePos = redZones[i].object3D.position;
    if (
      playerPos.x >= zonePos.x - redZoneSize / 2 &&
      playerPos.x <= zonePos.x + redZoneSize / 2 &&
      playerPos.z >= zonePos.z - redZoneSize / 2 &&
      playerPos.z <= zonePos.z + redZoneSize / 2
    ) {
      return true;
    }
  }
  return false;
}

window.onload = function () {
  scene = document.querySelector("a-scene");
  camera = document.querySelector("a-camera");
  monster = document.querySelector("#monster");
  timerElement = document.getElementById("timer");
  startTime = Date.now();

  // Initialize footstep tracking
  lastCameraPos.copy(camera.object3D.position);

  // Make sure the Warrior model doesn't vanish if out of view
  if (monster) {
    monster.object3D.traverse((child) => {
      child.frustumCulled = false;
    });
  }

  updateHealthBar();
  updateMonsterHealthBar();
  updateReloadIndicator(); // Initialize reload indicator
  timerIntervalId = setInterval(updateTimer, 1000);
  addBushes();
  addOceanPieces();
  addRedZones();
  loop();
};

function updateTimer() {
  if (isGameOver) return;
  const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, "0");
  const seconds = (elapsedTime % 60).toString().padStart(2, "0");
  timerElement.innerText = `${minutes}:${seconds}`;
}

function disablePlayerMovement() {
  if (camera.components && camera.components["wasd-controls"]) {
    camera.components["wasd-controls"].pause();
  }
}

function enablePlayerMovement() {
  if (camera.components && camera.components["wasd-controls"]) {
    camera.components["wasd-controls"].play();
  }
}

// Main game loop
function loop() {
  // Update each dart
  for (let i = darts.length - 1; i >= 0; i--) {
    let dart = darts[i];
    dart.fly();

    // Collision with Warrior
    if (monster && monsterHealth > 0) {
      const dartPos = dart.obj.object3D.position;
      const effectiveMonsterPos = new THREE.Vector3();
      effectiveMonsterPos.copy(monster.object3D.position);
      effectiveMonsterPos.y += 4; // Adjust if needed for your Warrior's height

      const dx = dartPos.x - effectiveMonsterPos.x;
      const dy = dartPos.y - effectiveMonsterPos.y;
      const dz = dartPos.z - effectiveMonsterPos.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < 2.0) {
        // Warrior is hit by a dart
        dart.obj.parentNode.removeChild(dart.obj);
        darts.splice(i, 1);
        monsterHealth--;
        updateMonsterHealthBar();
        console.log("Monster hit! Health is now:", monsterHealth);
        if (monsterHealth <= 0) {
          console.log("Warrior died.");
          let dropPos = monster.object3D.position.clone();
          dropPos.y = 0.5;
          dropItem("potion.png", dropPos);
          let gunDropPos = dropPos.clone();
          gunDropPos.x += 1;
          dropItem("gun2.webp", gunDropPos);
          monster.parentNode.removeChild(monster);
          monster = null;
        }
        continue;
      }
    }

    // Collision with Dragon
    if (dragon && dragonHealth > 0) {
      const dartPos = dart.obj.object3D.position;
      const effectiveDragonPos = new THREE.Vector3();
      effectiveDragonPos.copy(dragon.object3D.position);
      effectiveDragonPos.y += 4; 
      
      const dx = dartPos.x - effectiveDragonPos.x;
      const dy = dartPos.y - effectiveDragonPos.y;
      const dz = dartPos.z - effectiveDragonPos.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < 2.0) {
        dart.obj.parentNode.removeChild(dart.obj);
        darts.splice(i, 1);
        dragonHealth--;
        updateDragonHealthBar();
        console.log("Dragon hit! Health is now:", dragonHealth);
        if (dragonHealth <= 0) {
          console.log("Dragon died.");
          let dropPos = dragon.object3D.position.clone();
          dropPos.y = 0.5;
          dropItem("Artifact.webp", dropPos);
          dragon.parentNode.removeChild(dragon);
          dragon = null;
        }
        continue;
      }
    }
  }

  // Check collision with dropped items
  for (let i = droppedItems.length - 1; i >= 0; i--) {
    let item = droppedItems[i];
    let distance = camera.object3D.position.distanceTo(item.object3D.position);
    if (distance < 2.0) {
      console.log("Item picked up:", item.dataset.type);
      let type = item.dataset.type;
      if (type === "potion.png") potionPicked = true;
      else if (type === "gun2.webp") gunPicked = true;
      else if (type === "Artifact.webp") {
        artifactPicked = true;
        clearInterval(timerIntervalId);
        document.getElementById("timer").style.color = "red";
      }
      item.parentNode.removeChild(item);
      droppedItems.splice(i, 1);
    }
  }
  
  // Red zone damage
  if (Date.now() - startTime > 2000 && isInRedZone()) {
    let currentTime = Date.now();
    if (currentTime - lastRedZoneDamageTime >= redZoneDamageCooldown) {
      lastRedZoneDamageTime = currentTime;
      console.log("Red zone damage!");
      damagePlayer();
    }
  }
  
  // Level 2 activation
  if (potionPicked && gunPicked && !healingEnabled) {
    dragonDamageDisabled = true;
    setTimeout(() => { dragonDamageDisabled = false; }, 1500);
    healingEnabled = true;
    console.log("Healing enabled! Press E to heal (adds one heart, up to 4).");
    showLevelText();
    document.getElementById("monster-health").style.display = "none";
    if (!dragonSpawned) {
      spawnDragon();
      dragonSpawned = true;
    }
  }
  
  // If the gun is picked up, update the gun image
  if (gunPicked) {
    let gunImg = document.getElementById("gun");
    if (gunImg && gunImg.src.indexOf("gun2.webp") === -1) {
      gunImg.src = "gun2.webp";
      gunImg.style.width = "150%";
      gunImg.style.height = "auto";
      console.log("Gun updated to gun2.webp, scaled down to 150% width.");
    }
  }

  // --- Warrior (Level 1 enemy) behavior with explicit attack state and 0.5-second movement lock cooldown ---
  if (monster && monsterHealth > 0) {
    const playerPos = camera.object3D.position;
    const monsterPos = monster.object3D.position;
    const dx = playerPos.x - monsterPos.x;
    const dz = playerPos.z - monsterPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < 4) {
      if (!monsterIsAttacking && (Date.now() - lastMonsterAttackTime >= attackCooldown)) {
        monsterIsAttacking = true;
        lastMonsterAttackTime = Date.now();
        // Set attack animation
        monster.removeAttribute("animation-mixer");
        monster.setAttribute("animation-mixer", {
          clip: "[Action Stash].006",
          loop: "once",
          clampWhenFinished: false
        });
        // Lock movement only once per attack cycle for 0.5 second
        if (!movementLockActive) {
          disablePlayerMovement();
          movementLockActive = true;
          setTimeout(() => {
            enablePlayerMovement();
            movementLockActive = false;
          }, 500);
        }
        // Delay damage until the attack animation is complete (1 second)
        setTimeout(() => {
          if (!isGameOver) damagePlayer();
          monsterIsAttacking = false;
        }, 1000);
      }
    } else {
      if (!monsterIsAttacking) {
        // Check if player is in a bush or in the ocean; if so, set idle animation
        let inBush = false;
        for (let i = 0; i < bushes.length; i++) {
          const bushPos = bushes[i].object3D.position;
          const bx = playerPos.x - bushPos.x;
          const bz = playerPos.z - bushPos.z;
          if (Math.sqrt(bx * bx + bz * bz) < 2.5) {
            inBush = true;
            break;
          }
        }
        let inOcean = false;
        for (let i = 0; i < oceanPieces.length; i++) {
          const oceanPos = oceanPieces[i].object3D.position;
          if (Math.abs(playerPos.x - oceanPos.x) < 10 && Math.abs(playerPos.z - oceanPos.z) < 10) {
            inOcean = true;
            break;
          }
        }
        if (inBush || inOcean) {
          if (
            !monster.hasAttribute("animation-mixer") ||
            monster.getAttribute("animation-mixer").clip !== "[Action Stash].001"
          ) {
            monster.removeAttribute("animation-mixer");
            monster.setAttribute("animation-mixer", {
              clip: "[Action Stash].001",
              loop: "repeat",
              clampWhenFinished: false
            });
          }
        } else {
          // Chase behavior if player is not hidden
          const directionX = dx / distance;
          const directionZ = dz / distance;
          const speed = 0.08;
          monster.object3D.position.x += directionX * speed;
          monster.object3D.position.z += directionZ * speed;
          monster.object3D.rotation.y = Math.atan2(dx, dz);
          if (
            !monster.hasAttribute("animation-mixer") ||
            monster.getAttribute("animation-mixer").clip !== "[Action Stash].002"
          ) {
            monster.removeAttribute("animation-mixer");
            monster.setAttribute("animation-mixer", {
              clip: "[Action Stash].002",
              loop: "repeat",
              clampWhenFinished: false
            });
          }
        }
      }
    }
  }
  
  // --- Dragon (Level 2 enemy) behavior with explicit attack state and 0.5-second movement lock cooldown ---
  if (dragon) {
    const playerPos = camera.object3D.position;
    const dragonPos = dragon.object3D.position;
    const dx = playerPos.x - dragonPos.x;
    const dz = playerPos.z - dragonPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    let inBush = false;
    for (let i = 0; i < bushes.length; i++) {
      const bushPos = bushes[i].object3D.position;
      const bx = playerPos.x - bushPos.x;
      const bz = playerPos.z - bushPos.z;
      if (Math.sqrt(bx * bx + bz * bz) < 2.5) {
        inBush = true;
        break;
      }
    }
    let inOcean = false;
    for (let i = 0; i < oceanPieces.length; i++) {
      const oceanPos = oceanPieces[i].object3D.position;
      if (Math.abs(playerPos.x - oceanPos.x) < 10 && Math.abs(playerPos.z - oceanPos.z) < 10) {
        inOcean = true;
        break;
      }
    }

    if (inBush || inOcean) {
      if (
        !dragon.hasAttribute("animation-mixer") ||
        dragon.getAttribute("animation-mixer").clip !== "[Action Stash].001_GLTF_created_0"
      ) {
        dragon.setAttribute("animation-mixer", { clip: "[Action Stash].001_GLTF_created_0", loop: "once" });
      }
    } else {
      if (distance < 4) {
        if (!dragonIsAttacking && (Date.now() - lastDragonAttackTime >= attackCooldown)) {
          dragonIsAttacking = true;
          lastDragonAttackTime = Date.now();
          // Set attack animation for Dragon
          dragon.removeAttribute("animation-mixer");
          dragon.setAttribute("animation-mixer", {
            clip: "[Action Stash].001_GLTF_created_0",
            loop: "once"
          });
          if (!dragonMovementLockActive) {
            disablePlayerMovement();
            dragonMovementLockActive = true;
            setTimeout(() => {
              enablePlayerMovement();
              dragonMovementLockActive = false;
            }, 500);
          }
          setTimeout(() => {
            if (!isGameOver && !dragonDamageDisabled) damagePlayer();
            dragonIsAttacking = false;
          }, 1000);
        }
      } else {
        const directionX = dx / distance;
        const directionZ = dz / distance;
        const speed = 0.09;
        dragon.object3D.position.x += directionX * speed;
        dragon.object3D.position.z += directionZ * speed;
        const angle = Math.atan2(dx, dz);
        dragon.object3D.rotation.y = angle;
        if (
          !dragon.hasAttribute("animation-mixer") ||
          dragon.getAttribute("animation-mixer").clip !== "[Action Stash].003_GLTF_created_0"
        ) {
          dragon.setAttribute("animation-mixer", { clip: "[Action Stash].003_GLTF_created_0", loop: "repeat" });
        }
      }
    }
  }
  
  // Footstep sound logic
  if (camera) {
    let currentPos = camera.object3D.position;
    let dist = currentPos.distanceTo(lastCameraPos);
    if (dist > 0.05) {
      if (footstepAudio.paused) {
        footstepAudio.loop = true;
        footstepAudio.play();
      }
    } else {
      if (!footstepAudio.paused) {
        footstepAudio.pause();
        footstepAudio.currentTime = 0;
      }
    }
    lastCameraPos.copy(currentPos);
  }
  
  if (!isGameOver) window.requestAnimationFrame(loop);
}

function damagePlayer() {
  if (isGameOver || isBlocking) return;
  playerHealth--;
  updateHealthBar();
  hitAudio.currentTime = 0;  // Reset sound for consecutive hits
  hitAudio.play(); // Play hit sound when damage is taken
  if (playerHealth <= 0) gameOver();
}

function updateHealthBar() {
  const healthBar = document.getElementById("player-health-bar");
  healthBar.innerHTML = "";
  for (let i = 0; i < playerHealth; i++) {
    let heartImg = document.createElement("img");
    heartImg.src = "Heart.png";
    heartImg.alt = "Heart";
    heartImg.classList.add("heart-icon");
    healthBar.appendChild(heartImg);
  }
}

function updateMonsterHealthBar() {
  const healthBar = document.getElementById("monster-health-bar");
  let blocks = "";
  for (let i = 0; i < monsterHealth; i++) {
    blocks += "█";
  }
  healthBar.textContent = blocks;
}

function gameOver() {
  isGameOver = true;
  document.getElementById("game-over").style.display = "block";
}

function restartGame() {
  location.reload();
}

function dropItem(src, position) {
  const item = document.createElement("a-image");
  item.setAttribute("src", src);
  item.setAttribute("width", "1");
  item.setAttribute("height", "1");
  item.setAttribute("position", `${position.x} ${position.y} ${position.z}`);
  item.setAttribute("rotation", "0 0 0");
  item.dataset.type = src;
  scene.appendChild(item);
  droppedItems.push(item);
}

function showLevelText() {
  let levelDiv = document.createElement("div");
  levelDiv.id = "level-text";
  levelDiv.style.position = "absolute";
  levelDiv.style.top = "50%";
  levelDiv.style.left = "50%";
  levelDiv.style.transform = "translate(-50%, -50%)";
  levelDiv.style.fontSize = "48px";
  levelDiv.style.color = "white";
  levelDiv.style.zIndex = "200";
  levelDiv.innerText = "Level 2";
  document.body.appendChild(levelDiv);
  setTimeout(() => {
    levelDiv.parentNode.removeChild(levelDiv);
  }, 1000);
}

function addBushes() {
  const numBushes = 50;
  const range = 90;
  const minDistance = 5;
  for (let i = 0; i < numBushes; i++) {
    let x, z, positionFound = false, attempts = 0;
    while (!positionFound && attempts < 100) {
      x = Math.random() * (range * 2) - range;
      z = Math.random() * (range * 2) - range;
      let valid = true;
      for (let j = 0; j < bushes.length; j++) {
        let bushPos = bushes[j].object3D.position;
        let dx = bushPos.x - x;
        let dz = bushPos.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < minDistance) {
          valid = false;
          break;
        }
      }
      if (valid) positionFound = true;
      attempts++;
    }
    let bush = document.createElement("a-entity");
    bush.setAttribute("gltf-model", "bush.glb");
    bush.setAttribute("position", `${x} 0 ${z}`);
    bush.setAttribute("scale", "3.2 3.2 3.2");
    scene.appendChild(bush);
    bushes.push(bush);
  }
}

function addOceanPieces() {
  const numOceanPieces = 25;
  const range = 90;
  const minDistance = 15;
  for (let i = 0; i < numOceanPieces; i++) {
    let x, z, positionFound = false, attempts = 0;
    while (!positionFound && attempts < 100) {
      x = Math.random() * (range * 2) - range;
      z = Math.random() * (range * 2) - range;
      let valid = true;
      for (let j = 0; j < oceanPieces.length; j++) {
        let oceanPos = oceanPieces[j].object3D.position;
        let dx = oceanPos.x - x;
        let dz = oceanPos.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < minDistance) {
          valid = false;
          break;
        }
      }
      if (valid) {
        positionFound = true;
      }
      attempts++;
    }
    let ocean = document.createElement("a-ocean");
    ocean.setAttribute("width", "20");
    ocean.setAttribute("depth", "20");
    ocean.setAttribute("position", `${x} 0.4 ${z}`);
    ocean.setAttribute("rotation", "-90 0 0");
    ocean.setAttribute("scale", "1 1 1");
    scene.appendChild(ocean);
    oceanPieces.push(ocean);
  }
}

function healPlayer() {
  if (healingEnabled && !healingUsed) {
    if (playerHealth < 4) {
      playerHealth++;
      updateHealthBar();
      potionAudio.play();
      console.log("Player healed! Health is now:", playerHealth);
    } else {
      console.log("Player already has the maximum bonus heart (4 total).");
    }
    healingUsed = true;
  }
}
