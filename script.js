(() => {
	"use strict";

	const KEY_NAME = "beelzebub.callsign";
	const KEY_BOARD = "beelzebub.board.v1";
	const DEFAULT_NAME = "PILOT";
	const MAX_ROWS = 10;

	/* ---------- default leaderboard entries ---------- */
	const SEED = {
		arcade: [
			{ name: "NOVA", score: 550, date: "11/21/2026", won: true },
			{ name: "ACE", score: 520, date: "11/20/2026", won: true },
			{ name: "JUN", score: 210, date: "11/22/2026", won: false },
			{ name: "RAVEN", score: 150, date: "11/23/2026", won: false },
			{ name: "ZED", score: 90, date: "11/23/2026", won: false }
		],
		endless: [
			{ name: "ACE", score: 1240, date: "11/20/2026", won: false },
			{ name: "NOVA", score: 980, date: "11/21/2026", won: false },
			{ name: "JUN", score: 540, date: "11/22/2026", won: false },
			{ name: "RAVEN", score: 310, date: "11/23/2026", won: false }
		]
	};

	/* ---------- safe storage ---------- */
	const store = {
		get(k) { try { return localStorage.getItem(k); } catch { return null; } },
		set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
	};

	/* ---------- name ---------- */
	const cleanName = (raw) =>
		String(raw || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 10);

	let pilot = cleanName(store.get(KEY_NAME)) || DEFAULT_NAME;
	const getName = () => pilot;

	function setName(raw) {
		pilot = cleanName(raw) || DEFAULT_NAME;
		store.set(KEY_NAME, cleanName(raw));
		renderAll();
	}

	/* ---------- leaderboard data ---------- */
	function keepBestScores(entries) {
		const bestByName = new Map();
		entries.forEach(entry => {
			const best = bestByName.get(entry.name);
			if (!best || entry.score > best.score) bestByName.set(entry.name, entry);
		});
		return Array.from(bestByName.values()).sort((a, b) => b.score - a.score);
	}

	function loadBoard() {
		try {
			const data = JSON.parse(store.get(KEY_BOARD));
			if (data && Array.isArray(data.arcade) && Array.isArray(data.endless)) {
				data.arcade = keepBestScores(data.arcade);
				data.endless = keepBestScores(data.endless);
				return data;
			}
		} catch { /* fall through */ }
		return JSON.parse(JSON.stringify(SEED));
	}
	let board = loadBoard();
	const saveBoard = () => store.set(KEY_BOARD, JSON.stringify(board));

	function bestFor(mode, name) {
		return board[mode].filter(e => e.name === name).reduce((m, e) => Math.max(m, e.score), 0);
	}

	/* ---------- rendering ---------- */
	function cell(text, cls) {
		const td = document.createElement("td");
		if (cls) td.className = cls;
		td.textContent = text;
		return td;
	}

	function renderBoard(mode) {
		const body = document.getElementById("board-" + mode);
		if (!body) return;
		body.textContent = "";
		board[mode].slice(0, MAX_ROWS).forEach((e, i) => {
			const tr = document.createElement("tr");
			if (e.name === pilot) tr.className = "me";
			tr.append(
				cell(i + 1, "rank"),
				cell(e.name + (e.won ? " ★" : "")),
				cell(e.score, "score"),
				cell(e.date, "date")
			);
			body.appendChild(tr);
		});
	}

	function renderAll() {
		document.querySelectorAll(".pilot-name").forEach(el => (el.textContent = pilot));
		document.querySelectorAll(".best-arcade").forEach(el => (el.textContent = bestFor("arcade", pilot)));
		document.querySelectorAll(".best-endless").forEach(el => (el.textContent = bestFor("endless", pilot)));
		renderBoard("arcade");
		renderBoard("endless");
	}

	function submitScore(mode, score, won = false) {
		const entry = {
			name: pilot,
			score: Math.max(0, Math.round(score)),
			date: new Date().toLocaleDateString("en-US"),
			won: !!won
		};

		const existingEntry = board[mode]
			.filter(candidate => candidate.name === pilot)
			.reduce((best, candidate) => !best || candidate.score > best.score ? candidate : best, null);
		const savedEntry = existingEntry && existingEntry.score >= entry.score ? existingEntry : entry;
		board[mode] = board[mode].filter(candidate => candidate.name !== pilot || candidate === savedEntry);
		if (savedEntry === entry) board[mode].push(entry);
		board[mode].sort((a, b) => b.score - a.score);
		const idx = board[mode].indexOf(savedEntry);
		board[mode] = board[mode].slice(0, MAX_ROWS);
		saveBoard();
		renderAll();
		return idx >= 0 && idx < MAX_ROWS ? idx + 1 : 0;
	}

	function finishGame({ mode = "arcade", score = 0, enemies = 0, won = false, hullBonus = 0 } = {}) {
		const rank = submitScore(mode, score, won);
		const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
		const rankText = rank ? "LEADERBOARD RANK #" + rank : "OUTSIDE TOP " + MAX_ROWS;
		if (won) {
			set("winScore", score + (hullBonus ? " (HULL BONUS +" + hullBonus + ")" : ""));
			set("winEnemies", enemies);
			set("winRank", rankText);
		} else {
			set("loseScore", score);
			set("loseEnemies", enemies);
			set("loseRank", rankText);
		}
		location.hash = won ? "#win" : "#lose";
		return rank;
	}

	window.Beelzebub = { getName, setName, submitScore, finishGame };

	/* =====================================================================
	   RETRO SYNTH AUDIO
	   ===================================================================== */
	let soundOn = true;
	let audioCtx = null;

	function playTone(freq, duration, type = "square", volume = 0.08, endFreq = null) {
		if (!soundOn) return;
		try {
			const Ctx = window.AudioContext || window.webkitAudioContext;
			if (!audioCtx) audioCtx = new Ctx();
			if (audioCtx.state === "suspended") audioCtx.resume();

			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			osc.type = type;
			osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
			if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);

			gain.gain.setValueAtTime(volume, audioCtx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

			osc.connect(gain);
			gain.connect(audioCtx.destination);
			osc.start();
			osc.stop(audioCtx.currentTime + duration);
		} catch { /* audio blocked */ }
	}

	const sfx = {
		shoot: () => playTone(680, 0.12, "sawtooth", 0.07, 180),
		hit:   () => playTone(520, 0.16, "triangle", 0.1, 980),
		miss:  () => playTone(160, 0.18, "square", 0.07, 90),
		hurt:  () => playTone(120, 0.3, "sawtooth", 0.12, 45),
		win:   () => { playTone(523, 0.14, "triangle", 0.1); setTimeout(() => playTone(659, 0.14, "triangle", 0.1), 130); setTimeout(() => playTone(784, 0.28, "triangle", 0.1), 260); }
	};

	/* =====================================================================
	   GAME ENGINE
	   ===================================================================== */
	const ARCADE_GOAL = 30;
	const RING_RADII = [0.225, 0.375, 0.465]; // A (close), B (mid), C (far)
	const RING_POINTS = [10, 15, 20];
	const RING_LETTERS = ["a", "b", "c"];
	const ENEMY_TYPES = [
		{ color: "red", cls: "enemy--demon", hex: "#ff3b3b" },
		{ color: "blue", cls: "enemy--normal", hex: "#3b8bff" },
		{ color: "yellow", cls: "enemy--alien", hex: "#ffe03b" }
	];

	const state = {
		mode: "arcade",
		running: false,
		paused: false,
		lives: 3,
		score: 0,
		destroyed: 0,
		sector: 8,
		ammo: "red",
		enemies: [],
		nextId: 1,
		spawnTimer: null,
		moveTimer: null,
		elapsedMs: 0,
		runStartedAt: null
	};

	const DIFFICULTY_RAMP_MS = 90000;
	const INITIAL_SPAWN_INTERVAL_MS = 7000;
	const MIN_SPAWN_INTERVAL_MS = 1800;
	const INITIAL_MOVE_INTERVAL_MS = 8000;
	const MIN_MOVE_INTERVAL_MS = 2200;

	let radarScreen, enemyLayer, playerShip;
	let livesEl, facingEl, scoreEl, barStatusEl, pauseStatsEl;
	let ammoSwitches, rangeBtns, joystickZone, joystickBase, joystickKnob;

	const sectorToAngle = (sector) => (sector - 1) * 45 + 22.5;
	const gameElapsedMs = () =>
		state.elapsedMs + (state.runStartedAt === null ? 0 : performance.now() - state.runStartedAt);
	const progressiveInterval = (initial, minimum) => {
		const progress = Math.min(gameElapsedMs() / DIFFICULTY_RAMP_MS, 1);
		return initial - (initial - minimum) * progress;
	};

	function getRadarPos(sector, ring) {
		const w = radarScreen.clientWidth || 300;
		const h = radarScreen.clientHeight || 300;
		const size = Math.min(w, h);
		const r = RING_RADII[ring] * size;
		const rad = (sectorToAngle(sector) - 90) * (Math.PI / 180);
		return {
			left: 50 + (Math.cos(rad) * r / w) * 100,
			top: 50 + (Math.sin(rad) * r / h) * 100,
			rPx: r
		};
	}

	function updateCoordinateLabels() {
		document.querySelectorAll(".radar-coordinate--taken").forEach(el => el.classList.remove("radar-coordinate--taken"));
		state.enemies.forEach(e => {
			const sel = `.radar-sector--${e.sector} .radar-coordinate--${RING_LETTERS[e.ring]}`;
			const label = document.querySelector(sel);
			if (label) label.classList.add("radar-coordinate--taken");
		});
	}

	function positionAllEnemies() {
		state.enemies.forEach(e => {
			const pos = getRadarPos(e.sector, e.ring);
			e.el.style.left = pos.left + "%";
			e.el.style.top = pos.top + "%";
		});
	}

	function updateHUD(statusMsg) {
		if (livesEl) livesEl.textContent = state.lives;
		if (facingEl) facingEl.textContent = "Sector " + state.sector;
		if (scoreEl) scoreEl.textContent = state.score;
		if (pauseStatsEl) pauseStatsEl.textContent = `SCORE: ${state.score} | HULL: ${state.lives}`;
		if (playerShip) {
			playerShip.style.transform = `translate(-50%, -50%) rotate(${sectorToAngle(state.sector)}deg)`;
		}
		if (barStatusEl && statusMsg !== undefined) {
			barStatusEl.textContent = statusMsg;
		}
	}

	function setSector(newSector) {
		const wrapped = ((newSector - 1) % 8 + 8) % 8 + 1;
		state.sector = wrapped;
		updateHUD();
	}

	function setAmmo(color) {
		state.ammo = color;
		ammoSwitches.forEach(sw => {
			sw.setAttribute("aria-pressed", String(sw.dataset.color === color));
		});
	}

	/* ---------- Laser Visual ---------- */
	function fireLaserVisual(sector, ring, colorHex) {
		const pos = getRadarPos(sector, ring);
		const beam = document.createElement("div");
		beam.className = "laser-beam";
		beam.style.setProperty("--laser-color", colorHex);
		beam.style.height = pos.rPx + "px";
		beam.style.transform = `translate(-50%, -100%) rotate(${sectorToAngle(sector)}deg)`;
		enemyLayer.appendChild(beam);
		setTimeout(() => beam.remove(), 220);
	}

	/* ---------- Shooting Logic ---------- */
	function fireAt(ring) {
		if (!state.running || state.paused) return;

		const btn = document.querySelector(`.range-btn[data-ring="${ring}"]`);
		if (btn && btn.classList.contains("cooling")) return;
		if (btn) {
			btn.classList.add("cooling");
			setTimeout(() => btn.classList.remove("cooling"), 180);
		}

		const typeObj = ENEMY_TYPES.find(t => t.color === state.ammo) || ENEMY_TYPES[0];
		fireLaserVisual(state.sector, ring, typeObj.hex);
		sfx.shoot();

		const idx = state.enemies.findIndex(
			e => e.sector === state.sector && e.ring === ring && e.color === state.ammo
		);

		if (idx !== -1) {
			const target = state.enemies[idx];
			state.enemies.splice(idx, 1);
			target.el.classList.add("enemy--destroyed");
			setTimeout(() => target.el.remove(), 300);

			const pts = RING_POINTS[ring];
			state.score += pts;
			state.destroyed += 1;
			sfx.hit();

			const goalText = state.mode === "arcade"
				? `HIT! +${pts} (${state.destroyed}/${ARCADE_GOAL})`
				: `HIT! +${pts} (KILLS: ${state.destroyed})`;
			updateHUD(goalText);
			updateCoordinateLabels();

			if (state.mode === "arcade" && state.destroyed >= ARCADE_GOAL) {
				endMatch(true);
			}
		} else {
			state.score = Math.max(0, state.score - 5);
			sfx.miss();
			updateHUD("MISS! -5");
		}
	}

	/* ---------- Enemy Spawning & Movement ---------- */
	function spawnEnemy() {
		if (!state.running || state.paused) return;

		const occupiedC = new Set(state.enemies.filter(e => e.ring === 2).map(e => e.sector));
		const freeSectors = [1, 2, 3, 4, 5, 6, 7, 8].filter(s => !occupiedC.has(s));
		if (freeSectors.length === 0) return;

		const sector = freeSectors[Math.floor(Math.random() * freeSectors.length)];
		const type = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];

		const el = document.createElement("div");
		el.className = `enemy ${type.cls}`;
		const pos = getRadarPos(sector, 2);
		el.style.left = pos.left + "%";
		el.style.top = pos.top + "%";
		enemyLayer.appendChild(el);

		state.enemies.push({
			id: state.nextId++,
			sector,
			ring: 2,
			color: type.color,
			cls: type.cls,
			el
		});

		updateCoordinateLabels();
	}

	function advanceEnemies() {
		if (!state.running || state.paused) return;

		const surviving = [];
		let hullHit = false;

		state.enemies.forEach(e => {
			if (e.ring > 0) {
				e.ring -= 1;
				const pos = getRadarPos(e.sector, e.ring);
				e.el.style.left = pos.left + "%";
				e.el.style.top = pos.top + "%";
				surviving.push(e);
			} else {
				e.el.style.left = "50%";
				e.el.style.top = "50%";
				e.el.classList.add("enemy--hit-ship");
				setTimeout(() => e.el.remove(), 300);
				state.lives -= 1;
				hullHit = true;
			}
		});

		state.enemies = surviving;
		updateCoordinateLabels();

		if (hullHit) {
			sfx.hurt();
			if (playerShip) {
				playerShip.style.filter = "drop-shadow(0 0 14px #ff3b3b)";
				setTimeout(() => { if (playerShip) playerShip.style.filter = ""; }, 260);
			}
			updateHUD("HULL BREACH! -1 HULL");
			if (state.lives <= 0) {
				endMatch(false);
			}
		}
	}

	function clearTimers() {
		clearTimeout(state.spawnTimer);
		clearTimeout(state.moveTimer);
		state.spawnTimer = null;
		state.moveTimer = null;
	}

	function startTimers() {
		clearTimers();

		function scheduleSpawn() {
			if (!state.running || state.paused) return;
			state.spawnTimer = setTimeout(() => {
				state.spawnTimer = null;
				if (!state.running || state.paused) return;
				spawnEnemy();
				scheduleSpawn();
			}, progressiveInterval(INITIAL_SPAWN_INTERVAL_MS, MIN_SPAWN_INTERVAL_MS));
		}

		function scheduleMove() {
			if (!state.running || state.paused) return;
			state.moveTimer = setTimeout(() => {
				state.moveTimer = null;
				if (!state.running || state.paused) return;
				advanceEnemies();
				scheduleMove();
			}, progressiveInterval(INITIAL_MOVE_INTERVAL_MS, MIN_MOVE_INTERVAL_MS));
		}

		scheduleSpawn();
		scheduleMove();
	}

	function startMatch(mode = state.mode) {
		clearTimers();
		state.mode = mode;
		state.running = true;
		state.paused = false;
		state.elapsedMs = 0;
		state.runStartedAt = performance.now();
		state.lives = 3;
		state.score = 0;
		state.destroyed = 0;
		state.sector = 8;
		state.enemies.forEach(e => e.el.remove());
		state.enemies = [];
		if (enemyLayer) enemyLayer.textContent = "";

		setAmmo("red");
		updateCoordinateLabels();
		updateHUD(mode === "arcade" ? `ARCADE // 0/${ARCADE_GOAL}` : "ENDLESS // SURVIVE");
		startTimers();
	}

	function pauseMatch() {
		if (!state.running) return;
		state.elapsedMs = gameElapsedMs();
		state.runStartedAt = null;
		state.paused = true;
		clearTimers();
		updateHUD("PAUSED");
	}

	function resumeMatch() {
		if (!state.running) return;
		state.paused = false;
		state.runStartedAt = performance.now();
		updateHUD(state.mode === "arcade" ? `ARCADE // ${state.destroyed}/${ARCADE_GOAL}` : "ENDLESS // SURVIVE");
		startTimers();
	}

	function stopMatch() {
		state.running = false;
		state.paused = false;
		state.runStartedAt = null;
		clearTimers();
		state.enemies.forEach(e => e.el.remove());
		state.enemies = [];
		updateCoordinateLabels();
	}

	function endMatch(won) {
		state.running = false;
		state.paused = false;
		state.runStartedAt = null;
		clearTimers();
		const hullBonus = won ? state.lives * 50 : 0;
		const finalScore = state.score + hullBonus;
		if (won) sfx.win();
		finishGame({
			mode: state.mode,
			score: finalScore,
			enemies: state.destroyed,
			won,
			hullBonus
		});
	}

	/* =====================================================================
	   WIRE UP PAGE, CONTROLS & JOYSTICK
	   ===================================================================== */
	document.addEventListener("DOMContentLoaded", () => {
		const input = document.getElementById("nick");
		radarScreen = document.getElementById("radarScreen");
		enemyLayer = document.getElementById("enemyLayer");
		playerShip = document.getElementById("playerShip");
		livesEl = document.getElementById("livesValue");
		facingEl = document.getElementById("facingValue");
		scoreEl = document.getElementById("scoreValue");
		barStatusEl = document.getElementById("barStatus");
		pauseStatsEl = document.querySelector("#pause .menu-hi:nth-of-type(2)");
		ammoSwitches = document.querySelectorAll(".ammo-switch");
		rangeBtns = document.querySelectorAll(".range-btn");
		joystickZone = document.getElementById("joystickZone");
		joystickBase = document.getElementById("joystickBase");
		joystickKnob = document.getElementById("joystickKnob");

		if (input) {
			input.value = pilot === DEFAULT_NAME && !cleanName(store.get(KEY_NAME)) ? "" : pilot;
			input.addEventListener("input", () => {
				const cleaned = input.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
				if (input.value !== cleaned) input.value = cleaned;
				setName(cleaned);
			});
		}

		document.querySelectorAll('#arcade a[href="#game"], #endless a[href="#game"]').forEach(btn => {
			btn.addEventListener("click", (e) => {
				if (!cleanName(store.get(KEY_NAME))) {
					e.preventDefault();
					location.hash = "#home";
					if (input) {
						input.focus();
						input.classList.add("nick-input--error");
						setTimeout(() => input.classList.remove("nick-input--error"), 1200);
					}
					return;
				}
				const mode = btn.closest("#endless") ? "endless" : "arcade";
				startMatch(mode);
			});
		});

		document.querySelectorAll('a[href="#pause"]').forEach(a => a.addEventListener("click", pauseMatch));

		const pauseBtns = document.querySelectorAll('#pause a[href="#game"]');
		if (pauseBtns[0]) pauseBtns[0].addEventListener("click", resumeMatch);
		if (pauseBtns[1]) pauseBtns[1].addEventListener("click", () => startMatch());

		document.querySelectorAll('#win a[href="#game"], #lose a[href="#game"]').forEach(btn => {
			btn.addEventListener("click", () => startMatch());
		});

		document.querySelectorAll('a[href="#home"], a[href="#leaderboard"]').forEach(btn => {
			btn.addEventListener("click", stopMatch);
		});

		const soundBtn = document.querySelector("#settingsBar button.bar-btn");
		if (soundBtn) {
			soundBtn.addEventListener("click", () => {
				soundOn = !soundOn;
				soundBtn.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";
			});
		}

		ammoSwitches.forEach(sw => {
			sw.addEventListener("click", () => setAmmo(sw.dataset.color));
		});

		rangeBtns.forEach(btn => {
			btn.addEventListener("click", () => fireAt(Number(btn.dataset.ring)));
		});

		const rotLeft = document.getElementById("rotLeft");
		const rotRight = document.getElementById("rotRight");
		if (rotLeft) rotLeft.addEventListener("click", () => setSector(state.sector - 1));
		if (rotRight) rotRight.addEventListener("click", () => setSector(state.sector + 1));

		if (joystickZone && joystickBase && joystickKnob) {
			let dragging = false;

			const handlePointer = (e) => {
				const rect = joystickBase.getBoundingClientRect();
				const cx = rect.left + rect.width / 2;
				const cy = rect.top + rect.height / 2;
				const dx = e.clientX - cx;
				const dy = e.clientY - cy;
				const maxDist = rect.width * 0.36;
				const dist = Math.hypot(dx, dy);
				const clamped = Math.min(dist, maxDist);
				const angleRad = Math.atan2(dy, dx);

				const kx = Math.cos(angleRad) * clamped;
				const ky = Math.sin(angleRad) * clamped;
				joystickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

				if (dist > 10) {
					let deg = (angleRad * 180 / Math.PI) + 90;
					if (deg < 0) deg += 360;
					const sector = Math.floor(deg / 45) + 1;
					setSector(sector);
				}
			};

			joystickZone.addEventListener("pointerdown", (e) => {
				dragging = true;
				joystickBase.classList.add("active");
				joystickZone.setPointerCapture(e.pointerId);
				handlePointer(e);
			});

			joystickZone.addEventListener("pointermove", (e) => {
				if (dragging) handlePointer(e);
			});

			const endDrag = () => {
				dragging = false;
				joystickBase.classList.remove("active");
				joystickKnob.style.transform = "translate(-50%, -50%)";
			};
			joystickZone.addEventListener("pointerup", endDrag);
			joystickZone.addEventListener("pointercancel", endDrag);
		}

		const keysDown = new Set();

		function aimFromKeys() {
			const up = keysDown.has("ArrowUp") || keysDown.has("KeyW");
			const down = keysDown.has("ArrowDown") || keysDown.has("KeyS");
			const left = keysDown.has("ArrowLeft") || keysDown.has("KeyA");
			const right = keysDown.has("ArrowRight") || keysDown.has("KeyD");

			if (up && right) return setSector(1);
			if (down && right) return setSector(3);
			if (down && left) return setSector(5);
			if (up && left) return setSector(7);
			if (right) return setSector(2);
			if (down) return setSector(4);
			if (left) return setSector(6);
			if (up) return setSector(8);
		}

		window.addEventListener("keydown", (e) => {
			if (document.activeElement && document.activeElement.tagName === "INPUT") return;

			if (e.code === "KeyP" || e.code === "Escape") {
				if (state.running && !state.paused) {
					pauseMatch();
					location.hash = "#pause";
				} else if (state.running && state.paused && location.hash === "#pause") {
					resumeMatch();
					location.hash = "#game";
				}
				return;
			}

			if (!state.running || state.paused) return;

			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
				e.preventDefault();
				keysDown.add(e.code);
				aimFromKeys();
			} else if (e.code === "Digit1") {
				setAmmo("red");
			} else if (e.code === "Digit2") {
				setAmmo("blue");
			} else if (e.code === "Digit3") {
				setAmmo("yellow");
			} else if (e.code === "KeyZ") {
				fireAt(0);
			} else if (e.code === "KeyX") {
				fireAt(1);
			} else if (e.code === "KeyC") {
				fireAt(2);
			}
		});

		window.addEventListener("keyup", (e) => {
			keysDown.delete(e.code);
		});

		window.addEventListener("resize", () => {
			if (state.running) positionAllEnemies();
		});

		updateHUD("STANDBY");
		renderAll();
	});
})();
