(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const screens = { start: $("startScreen"), game: $("gameScreen"), result: $("resultScreen") };
  const levels = {
    easy: { pairs: 4, cols: 3, seconds: 60, label: "쉬움" },
    normal: { pairs: 6, cols: 4, seconds: 75, label: "보통" },
    hard: { pairs: 8, cols: 5, seconds: 90, label: "어려움" }
  };
  // 충분히 많은 서로 다른 그림을 준비해 오답용 그림이 양쪽 보드에서 겹치지 않게 합니다.
  const pictures = [
    "🐻","🚙","🐤","🦊","🍎","🐸","🌳","⭐","🐱","🍓","🐼","🦋",
    "🍉","🐶","🚀","🐢","🍒","🦁","🐰","🍋","🐳","🍄","🎈","🐧",
    "🐨","🦄","🐙","🦖","🐞","🐝","🦉","🐬","🦀","🐌","🐑","🐮",
    "🥕","🍇","🍍","🍌","🍪","🍩","🍦","🧁","⚽","🎸","✈️","🚲",
    "🚂","🚁","⛵","🌈","☀️","🌙","☁️","❄️","🌻","🌷","🍀","🔥",
    "🎁","🎨","🎲","🧸","🪁","👑","💎","🔔","🪄","🛴","🦓","🦒"
  ];
  let level = "easy", score = 0, foundPairs = 0, secondsLeft = 60, totalSeconds = 60;
  let phase = "idle", timerId = null, previewId = null, startAt = 0, chosenA = null, chosenB = null;
  let pairs = [], soundOn = true, tileSize = "auto", lockInput = false;

  function showScreen(which) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle("hidden", key !== which));
  }
  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function beep(freq = 620, duration = 0.08) {
    if (!soundOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx(), osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + duration);
      osc.onended = () => ctx.close();
    } catch (_) {}
  }
  function updateStats() {
    $("score").textContent = score;
    $("timer").textContent = secondsLeft;
    $("found").textContent = `${foundPairs} / ${levels[level].pairs}`;
    $("timer").style.color = secondsLeft <= 10 ? "#d63d5d" : "";
  }
  function makeBoard(boardId, items) {
    const board = $(boardId);
    board.innerHTML = "";
    board.style.gridTemplateColumns = `repeat(${levels[level].cols}, minmax(0, 1fr))`;
    board.classList.toggle("large-tiles", tileSize === "large");
    board.classList.toggle("compact-tiles", tileSize === "compact");
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tile preview-lock";
      button.textContent = item.emoji;
      button.dataset.pair = item.pair;
      button.dataset.board = boardId;
      button.dataset.index = index;
      button.setAttribute("aria-label", `그림 ${index + 1}`);
      button.addEventListener("click", () => selectTile(button));
      board.appendChild(button);
    });
  }
  function startGame() {
    clearInterval(timerId); clearTimeout(previewId);
    const config = levels[level];
    score = 0; foundPairs = 0; secondsLeft = config.seconds; totalSeconds = config.seconds;
    chosenA = null; chosenB = null; lockInput = true; phase = "preview";
    const selected = shuffle(pictures).slice(0, config.pairs);
    pairs = selected.map((emoji, i) => ({ emoji, pair: String(i) }));
    const boardA = shuffle(pairs.map(p => ({...p})));
    const boardB = shuffle(pairs.map(p => ({...p})));
    // 오답 그림은 양쪽 보드 사이에서도 서로 겹치지 않도록 한 번에 뽑아 분리합니다.
    // 따라서 두 보드에서 같은 그림이 보이면 반드시 실제 정답 쌍입니다.
    const slots = config.cols * config.cols;
    const decoyCount = Math.max(0, slots - config.pairs);
    const unusedPictures = shuffle(pictures.filter(p => !selected.includes(p)));
    const decoysA = unusedPictures.slice(0, decoyCount)
      .map((emoji, i) => ({emoji, pair:`a${i}`}));
    const decoysB = unusedPictures.slice(decoyCount, decoyCount * 2)
      .map((emoji, i) => ({emoji, pair:`b${i}`}));
    makeBoard("boardA", shuffle([...boardA, ...decoysA]));
    makeBoard("boardB", shuffle([...boardB, ...decoysB]));
    $("phaseBanner").className = "phase-banner preview";
    $("phaseBanner").innerHTML = "👀 그림을 잘 기억해요! <b>1</b>";
    $("instruction").textContent = "그림의 모양과 위치를 기억해 보세요.";
    $("quitBtn").textContent = "종료";
    updateStats(); showScreen("game");
    startAt = Date.now();
    // Preview exactly 1 second. The same board remains in place when play begins.
    previewId = setTimeout(() => {
      if (phase !== "preview") return;
      phase = "playing"; lockInput = false;
      document.querySelectorAll(".tile").forEach(tile => tile.classList.remove("preview-lock"));
      $("phaseBanner").className = "phase-banner playing";
      $("phaseBanner").textContent = "🚀 시작! 같은 그림을 찾아요!";
      $("instruction").textContent = "그림판 A와 B에서 같은 그림을 찾아 눌러요.";
      beep(700, 0.1);
      timerId = setInterval(() => {
        if (phase !== "playing") return;
        secondsLeft--;
        updateStats();
        if (secondsLeft <= 0) finishGame(false);
      }, 1000);
    }, 1000);
  }
  function selectTile(tile) {
    if (phase !== "playing" || lockInput || tile.classList.contains("found") || tile.classList.contains("correct")) return;
    if (tile.dataset.board === "boardA") {
      if (chosenA) chosenA.classList.remove("wrong");
      chosenA = tile;
      tile.classList.add("correct");
      if (chosenB) compareTiles();
    } else {
      if (chosenB) chosenB.classList.remove("wrong");
      chosenB = tile;
      tile.classList.add("correct");
      if (chosenA) compareTiles();
    }
  }
  function compareTiles() {
    if (!chosenA || !chosenB) return;
    lockInput = true;
    const a = chosenA, b = chosenB;
    if (a.dataset.pair === b.dataset.pair && !a.dataset.pair.startsWith("a") && !a.dataset.pair.startsWith("b")) {
      a.classList.remove("correct"); b.classList.remove("correct");
      a.classList.add("found"); b.classList.add("found");
      a.disabled = true; b.disabled = true;
      score += 100 + Math.max(0, secondsLeft); foundPairs++;
      updateStats(); beep(850, 0.13);
      toast("정답이에요! 참 잘했어요! 🎉");
      chosenA = null; chosenB = null; lockInput = false;
      if (foundPairs >= levels[level].pairs) finishGame(true);
    } else {
      a.classList.add("wrong"); b.classList.add("wrong"); beep(230, 0.1);
      setTimeout(() => {
        a.classList.remove("correct", "wrong");
        b.classList.remove("correct", "wrong");
        chosenA = null; chosenB = null; lockInput = false;
      }, 420);
    }
  }
  function finishGame(won) {
    const previousPhase = phase;
    clearInterval(timerId); clearTimeout(previewId);
    phase = "finished"; lockInput = true;
    const elapsed = Math.max(0, Math.round((Date.now() - startAt) / 1000) - (previousPhase === "preview" ? 1 : 0));
    $("resultEmoji").textContent = won ? "🏆" : "💪";
    $("resultTitle").textContent = won ? "참 잘했어요!" : "다음엔 더 잘할 수 있어요!";
    $("resultMessage").textContent = won ? "같은 그림을 모두 찾았어요!" : "괜찮아요! 다시 도전해 봐요.";
    $("finalScore").textContent = score;
    $("finalFound").textContent = `${foundPairs} / ${levels[level].pairs}`;
    $("elapsed").textContent = `${Math.min(totalSeconds, elapsed)}초`;
    showScreen("result"); if (won) beep(980, 0.2);
  }
  let toastTimeout;
  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("show"), 1400);
  }
  document.querySelectorAll(".difficulty").forEach(button => button.addEventListener("click", () => {
    level = button.dataset.level;
    document.querySelectorAll(".difficulty").forEach(b => b.classList.toggle("selected", b === button));
    beep(500, 0.05);
  }));
  $("startBtn").addEventListener("click", startGame);
  $("restartBtn").addEventListener("click", startGame);
  $("againBtn").addEventListener("click", startGame);
  $("homeBtn").addEventListener("click", () => { clearInterval(timerId); clearTimeout(previewId); phase = "idle"; showScreen("start"); });
  $("quitBtn").addEventListener("click", () => {
    if (phase === "preview" || phase === "playing") {
      clearInterval(timerId); clearTimeout(previewId);
      if (confirm("게임을 종료하고 처음 화면으로 돌아갈까요?")) { phase = "idle"; showScreen("start"); }
      else if (phase !== "finished") {
        // Resume safely if the user cancels during active play.
        if (secondsLeft > 0 && !$("gameScreen").classList.contains("hidden")) {
          phase = "playing"; lockInput = false;
          timerId = setInterval(() => { if (phase === "playing") { secondsLeft--; updateStats(); if (secondsLeft <= 0) finishGame(false); } }, 1000);
        }
      }
    }
  });
  $("settingsBtn").addEventListener("click", () => $("settingsDialog").showModal());
  $("soundToggle").addEventListener("change", e => { soundOn = e.target.checked; });
  $("sizeSelect").addEventListener("change", e => {
    tileSize = e.target.value;
    document.querySelectorAll(".board").forEach(board => {
      board.classList.toggle("large-tiles", tileSize === "large");
      board.classList.toggle("compact-tiles", tileSize === "compact");
    });
    const style = document.getElementById("dynamicTileStyle") || document.createElement("style");
    style.id = "dynamicTileStyle";
    style.textContent = tileSize === "large" ? ".tile{font-size:clamp(30px,6vw,60px)}" : tileSize === "compact" ? ".tile{font-size:clamp(18px,3.5vw,38px)}" : "";
    document.head.appendChild(style);
  });
})();