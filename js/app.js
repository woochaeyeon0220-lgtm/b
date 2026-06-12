// ============================================================
// 오늘 뭐 먹지? - 배달 메뉴 추천 웹앱
//  - Firebase Authentication: 이메일/비밀번호 로그인
//  - Firebase Realtime Database: 최근 먹은 메뉴, 공지사항 (용량 최소화: 짧은 키 사용)
//  - Claude API: 기분/예산/인원 기반 메뉴 추천
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  get,
  onValue,
  query,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ------------------------------------------------------------
// Claude API 설정
// 비용을 더 아끼고 싶으면 MODEL을 "claude-haiku-4-5"로 바꾸세요.
// ------------------------------------------------------------
const MODEL = "claude-opus-4-8";
const API_KEY_STORAGE = "claude_api_key";

// 응답을 항상 JSON으로 받기 위한 스키마 (structured outputs)
const MENU_SCHEMA = {
  type: "object",
  properties: {
    menus: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          price: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["name", "category", "price", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["menus"],
  additionalProperties: false,
};

// ------------------------------------------------------------
// 내장 메뉴 데이터베이스 (1인 기준 가격, API 키 없이도 추천 가능)
// moods: 어떤 기분 버튼에 추천될지 태그
// ------------------------------------------------------------
const MENU_DB = [
  // 든든하게
  { name: "치킨", category: "치킨", price: 20000, moods: ["든든하게"], reason: "고민될 땐 역시 국민 야식 치킨!" },
  { name: "제육볶음", category: "한식", price: 10000, moods: ["든든하게", "매운 거"], reason: "밥 두 공기 부르는 매콤달콤 제육." },
  { name: "돼지국밥", category: "한식", price: 10000, moods: ["든든하게"], reason: "뜨끈한 국물에 밥 말아 든든하게." },
  { name: "돈카츠", category: "일식", price: 11000, moods: ["든든하게"], reason: "바삭바삭 든든한 일식 정식." },
  { name: "보쌈", category: "한식", price: 28000, moods: ["든든하게"], reason: "푸짐하게 고기가 당기는 날." },
  { name: "족발", category: "한식", price: 30000, moods: ["든든하게"], reason: "쫄깃한 족발에 새콤한 막국수까지." },
  { name: "피자", category: "양식", price: 22000, moods: ["든든하게"], reason: "여럿이 나눠 먹기 최고." },
  { name: "햄버거 세트", category: "양식", price: 9000, moods: ["든든하게"], reason: "빠르고 간편하게 든든하게." },
  { name: "부대찌개", category: "한식", price: 11000, moods: ["든든하게", "매운 거"], reason: "햄과 라면사리가 빠질 수 없지." },
  { name: "김치찌개", category: "한식", price: 9000, moods: ["든든하게", "매운 거"], reason: "얼큰하고 든든한 기본 한 끼." },
  { name: "닭갈비", category: "한식", price: 12000, moods: ["든든하게", "매운 거"], reason: "매콤한 닭갈비에 볶음밥 마무리." },
  { name: "짜장면+탕수육", category: "중식", price: 14000, moods: ["든든하게"], reason: "실패 없는 클래식 중식 조합." },
  { name: "카레라이스", category: "일식", price: 9000, moods: ["든든하게"], reason: "부담 없이 든든한 한 그릇." },
  { name: "파스타", category: "양식", price: 13000, moods: ["든든하게"], reason: "기분 내고 싶은 날의 선택." },
  { name: "우동+미니돈가스", category: "일식", price: 10000, moods: ["든든하게"], reason: "따뜻한 국물과 바삭함을 한 번에." },

  // 가볍게
  { name: "샐러드 볼", category: "샐러드", price: 10000, moods: ["가볍게"], reason: "가볍게 챙기는 건강한 한 끼." },
  { name: "초밥", category: "일식", price: 15000, moods: ["가볍게"], reason: "가볍지만 만족스러운 한 끼." },
  { name: "쌀국수", category: "아시안", price: 11000, moods: ["가볍게"], reason: "속 편하고 따뜻한 국물 요리." },
  { name: "김밥+라면", category: "분식", price: 7000, moods: ["가볍게"], reason: "저렴하고 빠른 국민 조합." },
  { name: "샌드위치", category: "카페", price: 8000, moods: ["가볍게"], reason: "간단하지만 알찬 한 끼." },
  { name: "포케", category: "샐러드", price: 12000, moods: ["가볍게"], reason: "신선한 재료로 가볍고 건강하게." },
  { name: "연어덮밥", category: "일식", price: 14000, moods: ["가볍게"], reason: "부드러운 연어로 깔끔한 한 끼." },
  { name: "비빔밥", category: "한식", price: 9000, moods: ["가볍게"], reason: "야채 가득, 속 편한 선택." },
  { name: "콩나물국밥", category: "한식", price: 8000, moods: ["가볍게"], reason: "시원하고 개운한 해장 겸 한 끼." },
  { name: "월남쌈", category: "아시안", price: 13000, moods: ["가볍게"], reason: "야채 듬뿍, 가볍게 즐기는 별미." },

  // 매운 거
  { name: "마라탕", category: "중식", price: 13000, moods: ["매운 거"], reason: "얼얼하게 스트레스 날리기 좋아요." },
  { name: "떡볶이", category: "분식", price: 12000, moods: ["매운 거"], reason: "매콤달콤, 영원한 분식의 왕." },
  { name: "불닭", category: "치킨", price: 18000, moods: ["매운 거"], reason: "화끈하게 매운맛이 당길 때." },
  { name: "짬뽕", category: "중식", price: 10000, moods: ["매운 거", "든든하게"], reason: "얼큰한 국물에 해물 가득." },
  { name: "쭈꾸미볶음", category: "한식", price: 13000, moods: ["매운 거"], reason: "매콤한 쭈꾸미에 볶음밥은 진리." },
  { name: "매운 갈비찜", category: "한식", price: 25000, moods: ["매운 거", "든든하게"], reason: "매운맛과 든든함을 동시에." },
  { name: "닭발", category: "한식", price: 16000, moods: ["매운 거"], reason: "스트레스 확 풀리는 화끈한 맛." },
  { name: "김치찜", category: "한식", price: 12000, moods: ["매운 거"], reason: "푹 익은 김치와 고기의 조합." },

  // 달달한 거
  { name: "와플+아이스크림", category: "디저트", price: 9000, moods: ["달달한 거"], reason: "당 충전이 필요한 순간!" },
  { name: "버블티+토스트", category: "디저트", price: 8000, moods: ["달달한 거"], reason: "달달한 게 당기는 날의 간식 세트." },
  { name: "조각케이크 세트", category: "디저트", price: 12000, moods: ["달달한 거"], reason: "오늘 하루 고생한 나에게 주는 선물." },
  { name: "도넛 세트", category: "디저트", price: 10000, moods: ["달달한 거"], reason: "커피와 함께하면 행복 두 배." },
  { name: "빙수", category: "디저트", price: 13000, moods: ["달달한 거"], reason: "시원하고 달콤한 디저트 한 그릇." },
  { name: "크로플+음료", category: "디저트", price: 9000, moods: ["달달한 거"], reason: "겉바속촉 크로플의 유혹." },
  { name: "허니브레드", category: "디저트", price: 10000, moods: ["달달한 거"], reason: "버터와 꿀의 달콤한 조합." },
  { name: "마카롱+라떼", category: "디저트", price: 11000, moods: ["달달한 거"], reason: "예쁘고 달콤한 오후의 여유." },
];

// ------------------------------------------------------------
// DOM 헬퍼
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let toastTimer = null;
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

function todayString() {
  const d = new Date();
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// ------------------------------------------------------------
// 상태
// ------------------------------------------------------------
let currentUser = null;
let recentCache = []; // [{key, n, d}] - 최근 먹은 메뉴 로컬 캐시 (DB 읽기 최소화)
let detachFns = []; // 로그아웃 시 해제할 리스너 목록
let editingNoticeKey = null;

// ------------------------------------------------------------
// API 키 관리 (Firebase가 아닌 브라우저 localStorage에 저장 → DB 용량 0)
// ------------------------------------------------------------
$("api-key-input").value = localStorage.getItem(API_KEY_STORAGE) || "";

$("api-key-save").addEventListener("click", () => {
  const key = $("api-key-input").value.trim();
  if (!key) {
    toast("API 키를 입력해주세요.");
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, key);
  toast("API 키가 이 브라우저에 저장되었습니다.");
});

function getApiKey() {
  return ($("api-key-input").value || "").trim() || localStorage.getItem(API_KEY_STORAGE) || "";
}

// ------------------------------------------------------------
// 로그인 / 회원가입
// ------------------------------------------------------------
let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  $("tab-login").classList.toggle("active", mode === "login");
  $("tab-signup").classList.toggle("active", mode === "signup");
  $("auth-submit").textContent = mode === "login" ? "로그인" : "회원가입";
  $("password-hint").classList.toggle("hidden", mode === "login");
  $("auth-error").textContent = "";
}

$("tab-login").addEventListener("click", () => setAuthMode("login"));
$("tab-signup").addEventListener("click", () => setAuthMode("signup"));

// 영문 + 숫자 + 기호 조합, 8자 이상
function isValidPassword(pw) {
  return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(pw);
}

const AUTH_ERROR_MESSAGES = {
  "auth/email-already-in-use": "이미 가입된 이메일입니다.",
  "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
  "auth/user-not-found": "가입되지 않은 이메일입니다.",
  "auth/wrong-password": "비밀번호가 틀렸습니다.",
  "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  "auth/weak-password": "비밀번호가 너무 약합니다.",
};

$("auth-submit").addEventListener("click", async () => {
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const errorEl = $("auth-error");
  errorEl.textContent = "";

  if (!email || !password) {
    errorEl.textContent = "이메일과 비밀번호를 입력해주세요.";
    return;
  }

  if (authMode === "signup" && !isValidPassword(password)) {
    errorEl.textContent = "비밀번호는 8자 이상, 영문 + 숫자 + 기호를 모두 포함해야 합니다.";
    return;
  }

  $("auth-submit").disabled = true;
  try {
    if (authMode === "signup") {
      await createUserWithEmailAndPassword(auth, email, password);
      toast("회원가입 완료! 환영합니다 🎉");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    errorEl.textContent = AUTH_ERROR_MESSAGES[err.code] || `오류가 발생했습니다. (${err.code})`;
  } finally {
    $("auth-submit").disabled = false;
  }
});

$("auth-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("auth-submit").click();
});

$("logout-btn").addEventListener("click", () => signOut(auth));

// ------------------------------------------------------------
// 화면 전환 (로그인 상태 감시)
// ------------------------------------------------------------
function showView(view) {
  $("auth-view").classList.toggle("hidden", view !== "auth");
  $("user-view").classList.toggle("hidden", view !== "user");
  $("admin-view").classList.toggle("hidden", view !== "admin");
  $("logout-btn").classList.toggle("hidden", view === "auth");
}

onAuthStateChanged(auth, async (user) => {
  // 이전 리스너 정리
  detachFns.forEach((fn) => fn());
  detachFns = [];
  recentCache = [];
  currentUser = user;

  if (!user) {
    showView("auth");
    return;
  }

  // 관리자 여부 확인 (admins/{uid} === true)
  let isAdmin = false;
  try {
    const snap = await get(ref(db, `admins/${user.uid}`));
    isAdmin = snap.val() === true;
  } catch (_) {
    isAdmin = false;
  }

  if (isAdmin) {
    showView("admin");
    listenAdminNotices();
  } else {
    showView("user");
    listenRecentMenus();
    listenUserNotices();
  }
});

// ------------------------------------------------------------
// 입력 영역 (기분 / 인원 칩 선택)
// ------------------------------------------------------------
function setupChips(groupId) {
  const group = $(groupId);
  group.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    group.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
    chip.classList.add("selected");
  });
}
setupChips("mood-group");
setupChips("people-group");

function getSelected(groupId, attr) {
  const chip = $(groupId).querySelector(".chip.selected");
  return chip ? chip.dataset[attr] : null;
}

function peopleToNumber(people) {
  if (people === "1인") return 1;
  if (people === "2인") return 2;
  return 3;
}

// ------------------------------------------------------------
// Claude API 호출 - 메뉴 추천
// ------------------------------------------------------------
async function requestRecommendation(mood, budget, people, recentNames) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("NO_KEY");

  const avoid =
    recentNames.length > 0
      ? `\n최근에 먹은 메뉴: ${recentNames.join(", ")} → 이 메뉴들과 겹치지 않게 추천해줘.`
      : "";

  const userPrompt =
    `한국에서 배달 가능한 음식 메뉴를 3~5개 추천해줘.\n` +
    `- 기분/카테고리: ${mood}\n` +
    `- 총 예산: ${budget.toLocaleString()}원 (배달비 포함이므로 음식 가격은 예산보다 3,000~4,000원 정도 여유 있게)\n` +
    `- 인원: ${people}` +
    avoid +
    `\n각 메뉴는 name(메뉴명), category(카테고리), price(인원수에 맞는 예상 총 가격, 원 단위 숫자), reason(한 줄 추천 이유)로 답해줘. ` +
    `price는 반드시 예산 안에 들어야 해.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system:
        "너는 한국 배달 음식 추천 전문가야. 실제로 배달 앱에서 주문 가능한 현실적인 메뉴와 가격을 제시해.",
      output_config: { format: { type: "json_schema", schema: MENU_SCHEMA } },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("API 키가 올바르지 않습니다. 상단에서 키를 확인해주세요.");
    if (res.status === 429) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    if (res.status === 529) throw new Error("AI 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.");
    throw new Error(`AI 요청에 실패했습니다. (오류 코드 ${res.status})`);
  }

  const data = await res.json();
  const textBlock = data.content.find((b) => b.type === "text");
  return JSON.parse(textBlock.text).menus;
}

// ------------------------------------------------------------
// 내장 추천 (API 키 없이 동작, 비용 0)
// 기분 → 예산 → 최근 먹은 메뉴 순으로 필터링 후 3~5개 추첨
// ------------------------------------------------------------
function localRecommend(mood, budget, count, recentNames) {
  const recent = new Set(recentNames);
  const pool = MENU_DB.filter((m) => m.moods.includes(mood));

  // 1순위: 예산 OK + 최근에 안 먹은 메뉴
  let candidates = pool.filter((m) => !recent.has(m.name) && m.price * count + 3000 <= budget);
  // 후보가 부족하면 최근 먹은 메뉴도 허용
  if (candidates.length < 3) {
    candidates = pool.filter((m) => m.price * count + 3000 <= budget);
  }
  // 그래도 부족하면 예산 조건 완화 (가장 저렴한 순)
  if (candidates.length < 3) {
    candidates = [...pool].sort((a, b) => a.price - b.price);
  }

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5).map((m) => ({
    name: m.name,
    category: m.category,
    price: m.price * count,
    reason: m.reason,
  }));
}

$("recommend-btn").addEventListener("click", async () => {
  const mood = getSelected("mood-group", "mood");
  const budget = parseInt($("budget-input").value, 10);
  const people = getSelected("people-group", "people");

  if (!mood) return toast("기분/카테고리를 선택해주세요.");
  if (!budget || budget <= 0) return toast("예산을 입력해주세요.");
  if (!people) return toast("인원수를 선택해주세요.");

  const section = $("result-section");
  const loading = $("result-loading");
  const cards = $("result-cards");
  const recentNames = recentCache.map((r) => r.n);
  const useAI = !!getApiKey(); // 키가 있으면 AI 추천, 없으면 내장 추천

  section.classList.remove("hidden");
  cards.replaceChildren();
  section.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (!useAI) {
    renderMenuCards(localRecommend(mood, budget, peopleToNumber(people), recentNames));
    toast("기본 추천입니다. API 키를 입력하면 AI 맞춤 추천을 받을 수 있어요.");
    return;
  }

  loading.classList.remove("hidden");
  $("recommend-btn").disabled = true;

  try {
    const menus = await requestRecommendation(mood, budget, people, recentNames);
    renderMenuCards(menus);
  } catch (err) {
    // AI 호출 실패 시 내장 추천으로 대체
    renderMenuCards(localRecommend(mood, budget, peopleToNumber(people), recentNames));
    toast(`AI 추천에 실패해 기본 추천을 보여드려요. (${err.message})`);
  } finally {
    loading.classList.add("hidden");
    $("recommend-btn").disabled = false;
  }
});

// ------------------------------------------------------------
// 오늘의 랜덤 메뉴 (AI 호출 없이 즉시, 비용 0)
// ------------------------------------------------------------
$("random-btn").addEventListener("click", () => {
  const budget = parseInt($("budget-input").value, 10);
  const people = getSelected("people-group", "people");
  const count = people ? peopleToNumber(people) : 1;

  // 최근 먹은 메뉴 + 예산 조건으로 후보 필터링
  const recentNames = new Set(recentCache.map((r) => r.n));
  let candidates = MENU_DB.filter((m) => !recentNames.has(m.name));
  if (budget > 0) {
    candidates = candidates.filter((m) => m.price * count + 3000 <= budget);
  }
  if (candidates.length === 0) candidates = MENU_DB;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const menu = {
    ...pick,
    price: pick.price * count,
    reason: `🎲 오늘의 랜덤 픽! ${pick.reason}`,
  };

  $("result-section").classList.remove("hidden");
  renderMenuCards([menu]);
  $("result-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

// ------------------------------------------------------------
// 추천 결과 카드 렌더링
// ------------------------------------------------------------
function renderMenuCards(menus) {
  const container = $("result-cards");
  container.replaceChildren();

  menus.forEach((menu) => {
    const card = el("div", "menu-card");

    const top = el("div", "menu-card-top");
    const nameWrap = el("div");
    nameWrap.append(el("span", "menu-name", menu.name), el("span", "menu-category", menu.category));
    top.append(nameWrap, el("span", "menu-price", `약 ${Number(menu.price).toLocaleString()}원`));

    const reason = el("p", "menu-reason", menu.reason);

    const actions = el("div", "menu-card-actions");

    // 카카오맵에서 주변 식당 검색
    const mapLink = el("a", "btn-map", "🗺️ 주변 식당 찾기");
    mapLink.href = `https://map.kakao.com/?q=${encodeURIComponent(menu.name)}`;
    mapLink.target = "_blank";
    mapLink.rel = "noopener";

    const ateBtn = el("button", "btn btn-primary", "✅ 오늘 이거 먹었어요");
    ateBtn.addEventListener("click", () => saveEatenMenu(menu.name, ateBtn));

    actions.append(mapLink, ateBtn);
    card.append(top, reason, actions);
    container.append(card);
  });
}

// ------------------------------------------------------------
// 최근 먹은 메뉴 (Firebase, 최대 7개 유지로 용량 최소화)
// ------------------------------------------------------------
async function saveEatenMenu(name, button) {
  if (!currentUser) return;
  button.disabled = true;

  try {
    const recentRef = ref(db, `u/${currentUser.uid}/r`);

    // 7개 초과분은 가장 오래된 것부터 삭제 (push 키는 시간순 정렬됨)
    if (recentCache.length >= 7) {
      const sorted = [...recentCache].sort((a, b) => (a.key < b.key ? -1 : 1));
      const removeCount = recentCache.length - 6;
      for (let i = 0; i < removeCount; i++) {
        await remove(ref(db, `u/${currentUser.uid}/r/${sorted[i].key}`));
      }
    }

    // 짧은 키(n, d)로 저장해서 용량 절약
    await set(push(recentRef), { n: name, d: todayString() });
    toast(`"${name}" 기록 완료! 맛있게 드세요 😋`);
    button.textContent = "기록됨 ✔";
  } catch (err) {
    toast("저장에 실패했습니다. 다시 시도해주세요.");
    button.disabled = false;
  }
}

function listenRecentMenus() {
  const q = query(ref(db, `u/${currentUser.uid}/r`), limitToLast(7));
  const unsubscribe = onValue(q, (snap) => {
    recentCache = [];
    snap.forEach((child) => {
      recentCache.push({ key: child.key, ...child.val() });
    });
    renderRecentList();
  });
  detachFns.push(unsubscribe);
}

function renderRecentList() {
  const list = $("recent-list");
  list.replaceChildren();

  if (recentCache.length === 0) {
    list.append(el("li", "empty-text", "아직 기록이 없습니다."));
    return;
  }

  // 최신순으로 표시
  [...recentCache].reverse().forEach((item) => {
    const li = el("li", "recent-item");
    const left = el("div");
    left.append(el("span", "recent-name", item.n), el("span", "recent-date", item.d));

    const delBtn = el("button", "recent-delete", "🗑");
    delBtn.title = "삭제";
    delBtn.addEventListener("click", () => {
      remove(ref(db, `u/${currentUser.uid}/r/${item.key}`)).catch(() => toast("삭제에 실패했습니다."));
    });

    li.append(left, delBtn);
    list.append(li);
  });
}

// ------------------------------------------------------------
// 공지사항 - 일반 유저 (최근 5개만 읽어서 용량/트래픽 절약)
// ------------------------------------------------------------
function listenUserNotices() {
  const q = query(ref(db, "n"), limitToLast(5));
  const unsubscribe = onValue(q, (snap) => {
    const notices = [];
    snap.forEach((child) => notices.push({ key: child.key, ...child.val() }));
    renderNoticeList($("notice-list"), notices, false);
  });
  detachFns.push(unsubscribe);
}

// ------------------------------------------------------------
// 공지사항 - 관리자 (작성 / 수정 / 삭제)
// ------------------------------------------------------------
function listenAdminNotices() {
  const q = query(ref(db, "n"), limitToLast(50));
  const unsubscribe = onValue(q, (snap) => {
    const notices = [];
    snap.forEach((child) => notices.push({ key: child.key, ...child.val() }));
    renderNoticeList($("admin-notice-list"), notices, true);
  });
  detachFns.push(unsubscribe);
}

function renderNoticeList(listEl, notices, isAdmin) {
  listEl.replaceChildren();

  if (notices.length === 0) {
    listEl.append(el("li", "empty-text", "등록된 공지사항이 없습니다."));
    return;
  }

  // 최신순으로 표시
  notices.reverse().forEach((notice) => {
    const li = el("li", "notice-item");
    const head = el("div");
    head.append(el("span", "notice-title", notice.t), el("span", "notice-date", notice.d));
    li.append(head, el("p", "notice-content", notice.c));

    if (isAdmin) {
      const actions = el("div", "notice-actions");

      const editBtn = el("button", "btn btn-edit", "수정");
      editBtn.addEventListener("click", () => startEditNotice(notice));

      const delBtn = el("button", "btn btn-delete", "삭제");
      delBtn.addEventListener("click", () => {
        if (confirm(`"${notice.t}" 공지를 삭제할까요?`)) {
          remove(ref(db, `n/${notice.key}`)).catch(() => toast("삭제에 실패했습니다."));
        }
      });

      actions.append(editBtn, delBtn);
      li.append(actions);
    }

    listEl.append(li);
  });
}

function startEditNotice(notice) {
  editingNoticeKey = notice.key;
  $("admin-notice-title").value = notice.t;
  $("admin-notice-content").value = notice.c;
  $("admin-form-title").textContent = "공지사항 수정";
  $("admin-notice-submit").textContent = "수정 완료";
  $("admin-notice-cancel").classList.remove("hidden");
  $("admin-notice-title").focus();
}

function resetNoticeForm() {
  editingNoticeKey = null;
  $("admin-notice-title").value = "";
  $("admin-notice-content").value = "";
  $("admin-form-title").textContent = "공지사항 작성";
  $("admin-notice-submit").textContent = "등록하기";
  $("admin-notice-cancel").classList.add("hidden");
}

$("admin-notice-cancel").addEventListener("click", resetNoticeForm);

$("admin-notice-submit").addEventListener("click", async () => {
  const title = $("admin-notice-title").value.trim();
  const content = $("admin-notice-content").value.trim();

  if (!title || !content) return toast("제목과 내용을 모두 입력해주세요.");

  $("admin-notice-submit").disabled = true;
  try {
    if (editingNoticeKey) {
      await update(ref(db, `n/${editingNoticeKey}`), { t: title, c: content });
      toast("공지사항이 수정되었습니다.");
    } else {
      await set(push(ref(db, "n")), { t: title, c: content, d: todayString() });
      toast("공지사항이 등록되었습니다.");
    }
    resetNoticeForm();
  } catch (err) {
    toast("저장에 실패했습니다. 권한을 확인해주세요.");
  } finally {
    $("admin-notice-submit").disabled = false;
  }
});
