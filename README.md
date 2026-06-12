# 🍽️ 오늘 뭐 먹지? — 배달 메뉴 추천 웹사이트

기분, 예산, 인원수를 입력하면 오늘 먹을 배달 음식을 3~5개 추천해 주는 웹사이트입니다.
외부 API 없이 내장 메뉴 데이터베이스로 동작해서 **운영 비용이 0원**입니다.

## 주요 기능

| 기능 | 설명 |
|---|---|
| 로그인/회원가입 | Firebase Authentication (이메일 + 비밀번호, 영문+숫자+기호 필수) |
| 메뉴 추천 | 내장 메뉴 41종에서 기분/예산/인원 기반 추천 (최근 먹은 메뉴 중복 방지) |
| 오늘의 랜덤 메뉴 | 기분 상관없이 전체 메뉴에서 즉시 랜덤 추천 |
| 카카오맵 연결 | 추천 메뉴 클릭 시 주변 식당 검색 |
| 최근 먹은 메뉴 | Firebase에 저장, 기기 간 동기화, 최대 7개 + 개별 삭제 |
| 관리자 화면 | 공지사항 작성/수정/삭제 → 일반 유저 메인에 표시 |

## 파일 구성

```
index.html              메인 페이지 (로그인/유저/관리자 화면 모두 포함)
css/style.css           스타일 (주황/노랑 따뜻한 색감, 모바일 반응형)
js/app.js               앱 로직 (인증, DB, 추천 알고리즘, 내장 메뉴 DB)
js/firebase-config.js   Firebase 설정
database.rules.json     Firebase 보안 규칙 (콘솔에 붙여넣기)
```

---

## 설정 방법 (처음 1번만)

### 1. Firebase 프로젝트 만들기

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 **프로젝트 추가**
2. **빌드 > Authentication > 시작하기 > 로그인 방법 > 이메일/비밀번호** 사용 설정
3. **빌드 > Realtime Database > 데이터베이스 만들기**
4. **프로젝트 설정(⚙️) > 일반 > 내 앱 > 웹 앱(`</>`) 추가** 후 표시되는
   `firebaseConfig` 값을 복사해서 `js/firebase-config.js`에 붙여넣기

### 2. 보안 규칙 적용

Realtime Database > **규칙** 탭에 `database.rules.json` 내용을 그대로 붙여넣고 **게시**합니다.

### 3. 관리자 지정

1. 관리자로 쓸 계정으로 사이트에서 회원가입
2. Firebase 콘솔 > **Authentication > 사용자**에서 해당 계정의 **UID** 복사
3. Realtime Database > 데이터 탭에서 아래처럼 직접 추가:

```
admins
 └─ (복사한 UID): true
```

이후 그 계정으로 로그인하면 관리자 화면이 표시됩니다.

### 4. GitHub + Vercel 배포

```bash
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/내아이디/저장소이름.git
git push -u origin main
```

1. [Vercel](https://vercel.com/)에서 **Add New > Project** → GitHub 저장소 선택
2. 프레임워크는 **Other**, 설정 변경 없이 **Deploy** (정적 사이트라 빌드 불필요)
3. 배포된 도메인(`xxx.vercel.app`)을 Firebase 콘솔 >
   **Authentication > 설정 > 승인된 도메인**에 추가

---

## 추천 알고리즘

1. 선택한 **기분** 태그가 붙은 메뉴만 후보로 선정
2. **예산** 안에 들어가는 메뉴만 필터 (인원수 × 1인 가격 + 배달비 3,000원 기준)
3. **최근 먹은 메뉴**(Firebase 기록)는 제외해서 중복 방지
4. 후보가 3개 미만이면 조건을 단계적으로 완화
5. 무작위로 섞어 최대 5개를 카드로 표시

메뉴를 추가하고 싶으면 `js/app.js`의 `MENU_DB` 배열에 같은 형식으로 항목을 넣으면 됩니다:

```js
{ name: "메뉴명", category: "카테고리", price: 10000, moods: ["든든하게"], reason: "한 줄 추천 이유" },
```

## Firebase 용량 최소화 설계

무료(Spark) 요금제 기준으로 용량과 트래픽을 아끼도록 설계했습니다.

- **짧은 키 사용**: `users/recent/menuName` 대신 `u/r/n` 처럼 한 글자 키로 저장
- **최근 메뉴 7개 제한**: 8개째 저장 시 가장 오래된 기록을 자동 삭제
- **읽기 제한**: 공지는 `limitToLast(5)`, 최근 메뉴는 `limitToLast(7)`만 구독
- **추천은 전부 로컬 처리**: 추천/랜덤은 브라우저에서 계산, DB에는 먹은 메뉴명만 저장

## 데이터 구조

```
admins/{uid}: true              관리자 목록 (콘솔에서 직접 등록)
u/{uid}/r/{id}: {n, d}          최근 먹은 메뉴 (n=메뉴명, d=날짜)
n/{id}: {t, c, d}               공지사항 (t=제목, c=내용, d=날짜)
```
