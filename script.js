(() => {
	"use strict";

	const KEY_NAME  = "beelzebub.callsign";
	const KEY_BOARD = "beelzebub.board.v1";
	const DEFAULT_NAME = "PILOT";
	const MAX_ROWS = 10;

	/* ---------- default leaderboard entries ---------- */
	const SEED = {
		arcade: [
			{ name: "NOVA",  score: 550, date: "11/21/2026", won: true },
			{ name: "ACE",   score: 520, date: "11/20/2026", won: true },
			{ name: "JUN",   score: 210, date: "11/22/2026", won: false },
			{ name: "RAVEN", score: 150, date: "11/23/2026", won: false },
			{ name: "ZED",   score: 90,  date: "11/23/2026", won: false }
		],
		endless: [
			{ name: "ACE",   score: 1240, date: "11/20/2026", won: false },
			{ name: "NOVA",  score: 980,  date: "11/21/2026", won: false },
			{ name: "JUN",   score: 540,  date: "11/22/2026", won: false },
			{ name: "RAVEN", score: 310,  date: "11/23/2026", won: false }
		]
	};

	/* ---------- safe storage (works even if blocked) ---------- */
	const store = {
		get(k)    { try { return localStorage.getItem(k); } catch { return null; } },
		set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
	};

	/* ---------- name ---------- */
	const cleanName = (raw) =>
		String(raw || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 10);

	let pilot = cleanName(store.get(KEY_NAME)) || DEFAULT_NAME;
	let gameMode = "arcade";
	const getName = () => pilot;

	function setName(raw) {
		pilot = cleanName(raw) || DEFAULT_NAME;
		store.set(KEY_NAME, cleanName(raw));     // save "" if empty
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

	/* ---------- rendering (uses textContent: safe from HTML injection) ---------- */
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

	/* ---------- public API: call these from your game code ---------- */
	/**
	 * submitScore("arcade" | "endless", score, won)
	 * Keeps the current pilot's best score. Returns rank (1-based) or 0 if outside top 10.
	 */
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
		board[mode].sort((a, b) => b.score - a.score);   // stable: older entry wins ties
		const idx = board[mode].indexOf(savedEntry);
		board[mode] = board[mode].slice(0, MAX_ROWS);
		saveBoard();
		renderAll();
		return idx >= 0 && idx < MAX_ROWS ? idx + 1 : 0;
	}

	/**
	 * finishGame({ mode, score, enemies, won, hullBonus })
	 * Saves the score, fills the WIN / GAME OVER screen, and opens it.
	 */
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

	function setupEnemySpawning() {
		const radar = document.getElementById("radarScreen");
		const coordinates = document.querySelectorAll("#radarCoordinates .radar-coordinate--c");
		const enemyLayer = document.getElementById("enemyLayer");
		const hullReadout = document.getElementById("livesValue");
		const scoreReadout = document.getElementById("scoreValue");
		const enemyTypes = ["enemy--demon", "enemy--alien", "enemy--normal"];
		const initialSpawnDelay = 5000;
		const minimumSpawnDelay = 1500;
		const spawnAcceleration = 0.06;
		const travelDuration = 14000;

		if (!radar || !enemyLayer || !hullReadout || !scoreReadout || coordinates.length === 0) {
			console.error("Enemy spawning could not start: required radar elements are missing.");
			return;
		}

		let lives = 3;
		let gameElapsed = 0;
		let lastFrameTime = null;
		let spawnTimer = null;
		let animationFrame = null;
		let initialized = false;
		let running = false;
		const activeEnemies = [];

		function resetGame() {
			activeEnemies.length = 0;
			enemyLayer.textContent = "";
			lives = 3;
			gameElapsed = 0;
			hullReadout.textContent = String(lives);
			scoreReadout.textContent = "0";
			initialized = true;
		}

		function spawnEnemy() {
			const coordinate = coordinates[Math.floor(Math.random() * coordinates.length)];
			const coordinateBounds = coordinate.getBoundingClientRect();
			const layerBounds = enemyLayer.getBoundingClientRect();
			const startX = ((coordinateBounds.left + coordinateBounds.width / 2 - layerBounds.left) / layerBounds.width) * 100;
			const startY = ((coordinateBounds.top + coordinateBounds.height / 2 - layerBounds.top) / layerBounds.height) * 100;
			const type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
			const enemy = document.createElement("div");

			enemy.className = "enemy " + type;
			enemy.style.left = startX + "%";
			enemy.style.top = startY + "%";
			enemyLayer.appendChild(enemy);
			activeEnemies.push({ element: enemy, startX, startY, elapsed: 0 });
		}

		function scheduleSpawn() {
			const delay = Math.max(minimumSpawnDelay, initialSpawnDelay - gameElapsed * spawnAcceleration);
			spawnTimer = setTimeout(() => {
				if (!running) return;
				spawnEnemy();
				scheduleSpawn();
			}, delay);
		}

		function pauseGame() {
			running = false;
			clearTimeout(spawnTimer);
			if (animationFrame !== null) cancelAnimationFrame(animationFrame);
			animationFrame = null;
			lastFrameTime = null;
		}

		function updateEnemies(timestamp) {
			if (!running) return;

			const delta = lastFrameTime === null ? 0 : timestamp - lastFrameTime;
			lastFrameTime = timestamp;
			gameElapsed += delta;

			for (let i = activeEnemies.length - 1; i >= 0; i--) {
				const activeEnemy = activeEnemies[i];
				activeEnemy.elapsed += delta;
				const progress = Math.min(1, activeEnemy.elapsed / travelDuration);
				const x = activeEnemy.startX + (50 - activeEnemy.startX) * progress;
				const y = activeEnemy.startY + (50 - activeEnemy.startY) * progress;

				activeEnemy.element.style.left = x + "%";
				activeEnemy.element.style.top = y + "%";

				if (progress >= 1) {
					activeEnemy.element.remove();
					activeEnemies.splice(i, 1);
					lives -= 1;
					hullReadout.textContent = String(lives);

					if (lives <= 0) {
						pauseGame();
						finishGame({
							mode: gameMode,
							score: Number(scoreReadout.textContent) || 0,
							enemies: 0
						});
						return;
					}
				}
			}

			animationFrame = requestAnimationFrame(updateEnemies);
		}

		function resumeGame() {
			if (running) return;
			running = true;
			lastFrameTime = null;
			scheduleSpawn();
			animationFrame = requestAnimationFrame(updateEnemies);
		}

		function syncGameState() {
			if (location.hash === "#game" && !document.hidden) {
				if (!initialized) resetGame();
				resumeGame();
				return;
			}

			pauseGame();
			if (location.hash !== "#pause" && location.hash !== "#game") initialized = false;
		}

		window.addEventListener("hashchange", syncGameState);
		document.addEventListener("visibilitychange", syncGameState);
		syncGameState();
	}

	window.Beelzebub = { getName, setName, submitScore, finishGame };

	/* ---------- wire up the page ---------- */
	document.addEventListener("DOMContentLoaded", () => {
		const input = document.getElementById("nick");

		if (input) {
			input.value = pilot === DEFAULT_NAME && !cleanName(store.get(KEY_NAME)) ? "" : pilot;
			input.addEventListener("input", () => {
				const cleaned = input.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
				if (input.value !== cleaned) input.value = cleaned;   // block weird characters live
				setName(cleaned);
			});
		}

        
		/* If no name was typed, send the player back to type one before launching */
		document.querySelectorAll('#arcade a[href="#game"], #endless a[href="#game"]').forEach(btn => {
			btn.addEventListener("click", (e) => {
				gameMode = btn.closest("#endless") ? "endless" : "arcade";
				if (!cleanName(store.get(KEY_NAME))) {
					e.preventDefault();
					location.hash = "#home";
					if (input) {
						input.focus();
						input.classList.add("nick-input--error");
						setTimeout(() => input.classList.remove("nick-input--error"), 1200);
					}
				}
			});
		});

		renderAll();
		setupEnemySpawning();
	});
})();


const ammoSwitches = document.querySelectorAll(".ammo-switch");

ammoSwitches.forEach((ammoSwitch) => {
    ammoSwitch.addEventListener("click", () => {
        ammoSwitches.forEach((otherSwitch) => {
            otherSwitch.setAttribute(
                "aria-pressed",
                String(otherSwitch === ammoSwitch),
            );
        });

    });
});