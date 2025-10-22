/***************************************
  app.js — lengkap (Login, Game, Topup)
  Firebase config: user-provided (filled below)
****************************************/

/* ========== Firebase config (you provided) ========== */
const firebaseConfig = {
  apiKey: "AIzaSyCO03DM8ausjYirXTsXEP4jW-RBQrjsVKo",
  authDomain: "black-jack-game-ab188.firebaseapp.com",
  databaseURL: "https://black-jack-game-ab188-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "black-jack-game-ab188",
  storageBucket: "black-jack-game-ab188.firebasestorage.app",
  messagingSenderId: "836036444317",
  appId: "1:836036444317:web:b1a9060bc3469edae71474"
};
firebase.initializeApp(firebaseConfig);

/* Firebase services */
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

/* ========== DOM refs ========== */
const authContainer = document.getElementById("authContainer");
const gameContainer = document.getElementById("gameContainer");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authMessage = document.getElementById("authMessage");

const userEmailDisplay = document.getElementById("userEmailDisplay");
const balanceEl = document.getElementById("balance");

const placeBetBtn = document.getElementById("place-bet");
const startBtn = document.getElementById("start-round");
const hitBtn = document.getElementById("hit-btn");
const standBtn = document.getElementById("stand-btn");
const betAmountInput = document.getElementById("bet-amount");

const playerHandEl = document.getElementById("player-hand");
const dealerHandEl = document.getElementById("dealer-hand");
const playerValueEl = document.getElementById("player-value");
const dealerValueEl = document.getElementById("dealer-value");
const messageEl = document.getElementById("message");

const topupBtn = document.getElementById("topupBtn");
const topupModal = document.getElementById("topupModal");
const closeModalBtn = document.getElementById("closeModal");
const packageButtons = document.querySelectorAll(".package");
const paymentInstructions = document.getElementById("paymentInstructions");
const transferAmountSpan = document.getElementById("transferAmount");
const proofInput = document.getElementById("proofImage");
const submitProofBtn = document.getElementById("submitProof");

/* ========== State ========== */
let currentUser = null;
let userChips = 5000;
let deck = [];
let playerHand = [];
let dealerHand = [];
let roundActive = false;
let selectedChip = 0;
let selectedPrice = 0;

/* ========== Utilities: Deck & Values ========== */
function buildDeck() {
  const suits = ["H","D","C","S"];
  const vals = ["A","2","3","4","5","6","7","8","9","0","J","Q","K"];
  const d = [];
  for (const s of suits) for (const v of vals) d.push(v + s + ".png");
  // shuffle
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardValueFilename(fname) {
  const v = fname[0];
  if (v === 'A') return 11;
  if (['K','Q','J','0'].includes(v)) return 10;
  return parseInt(v);
}

function calcHandValueFromFilenames(arr) {
  let total = 0, aces = 0;
  for (const f of arr) {
    const val = cardValueFilename(f);
    total += val;
    if (f[0] === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

/* ========== Render helpers ========== */
function renderPlayerHands(hideDealerSecond = true) {
  playerHandEl.innerHTML = '';
  dealerHandEl.innerHTML = '';

  playerHand.forEach(f => {
    const img = document.createElement('img');
    img.className = 'card';
    img.src = `https://deckofcardsapi.com/static/img/${f}`;
    playerHandEl.appendChild(img);
  });

  dealerHand.forEach((f, i) => {
    const img = document.createElement('img');
    img.className = 'card';
    if (hideDealerSecond && i === 1) {
      img.src = "https://deckofcardsapi.com/static/img/back.png";
      img.classList.add('back');
    } else {
      img.src = `https://deckofcardsapi.com/static/img/${f}`;
    }
    dealerHandEl.appendChild(img);
  });
}

/* ========== UI updates ========== */
function updateUIChips() {
  balanceEl.textContent = `Saldo: ${userChips} 💰`;
}

/* ========== Auth: register / login / state ========== */
registerBtn.addEventListener('click', async () => {
  const email = document.getElementById('regEmail').value;
  const pass = document.getElementById('regPassword').value;
  if (!email || !pass) { authMessage.textContent = 'Lengkapi email & password'; return; }
  try {
    const uc = await auth.createUserWithEmailAndPassword(email, pass);
    const uid = uc.user.uid;
    // create initial record
    await db.ref('users/' + uid).set({ email, chips: 5000, createdAt: Date.now() });
    authMessage.style.color = 'lime';
    authMessage.textContent = 'Registrasi berhasil — silakan login';
  } catch (err) {
    authMessage.style.color = 'salmon';
    authMessage.textContent = err.message;
  }
});

loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPassword').value;
  if (!email || !pass) { authMessage.textContent = 'Lengkapi email & password'; return; }
  try {
    const uc = await auth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged will handle UI
  } catch (err) {
    authMessage.style.color = 'salmon';
    authMessage.textContent = err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await auth.signOut();
});

/* Fire auth state */
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    authContainer.style.display = 'none';
    gameContainer.style.display = 'block';
    userEmailDisplay.textContent = `👤 ${user.email}`;
    // load chips from DB
    const snap = await db.ref('users/' + user.uid + '/chips').once('value');
    const val = snap.exists() ? snap.val() : 5000;
    userChips = val || 5000;
    updateUIChips();
    // ensure DB node exists
    await db.ref('users/' + user.uid).update({ email: user.email });
  } else {
    currentUser = null;
    authContainer.style.display = 'block';
    gameContainer.style.display = 'none';
  }
});

/* ========== Game flow ========== */
placeBetBtn.addEventListener('click', () => {
  const bet = parseInt(betAmountInput.value);
  if (isNaN(bet) || bet < 10 || bet > 10000) return alert('Taruhan 10 - 10.000');
  if (bet > userChips) return alert('Chip tidak cukup!');
  // store bet in data-* so start can use it
  placeBetBtn.dataset.bet = bet;
  messageEl.textContent = `Taruhan ${bet} dipasang — klik Mulai Ronde`;
  startBtn.disabled = false;
  placeBetBtn.disabled = true;
  betAmountInput.disabled = true;
});

startBtn.addEventListener('click', async () => {
  const bet = parseInt(placeBetBtn.dataset.bet || '0');
  if (!bet) return alert('Pasang taruhan dulu!');
  // deduct immediately
  userChips -= bet;
  updateUIChips();
  // persist
  if (currentUser) db.ref('users/' + currentUser.uid + '/chips').set(userChips);

  // prepare deck & hands
  const d = buildDeck();
  playerHand = [d.pop(), d.pop()];
  dealerHand = [d.pop(), d.pop()];
  deck = d;
  roundActive = true;

  renderPlayerHands(true);
  playerValueEl.textContent = `Nilai Kamu: ${calcHandValueFromFilenames(playerHand)}`;
  dealerValueEl.textContent = `Nilai Dealer: ?`;
  messageEl.textContent = 'Giliranmu — Hit atau Stand';

  startBtn.disabled = true;
  hitBtn.disabled = false;
  standBtn.disabled = false;
});

hitBtn.addEventListener('click', () => {
  if (!roundActive) return;
  const c = deck.pop();
  playerHand.push(c);
  renderPlayerHands(true);
  const pval = calcHandValueFromFilenames(playerHand);
  playerValueEl.textContent = `Nilai Kamu: ${pval}`;
  if (pval > 21) {
    // busted
    messageEl.textContent = '💥 Kamu Bust! Dealer menang.';
    settleRound('bust');
  }
});

standBtn.addEventListener('click', async () => {
  if (!roundActive) return;
  // reveal dealer second card
  renderPlayerHands(false);
  dealerValueEl.textContent = `Nilai Dealer: ${calcHandValueFromFilenames(dealerHand)}`;
  // dealer draws until 17
  while (calcHandValueFromFilenames(dealerHand) < 17) {
    dealerHand.push(deck.pop());
    renderPlayerHands(false);
    dealerValueEl.textContent = `Nilai Dealer: ${calcHandValueFromFilenames(dealerHand)}`;
    await new Promise(r => setTimeout(r, 420));
  }
  settleRound('compare');
});

/* settleRound: determine outcome, payout, update DB, auto clear in 3s */
async function settleRound(reason) {
  roundActive = false;
  const bet = parseInt(placeBetBtn.dataset.bet || '0');
  const pVal = calcHandValueFromFilenames(playerHand);
  const dVal = calcHandValueFromFilenames(dealerHand);
  let outcome = 'lose';
  if (reason === 'bust') outcome = 'lose';
  else if (reason === 'compare') {
    if (dVal > 21) outcome = 'win';
    else if (pVal > dVal) outcome = 'win';
    else if (pVal === dVal) outcome = 'draw';
    else outcome = 'lose';
  } else if (reason === 'blackjack') {
    outcome = 'blackjack';
  }

  if (outcome === 'blackjack') {
    const pay = Math.floor(bet * 2.5);
    userChips += pay;
    messageEl.textContent = `🖤 Blackjack! Kamu menang ${pay} chip (2.5×).`;
  } else if (outcome === 'win') {
    const pay = bet * 2;
    userChips += pay;
    messageEl.textContent = `🏆 Kamu menang! Dapat ${pay} chip (2×).`;
  } else if (outcome === 'draw') {
    userChips += bet;
    messageEl.textContent = `🤝 Seri. Taruhan dikembalikan (${bet}).`;
  } else {
    messageEl.textContent = `❌ Kamu kalah. Dealer ${dVal}, Kamu ${pVal}.`;
  }

  // update DB
  if (currentUser) {
    await db.ref('users/' + currentUser.uid + '/chips').set(userChips);
    // log into transactions node (optional)
    const tx = {
      type: outcome === 'win' || outcome === 'blackjack' ? 'win' : (outcome === 'draw' ? 'draw' : 'lose'),
      bet: bet,
      resultingChips: userChips,
      date: new Date().toISOString()
    };
    await db.ref('users/' + currentUser.uid + '/transactions').push(tx);
  }

  updateUIChips();

  // reset UI after 3s
  setTimeout(() => {
    playerHand = []; dealerHand = [];
    playerHandEl.innerHTML = '';
    dealerHandEl.innerHTML = '';
    playerValueEl.textContent = 'Nilai Kamu: 0';
    dealerValueEl.textContent = 'Nilai Dealer: ?';
    messageEl.textContent = 'Pasang taruhan untuk ronde berikutnya.';
    // reset bet controls
    placeBetBtn.dataset.bet = 0;
    startBtn.disabled = true;
    placeBetBtn.disabled = false;
    betAmountInput.disabled = false;
    hitBtn.disabled = true;
    standBtn.disabled = true;
  }, 3000);
}

/* ========== Top-up (manual bank transfer) ========== */
topupBtn.addEventListener('click', () => {
  topupModal.style.display = 'block';
  paymentInstructions.style.display = 'none';
});

closeModalBtn.addEventListener('click', () => {
  topupModal.style.display = 'none';
  paymentInstructions.style.display = 'none';
});

packageButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedChip = parseInt(btn.dataset.amount);
    selectedPrice = parseInt(btn.dataset.price);
    transferAmountSpan.textContent = `Rp${selectedPrice.toLocaleString('id-ID')}`;
    paymentInstructions.style.display = 'block';
  });
});

submitProofBtn.addEventListener('click', async () => {
  const file = proofInput.files[0];
  if (!file) { alert('Silakan pilih file bukti transfer!'); return; }
  if (!currentUser) { alert('User belum login'); return; }

  const uid = currentUser.uid;
  const storageRef = storage.ref().child(`proofs/${uid}_${Date.now()}.jpg`);
  const uploadTask = storageRef.put(file);

  uploadTask.on('state_changed', null, (err) => {
    console.error(err);
    alert('Gagal upload bukti');
  }, async () => {
    const url = await uploadTask.snapshot.ref.getDownloadURL();
    const time = new Date().toISOString();
    // push pending_topups
    await db.ref('pending_topups').push({
      uid,
      amount_chip: selectedChip,
      amount_price: selectedPrice,
      proof_url: url,
      date: time,
      status: 'pending'
    });
    alert('Bukti dikirim. Menunggu verifikasi admin.');
    topupModal.style.display = 'none';
    paymentInstructions.style.display = 'none';
    proofInput.value = '';
  });
});

/* close modal on click outside */
window.addEventListener('click', (e) => {
  if (e.target === topupModal) {
    topupModal.style.display = 'none';
    paymentInstructions.style.display = 'none';
  }
});

/* init */
updateUIChips();
messageEl.textContent = 'Selamat datang — silakan login atau daftar untuk mulai.';
