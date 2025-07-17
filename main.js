import * as THREE from 'three';
import seedrandom from 'https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/+esm';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { AfterimagePass } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/postprocessing/AfterimagePass.js';

// Game Configuration
const STAR_COUNT = 4000;
const STAR_RADIUS = 2000;
const MAX_SPEED = 2000;
const ACCELERATION = 1.02;
const FUEL_DEPLETION = 0.0000003;
const FUEL_GAIN = 10;
const MAX_FUEL = 101;
const MAX_ROLL_VELOCITY = Math.PI * 1.0;
const YAW_SPEED = Math.PI * 0.005;
const PITCH_SPEED = Math.PI * 0.005;
const INITIAL_ROLL_SPEED = Math.PI * 0.05;
const CONTROL_DAMPING = 0.8;
const BASE_STAR_SIZE = 6;
const EXPLOSION_SCALE_FACTOR = 2.5;
const EXPLOSION_SHRINK_SPEED = 5;
const DISAPPEAR_DISTANCE = STAR_RADIUS * 2;
const FOG_COLOR = 0x000000;
const FOG_NEAR = STAR_RADIUS * 0.1;
const FOG_FAR = STAR_RADIUS * 1.0;

// Star Definitions
const STAR_TYPES = [
    { name: 'Blue Giant', color: new THREE.Color(0.6, 0.8, 1.0), spawnWeight: 9, providesFuel: false },
    { name: 'White Dwarf', color: new THREE.Color(0.9, 0.9, 1.0), spawnWeight: 23, providesFuel: false },
    { name: 'Yellow Sun', color: new THREE.Color(1.0, 1.0, 0.7), spawnWeight: 41, providesFuel: false },
    { name: 'Orange Star', color: new THREE.Color(1.0, 0.85, 0.4), spawnWeight: 26, providesFuel: false },
    { name: 'Red Dwarf', color: new THREE.Color(1.0, 0.4, 0.2), spawnWeight: 2, providesFuel: true }
];
const TOTAL_STAR_SPAWN_WEIGHT = STAR_TYPES.reduce((sum, type) => sum + type.spawnWeight, 0);

// Game State Variables
const COLLECTED = new Array(STAR_COUNT).fill(false);
const STAR_DATA = new Array(STAR_COUNT);

let scene, camera, renderer, composer;
let stars;
let orientation = new THREE.Quaternion();
let speed = 0;
let fuel = MAX_FUEL;
let paused = true;
let rollVelocity = 0;
let yawVelocity = 0;
let pitchVelocity = 0;
let accelerating = false;
let decelerating = false;
let dampenRoll = true;
let rollingLeft = false;
let rollingRight = false;
let currentStarDisplaySize = 5;
let spacebarHandled = false;
let totalDistance = 0;
let redStarsCollected = 0;
let totalScore = 0;
let lastStarTouchTime = 0;
const tempCameraPosition = new THREE.Vector3(); // Replaced prevCameraPosition with a temp vector for distance calculation

// DOM Elements
let speedBar, fuelLevel, distanceTracker, redStarCounter, finalDistanceElement, finalRedStarsElement, finalScoreElement;
let flash, startScreen, startMessage, restartButton;

// Initialize Game
init();
animate();

function getRandomStarType() {
    let random = Math.random() * TOTAL_STAR_SPAWN_WEIGHT;
    for (const type of STAR_TYPES) {
        random -= type.spawnWeight;
        if (random <= 0) {
            return type;
        }
    }
    return STAR_TYPES[0];
}

function init() {
    // Get DOM Elements
    flash = document.getElementById('flash');
    startScreen = document.getElementById('startScreen');
    startMessage = document.getElementById('startMessage');
    restartButton = document.getElementById('restartButton');
    speedBar = document.getElementById('speedBar');
    fuelLevel = document.getElementById('fuelLevel');
    distanceTracker = document.getElementById('distanceTracker');
    redStarCounter = document.getElementById('redStarCounter');
    finalDistanceElement = document.getElementById('finalDistance');
    finalRedStarsElement = document.getElementById('finalRedStars');
    finalScoreElement = document.getElementById('finalScore');

    const starTextures = [
        './img/sun1_glow.png',
        './img/sun2_glow.png',
        './img/sun3_glow.png',
        './img/sun4_glow.png'
    ];
    const randomTexturePath = starTextures[Math.floor(Math.random() * starTextures.length)];
    const sprite = new THREE.TextureLoader().load(randomTexturePath);

    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, STAR_RADIUS * 1.2);
    camera.position.set(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    for (let i = 0; i < STAR_COUNT; i++) {
        const rng = seedrandom('star-' + i);
        const theta = rng() * 2 * Math.PI;
        const phi = Math.acos(2 * rng() - 1);
        const r = Math.cbrt(rng()) * STAR_RADIUS;
        const i3 = i * 3;
        const starType = getRandomStarType();
        positions[i3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = r * Math.cos(phi);

        STAR_DATA[i] = starType;
        colors[i3] = starType.color.r;
        colors[i3 + 1] = starType.color.g;
        colors[i3 + 2] = starType.color.b;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
        size: currentStarDisplaySize,
        map: sprite,
        alphaTest: 0.05,
        transparent: true,
        sizeAttenuation: true,
        vertexColors: true,
        depthWrite: true
    });

    stars = new THREE.Points(geom, material);
    stars.frustumCulled = false;
    scene.add(stars);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const blur = new AfterimagePass();
    blur.uniforms['damp'].value = 0.4;
    composer.addPass(blur);

    addEventListeners();
    resetGame(true);
}

function addEventListeners() {
    startMessage.addEventListener('click', () => {
        if (paused) {
            startScreen.style.display = 'none';
            paused = false;
            renderer.domElement.requestPointerLock();
            lastStarTouchTime = performance.now() * 0.001;
        }
    });

    restartButton.addEventListener('click', () => {
        resetGame();
    });

    document.addEventListener('pointerlockchange', () => {
        document.body.style.cursor = document.pointerLockElement ? 'none' : 'auto';
        if (!document.pointerLockElement && !paused) {
            paused = true;
            startScreen.style.display = 'flex';
            startMessage.textContent = 'CLICK TO RESUME';
        }
    });

    document.addEventListener('mousemove', e => {
        if (!paused) {
            yawVelocity -= e.movementX * YAW_SPEED;
            pitchVelocity -= e.movementY * PITCH_SPEED;
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            e.preventDefault();
        }

        if (e.key === ' ' && !spacebarHandled) {
            spacebarHandled = true;
            if (!paused) {
                paused = true;
                document.exitPointerLock();
                startScreen.style.display = 'flex';
                startMessage.textContent = 'CLICK TO RESUME';
            } else if (startScreen.style.display === 'flex') {
                startScreen.style.display = 'none';
                paused = false;
                renderer.domElement.requestPointerLock();
                lastStarTouchTime = performance.now() * 0.001;
            }
        }

        if (!paused) {
            if (e.key === 'w' || e.key === 'W') accelerating = true;
            if (e.key === 's' || e.key === 'S') decelerating = true;
            if (e.key === 'a' || e.key === 'A') {
                if (!rollingLeft) {
                    rollVelocity = -INITIAL_ROLL_SPEED;
                    rollingLeft = true;
                }
                dampenRoll = false;
            }
            if (e.key === 'd' || e.key === 'D') {
                if (!rollingRight) {
                    rollVelocity = +INITIAL_ROLL_SPEED;
                    rollingRight = true;
                }
                dampenRoll = false;
            }
        }
    });

    document.addEventListener('keyup', e => {
        if (e.key === ' ') {
            spacebarHandled = false;
        }
        if (e.key === 'w' || e.key === 'W') accelerating = false;
        if (e.key === 's' || e.key === 'S') decelerating = false;
        if (e.key === 'a' || e.key === 'A') {
            rollingLeft = false;
            if (!rollingRight) dampenRoll = true;
        }
        if (e.key === 'd' || e.key === 'D') {
            rollingRight = false;
            if (!rollingLeft) dampenRoll = true;
        }
    });
    window.addEventListener('resize', onResize);
}

function animate(time) {
    requestAnimationFrame(animate);
    if (paused) {
        animate.last = time * 0.001;
        return;
    }
    const dt = (time * 0.001) - (animate.last || 0);
    animate.last = time * 0.001;

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation).normalize();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation).normalize();
    const yawDelta = new THREE.Quaternion().setFromAxisAngle(up, yawVelocity * dt);
    const pitchDelta = new THREE.Quaternion().setFromAxisAngle(right, pitchVelocity * dt);
    let rollDelta = new THREE.Quaternion();

    if (dampenRoll) {
        rollVelocity *= 0.9;
        if (Math.abs(rollVelocity) < 0.0001) rollVelocity = 0;
    } else if (rollingLeft || rollingRight) {
        if (Math.abs(rollVelocity) < MAX_ROLL_VELOCITY) {
            if (rollingLeft && rollVelocity <= 0) rollVelocity *= 1.05;
            else if (rollingRight && rollVelocity >= 0) rollVelocity *= 1.05;
            else if (rollingLeft && rollVelocity > 0) rollVelocity = -INITIAL_ROLL_SPEED;
            else if (rollingRight && rollVelocity < 0) rollVelocity = INITIAL_ROLL_SPEED;
        } else {
            rollVelocity = Math.sign(rollVelocity) * MAX_ROLL_VELOCITY;
        }
    }
    if (rollVelocity !== 0) {
        rollDelta.setFromAxisAngle(forward, rollVelocity * dt);
    }

    if (rollVelocity !== 0) {
        orientation.premultiply(rollDelta);
    }

    orientation.premultiply(pitchDelta);
    orientation.premultiply(yawDelta);
    yawVelocity *= CONTROL_DAMPING;
    pitchVelocity *= CONTROL_DAMPING;
    camera.quaternion.copy(orientation);

    if (accelerating) speed = Math.min(Math.max(speed, 1) * ACCELERATION, MAX_SPEED);
    if (decelerating) speed = Math.max(speed / ACCELERATION, 0);
    if (decelerating && speed < 1) speed = 0;

    const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

    tempCameraPosition.copy(camera.position);
    camera.position.addScaledVector(forwardVec, speed * dt);
    totalDistance += tempCameraPosition.distanceTo(camera.position);

    if (speed > 0) fuel = Math.max(0, fuel - FUEL_DEPLETION * (speed / dt));

    updateHUD();

    if (fuel <= 0) {
        gameOver();
        return;
    }

    updateStars(dt);

    composer.render();
}

function updateHUD() {
    speedBar.style.height = `${(speed / MAX_SPEED) * 100}%`;

    const fuelPercentage = (fuel / MAX_FUEL) * 100;
    fuelLevel.style.height = `${fuelPercentage}%`;
    if (fuelPercentage > 40) {
        fuelLevel.style.backgroundColor = 'limegreen';
    } else if (fuelPercentage > 15) {
        fuelLevel.style.backgroundColor = 'gold';
    } else {
        fuelLevel.style.backgroundColor = 'red';
    }

    distanceTracker.textContent = `${(totalDistance / 1000).toFixed(1)} AUs`;
    redStarCounter.textContent = redStarsCollected;
}

function gameOver() {
    document.getElementById('gameOver').style.visibility = 'visible';
    finalDistanceElement.textContent = `${(totalDistance / 1000).toFixed(1)} AUs`;
    finalRedStarsElement.textContent = redStarsCollected;
    finalScoreElement.textContent = Math.floor(totalScore);

    paused = true;
    document.exitPointerLock();
}

function updateStars(dt) {
    const posAttr = stars.geometry.attributes.position.array;
    const colAttr = stars.geometry.attributes.color.array;
    let shouldTriggerGlobalExplosion = false;

    for (let i = 0; i < STAR_COUNT; i++) {
        const i3 = 3 * i;
        const dx = camera.position.x - posAttr[i3];
        const dy = camera.position.y - posAttr[i3 + 1];
        const dz = camera.position.z - posAttr[i3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 5) {
            if (!COLLECTED[i]) {
                COLLECTED[i] = true;

                if (STAR_DATA[i].providesFuel) {
                    fuel = Math.min(MAX_FUEL, fuel + FUEL_GAIN);
                    redStarsCollected++;
                    const timeSinceLastTouch = animate.last - lastStarTouchTime;
                    if (timeSinceLastTouch > 0) {
                        totalScore += (speed / timeSinceLastTouch) * 10;
                    }
                    lastStarTouchTime = animate.last;
                }

                flash.style.opacity = 0.5;
                setTimeout(() => flash.style.opacity = 0, 100);

                shouldTriggerGlobalExplosion = true;

                posAttr[i3] = camera.position.x + DISAPPEAR_DISTANCE;
                posAttr[i3 + 1] = camera.position.y + DISAPPEAR_DISTANCE;
                posAttr[i3 + 2] = camera.position.z + DISAPPEAR_DISTANCE;
                colAttr[i3] = 0;
                colAttr[i3 + 1] = 0;
                colAttr[i3 + 2] = 0;
            }
        } else if (dist > STAR_RADIUS) {
            respawnStar(i, posAttr, colAttr, camera.position, STAR_RADIUS, STAR_DATA);
            COLLECTED[i] = false;
        } else {
            if (!COLLECTED[i]) {
                const starColor = STAR_DATA[i].color;
                colAttr[i3] = Math.min(starColor.r, colAttr[i3] + dt * 2);
                colAttr[i3 + 1] = Math.min(starColor.g, colAttr[i3 + 1] + dt * 2);
                colAttr[i3 + 2] = Math.min(starColor.b, colAttr[i3 + 2] + dt * 2);
            }
        }
    }

    if (shouldTriggerGlobalExplosion) {
        currentStarDisplaySize = BASE_STAR_SIZE * EXPLOSION_SCALE_FACTOR;
    } else {
        currentStarDisplaySize = Math.max(BASE_STAR_SIZE, currentStarDisplaySize - dt * EXPLOSION_SHRINK_SPEED);
    }
    stars.material.size = currentStarDisplaySize;

    stars.geometry.attributes.position.needsUpdate = true;
    stars.geometry.attributes.color.needsUpdate = true;
}

function respawnStar(index, positions, colors, cameraPosition, radius, starDataArray) {
    const i3 = 3 * index;
    const rng = seedrandom('star-' + index + '-' + performance.now());
    const theta = rng() * 2 * Math.PI;
    const phi = Math.acos(2 * rng() - 1);
    positions[i3] = cameraPosition.x + radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = cameraPosition.y + radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = cameraPosition.z + radius * Math.cos(phi);

    const newStarType = getRandomStarType();
    starDataArray[index] = newStarType;
    colors[i3] = newStarType.color.r;
    colors[i3 + 1] = newStarType.color.g;
    colors[i3 + 2] = newStarType.color.b;
}

function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
}

function resetGame() {
    totalDistance = 0;
    redStarsCollected = 0;
    totalScore = 0;
    speed = 0;
    fuel = MAX_FUEL;
    paused = true;
    rollVelocity = 0;
    yawVelocity = 0;
    pitchVelocity = 0;
    accelerating = false;
    decelerating = false;
    dampenRoll = true;
    rollingLeft = false;
    rollingRight = false;
    currentStarDisplaySize = BASE_STAR_SIZE;
    spacebarHandled = false;
    animate.last = undefined;

    camera.position.set(0, 0, 0);
    orientation.set(0, 0, 0, 1);
    camera.quaternion.copy(orientation);

    const posAttr = stars.geometry.attributes.position.array;
    const colAttr = stars.geometry.attributes.color.array;
    for (let i = 0; i < STAR_COUNT; i++) {
        COLLECTED[i] = false;
        const rng = seedrandom('star-' + i + '-' + performance.now());
        const theta = rng() * 2 * Math.PI;
        const phi = Math.acos(2 * rng() - 1);
        const r = Math.cbrt(rng()) * STAR_RADIUS;
        const i3 = i * 3;
        const starType = getRandomStarType();
        posAttr[i3] = r * Math.sin(phi) * Math.cos(theta);
        posAttr[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        posAttr[i3 + 2] = r * Math.cos(phi);
        STAR_DATA[i] = starType;
        colAttr[i3] = starType.color.r;
        colAttr[i3 + 1] = starType.color.g;
        colAttr[i3 + 2] = starType.color.b;
    }
    stars.geometry.attributes.position.needsUpdate = true;
    stars.geometry.attributes.color.needsUpdate = true;

    speedBar.style.height = '0%';
    fuelLevel.style.height = '100%';
    fuelLevel.style.backgroundColor = 'limegreen';
    distanceTracker.textContent = '0 AUs';
    redStarCounter.textContent = '0';
    document.getElementById('gameOver').style.visibility = 'hidden';
    document.getElementById('startScreen').style.display = 'flex';
    document.getElementById('startMessage').textContent = 'CLICK TO START';
}