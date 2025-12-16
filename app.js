/**
 * 포켓몬 카드 맞추기 (Memory)
 * - 20장(10쌍) / 1세대(1~151) 랜덤
 * - "게임 시작" 버튼 누르면 2초 전체 공개 후 시작
 * - 이미지 eager 로딩 + 프리로드로 iPad에서 "두번째 카드 안 보임" 체감 개선
 * - 포켓몬 이름은 한글: /pokemon-species/{id} 의 names[ko]
 * - GitHub Pages 정적 배포용 (빌드/서버 없이 동작)
 *
 * 필요 DOM:
 *  - #board, #status, #moves, #matches, #restartBtn, #startBtn
 */

const BOARD_SIZE_PAIRS = 5;
const MAX_POKEMON_ID = 151;
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

const BACK_IMAGE_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const movesEl = document.getElementById("moves");
const matchesEl = document.getElementById("matches");
const restartBtn = document.getElementById("restartBtn");
const startBtn = document.getElementById("startBtn");

let deck = [];
let firstPick = null;
let secondPick = null;
let lockBoard = true;     // Start 누르기 전까지 잠금
let moves = 0;
let matches = 0;
let gameReady = false;    // API + 이미지 프리로드 완료 여부
let gameStarted = false;  // Start 버튼 눌러서 실제 플레이 시작했는지

restartBtn?.addEventListener("click", () => initGame());
startBtn?.addEventListener("click", () => startGame());

initGame();

/* ---------------- Game Flow ---------------- */

async function initGame() {
  // Reset state
  deck = [];
  firstPick = null;
  secondPick = null;
  lockBoard = true;
  gameReady = false;
  gameStarted = false;

  moves = 0;
  matches = 0;
  if (movesEl) movesEl.textContent = String(moves);
  if (matchesEl) matchesEl.textContent = String(matches);

  if (boardEl) boardEl.innerHTML = "";
  if (statusEl) statusEl.textContent = "포켓몬 카드를 불러오는 중...";

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = "로딩 중...";
  }

  try {
    // 10마리 랜덤 선택
    const ids = pickUniqueRandomIds(BOARD_SIZE_PAIRS, 1, MAX_POKEMON_ID);

    // 이미지(/pokemon) + 한글이름(/pokemon-species) 합치기
    const pokemons = await fetchPokemonsWithKoreanNames(ids);

    // 2장씩 만들어서 20장
    const pairs = pokemons.flatMap((p) => ([
      makeCardData(p, 0),
      makeCardData(p, 1),
    ]));

    deck = shuffleArray(pairs);

    renderDeck(deck);

    // iPad에서 두번째 카드가 늦게 보이는 느낌 방지: 전부 프리로드
    await preloadImages([
      BACK_IMAGE_URL,
      ...deck.map(c => c.image),
    ]);

    gameReady = true;
    if (statusEl) statusEl.textContent = "준비 완료! ‘게임 시작’을 누르면 2초간 전체 카드가 공개돼요.";
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "게임 시작";
    }
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "불러오기에 실패했어요. 잠시 후 다시 시도해주세요.";
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = "게임 시작";
    }
  }
}

function startGame() {
  if (!gameReady || gameStarted) return;

  gameStarted = true;
  lockBoard = true;
  if (startBtn) startBtn.disabled = true;

  if (statusEl) statusEl.textContent = "2초 동안 전체 카드 공개!";
  revealAllCards(true);

  setTimeout(() => {
    revealAllCards(false);
    lockBoard = false;
    if (statusEl) statusEl.textContent = "시작! 카드를 뒤집어 같은 포켓몬 2장을 맞춰보세요!";
  }, 2500);
}

function revealAllCards(isOpen) {
  if (!boardEl) return;
  const cards = boardEl.querySelectorAll(".card");
  cards.forEach((c) => {
    if (isOpen) c.classList.add("is-flipped");
    else {
      // 맞춘 카드는 계속 열어둠
      if (!c.classList.contains("is-matched")) c.classList.remove("is-flipped");
    }
  });
}

function onCardClick(cardEl, cardData) {
  // Start 전에는 클릭 막기
  if (!gameStarted) return;

  if (lockBoard) return;
  if (cardData.matched) return;
  if (cardEl.classList.contains("is-flipped")) return;

  flipCard(cardEl);

  if (!firstPick) {
    firstPick = { el: cardEl, data: cardData };
    return;
  }

  secondPick = { el: cardEl, data: cardData };
  moves++;
  if (movesEl) movesEl.textContent = String(moves);

  lockBoard = true;

  const isMatch = firstPick.data.pokemonId === secondPick.data.pokemonId;

  if (isMatch) {
    firstPick.data.matched = true;
    secondPick.data.matched = true;

    firstPick.el.classList.add("is-matched");
    secondPick.el.classList.add("is-matched");

    matches++;
    if (matchesEl) matchesEl.textContent = String(matches);

    resetPicks();
    lockBoard = false;

    if (statusEl) {
      statusEl.textContent = (matches === BOARD_SIZE_PAIRS)
        ? `🎉 성공! 총 이동 수: ${moves}번`
        : `✅ 정답! (${matches}/${BOARD_SIZE_PAIRS})`;
    }
  } else {
    if (statusEl) statusEl.textContent = "❌ 틀렸어요! 다시 찾아보세요.";

    // 두 장이 확실히 보일 시간 확보 후 닫기
    setTimeout(() => {
      unflipCard(firstPick.el);
      unflipCard(secondPick.el);
      resetPicks();
      lockBoard = false;
    }, 900);
  }
}

function resetPicks() {
  firstPick = null;
  secondPick = null;
}

function flipCard(cardEl) {
  cardEl.classList.add("is-flipped");
}

function unflipCard(cardEl) {
  cardEl.classList.remove("is-flipped");
}

/* ---------------- Data Fetch ---------------- */

/**
 * /pokemon/{id} 에서 이미지
 * /pokemon-species/{id} 에서 한글 이름
 */
async function fetchPokemonsWithKoreanNames(ids) {
  const results = await Promise.all(
    ids.map(async (id) => {
      const [pokemonRes, speciesRes] = await Promise.all([
        fetch(`${POKEAPI_BASE}/pokemon/${id}`),
        fetch(`${POKEAPI_BASE}/pokemon-species/${id}`),
      ]);

      if (!pokemonRes.ok) throw new Error(`pokemon fetch error: ${pokemonRes.status}`);
      if (!speciesRes.ok) throw new Error(`species fetch error: ${speciesRes.status}`);

      const pokemonData = await pokemonRes.json();
      const speciesData = await speciesRes.json();

      // 한글 이름 찾기
      const koreanNameObj = Array.isArray(speciesData?.names)
        ? speciesData.names.find((n) => n?.language?.name === "ko")
        : null;

      const koreanName = koreanNameObj?.name || pokemonData.name;

      // 이미지 우선순위: official-artwork > front_default
      const image =
        pokemonData?.sprites?.other?.["official-artwork"]?.front_default ||
        pokemonData?.sprites?.front_default;

      if (!image) throw new Error(`No image for pokemon ${id}`);

      return {
        id: pokemonData.id,
        name: koreanName, // ✅ 한글
        image,
      };
    })
  );

  return results;
}

/* ---------------- Render ---------------- */

function makeCardData(pokemon, dupIndex) {
  return {
    key: `${pokemon.id}-${dupIndex}-${cryptoRandom()}`,
    pokemonId: pokemon.id,
    name: pokemon.name,
    image: pokemon.image,
    matched: false,
  };
}

function renderDeck(cards) {
  if (!boardEl) return;

  const frag = document.createDocumentFragment();

  cards.forEach((card) => {
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.dataset.key = card.key;
    wrap.dataset.pokemonId = String(card.pokemonId);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "카드 뒤집기");
    btn.addEventListener("click", () => onCardClick(wrap, card));

    const back = document.createElement("div");
    back.className = "face back";
    back.innerHTML = `
      <img src="${BACK_IMAGE_URL}" alt="카드 뒷면 피카츄" loading="eager" decoding="async">
      <div class="badge">POKÉMON</div>
    `;

    const front = document.createElement("div");
    front.className = "face front";
    front.innerHTML = `
      <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}" loading="eager" decoding="async">
      <div class="badge">#${card.pokemonId} • ${escapeHtml(card.name)}</div>
    `;

    btn.appendChild(back);
    btn.appendChild(front);
    wrap.appendChild(btn);
    frag.appendChild(wrap);
  });

  boardEl.appendChild(frag);
}

/* ---------------- Utils ---------------- */

function pickUniqueRandomIds(count, min, max) {
  const set = new Set();
  while (set.size < count) {
    const n = Math.floor(Math.random() * (max - min + 1)) + min;
    set.add(n);
  }
  return Array.from(set);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cryptoRandom() {
  if (window.crypto && crypto.getRandomValues) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return `${buf[0].toString(16)}${buf[1].toString(16)}`;
  }
  return Math.random().toString(16).slice(2);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function preloadImages(urls) {
  const unique = Array.from(new Set(urls));
  return Promise.all(
    unique.map((url) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    }))
  );
}
