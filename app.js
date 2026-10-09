/* ============================================================
   2028 수시지원 대시보드 — app logic (vanilla JS, no deps) · 2027판에서 분기(2026-10-09)
   ============================================================ */
(function () {
'use strict';
const D = window.IPSI;
if (!D) { document.body.innerHTML = '<p style="padding:40px">data.js 로드 실패</p>'; return; }

/* ---------- decode dictionary-encoded rows into objects ---------- */
const dc = D.dicts;
const ROWS = D.rows.map((r, i) => ({
  _i: i,
  region: dc.region[r[0]] || '', sigun: dc.sigun[r[1]] || '', uni: dc.uni[r[2]] || '', gye: r[3] || '',
  dept: dc.dept[r[4]] || '', jhtype: r[5] || '', jhname: dc.jhname[r[6]] || '', jagyeok: dc.jagyeok[r[7]] || '',
  enroll: r[8], prev: r[9] || '', dkind: r[10] || 'none', dn: r[11],
  change: dc.change[r[12]] || '', choejeo: dc.choejeo[r[13]] || '', hasChoejeo: r[14], chKind: r[15] || '',
  c: [r[16], r[17], r[18]], g: [r[19], r[20], r[21]], v: [r[22], r[23], r[24]],
  chung: [r[25], r[26], r[27]],
  method: dc.method[r[28]] || '', note: dc.note[r[29]] || '', date: dc.date[r[30]] || '',
  gradeRatio: dc.gradeRatio[r[31]] || '', subjects: dc.subjects[r[32]] || '', careerSubj: dc.careerSubj[r[33]] || '',
  cats: r[34] || [],
  // 파서가 단일 값으로 환원하지 못해 버린 셀의 원문(희소 — 152행). SCHEMA 밖 사이드맵이라
  // 인덱스로 붙인다. 예: '남:5.20 · 여:3.20' — 값은 비우되 근거는 사용자에게 보여준다.
  raw: (D.raw && D.raw[i]) || null,
  // 추합이 산술 상한('지원자 − 모집인원')을 넘는 행(40건). 값은 그대로 보여주되
  // **유불리 자동 판정에서는 뺀다** — 원천이 무언가 다른 값을 담고 있다는 뜻이라
  // 증감 방향을 신뢰할 수 없다. 다만 경쟁률이 부분집계라 모순처럼 보일 수도 있어(창신대 사례)
  // 값 자체를 지우지는 않는다. 판단은 사용자 몫이다.
  chungDoubt: !!(D.chungDoubt && D.chungDoubt[i]),
  // 그 전형의 환산 척도가 해마다 옮겨간 행. 값은 맞지만 3개년을 한 선으로 읽으면 안 된다.
  vScale: !!(D.vScale && D.vScale[i]),
  // 2027 수시 최종 경쟁률 [경쟁률, 지원자수] — 원서접수 마감 후 대행사·대학 페이지 값. 모집인원이 요강과
  // 같은 행에만 붙였다(tools/ratio_compare/match27.py). 유불리 판정에는 넣지 않는다(판정은 2026 vs 2025 모델).
  c27: (D.c27 && D.c27[i]) || null,
  std26: dc.std ? (dc.std[r[35]] || '') : '', stdK26: r[36] || '',
  std25: dc.std ? (dc.std[r[37]] || '') : '',
  // 2024 입결 기준 — std25 는 쓰면서 std24 만 빠져 있었다. 5,097행에서 2026 기준과 달라
  // 3개년 추이가 기준이 다른 값을 이어 그렸다(70%컷과 평균을 한 선으로).
  std24: dc.std ? (dc.std[r[38]] || '') : '',
  // 복수지원 제약 — 22.2%(5,860행)에 '불가'·'학종 불가'·'3회' 같은 제한이 있다.
  // 수시 6회 안에서 전략을 짜는 데 직결되는데 화면에 아예 없었다.
  dupApply: dc.dupApply ? (dc.dupApply[r[39]] || '') : '',
  docs: dc.docs ? (dc.docs[r[40]] || '') : '',
}));

/* 신설 전형의 상속된 과거 실적은 build_data.py가 data.js 단계에서 비운다(전수 94행).
   여기서 다시 막지 않는다 — 방어를 두 군데 두면 어느 쪽이 진짜인지 알 수 없게 된다.
   verify_data.py가 '신설 행에 경쟁률·입결·추합이 없다'를 불변식으로 검사한다. */

/* ---------- 추합 단위 판별 ----------
   대부분의 대학은 추가합격을 '인원'으로 싣지만 동국대(139행)·연세대(1행)는 '충원율(배수)'로 싣는다.
   배수 × 2026 모집인원이 132/139에서 정수로 수렴해 확인했다(2027 인원으로는 112/140로 열등 —
   추합26은 2026 실적이므로 2026 인원이 맞는 짝이다).
   단위를 섞으면 '추합 0.29→1.57명', 'Math.round(0.75)=1명' 같은 표시가 나온다.
   25·24년 모집인원이 없어 전 연도를 인원으로 환산할 수는 없으므로 '표시 단위'를 행마다 구분한다.
   ⚠️ 연도 간 비교(yoyChung)는 같은 단위끼리라 그대로 유효하다 — 신호는 건드리지 않는다. */
ROWS.forEach(r => {
  r.chungRatio = r.chung.some(v => v != null && /^\d+\.\d+$/.test(String(v).trim()));
});
/* 대학별 원서접수 기간 — apply_dates.js(fetch_apply_dates.py 생성). 없으면 조용히 비활성. */
const APPLY = window.IPSI_APPLY || {};
const _DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
function applyInfo(uni) {
  const a = APPLY[uni];
  if (!a) return null;
  const p = t => { const d = new Date(t); return { d, s: `${d.getMonth() + 1}.${d.getDate()}(${_DOW_KO[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }; };
  const f = p(a.from), t = p(a.to);
  // 공통 마감(9/11)보다 이른 마감은 학생이 놓치기 딱 좋은 함정 — 강조 대상
  const early = t.d < new Date(2026, 8, 11);
  // ⚠️ 시각이 대학 공표값이 아닌 경우가 있다. 요강에 날짜만 적고 시각을 비워 둔 대학이 있고,
  //    그때 접수처 시스템 기본값(시작 00:00 · 마감 23:59)이 그대로 들어온다.
  //    실측 — 시작 00:00 이 10개교(건양·경동·광주·광주여·동신·목원·세한·우석·우송·중부),
  //    중부대 마감 23:59 는 요강 113쪽 어디에도 시각 표기가 없다(서류제출만 '17시까지'로 적는다).
  //    **마감을 실제보다 늦게 안내하는 쪽이 위험**하므로 단정하지 않고 꼬리표를 붙인다.
  // a.tconf = 시각이 대학 공표값으로 확인된 대학(fetch_apply_dates.py 가 표시). 휴리스틱을 끈다 —
  // 신한대·한라대는 요강에 23:59 가 그대로 적혀 있어 '미공표' 꼬리표가 오표시였다.
  const fromUnstated = !a.tconf && /T00:00$/.test(a.from);
  const toUnstated = !a.tconf && /T23:59$/.test(a.to);
  return { from: f.s, to: t.s, toDate: t.d, via: a.via, early, fromUnstated, toUnstated,
           unstated: fromUnstated || toUnstated,
           txt: `${f.s} ~ ${t.s}`, short: `~${t.s} 마감` };
}

/* 짧은 알림. 브라우저 alert()는 페이지를 멈춰 세우고 모바일에서 특히 거슬린다 —
   '지원희망 최대 6장'처럼 학생이 자주 마주치는 안내에는 흐름을 끊지 않는 토스트를 쓴다. */
let _toastT = null;
function toast(msg, kind) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  el.setAttribute('role', 'status');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { el.className = 'toast'; }, 2600);
}
const chungUnit = r => (r.chungRatio ? '배' : '명');
const fmtChung = (r, v) => (r.chungRatio ? Number(v).toFixed(2) : String(Math.round(v)));

/* ---------- 표시용 학과명 ----------
   지역의사제(지사제)는 같은 의예과·의학과라도 졸업 후 해당 지역 의무복무가 붙는 별개 트랙이라
   목록에서 일반 전형과 즉시 구별돼야 한다. 학과명 옆에 '(지사제)'를 붙인다.
   전수 174행 전부 의예과·의학과라 비(非)의대 오탐은 없다.
   이미 괄호가 붙은 학과명('의학과(의예과)' 6행)은 괄호를 겹치지 않고 안쪽에 합친다.
   ⚠️ 전형명만으로 판별하면 2교를 놓친다. 두 곳은 제도상 지역의사제(진료권별 의무복무 10년)인데
   자체 전형명이 '지역의사'를 쓰지 않는다 — 복지부 공표 인원(성균관 3명·단국천안 15명)이
   본 데이터의 권역 합계와 정확히 일치해 확인했다. 명단에 박아 예외 처리한다. */
const JISAJE_ALIAS = new Set(['성균관대학교|성균인재-지역인재전형', '단국대학교(천안)|지역의료인재전형']);
const isJisaje = r => /지역의사/.test(r.jhname || '') || JISAJE_ALIAS.has(r.uni + '|' + r.jhname);
/* 고사 시기 배지. 라벨에 날짜를 함께 실어 학생이 바로 일정을 가늠하게 한다. */
function examBadge(r) {
  if (r.examWhen === 'pre') return ` <span class="exam-tag pre" title="수능(11/19) 전 고사 — 수시 납치 우려">수능 전 ${esc(r.date.split(/[~,]/)[0])}</span>`;
  if (r.examWhen === 'post') return ` <span class="exam-tag post" title="수능(11/19) 후 고사 — 가채점 보고 선택 가능">수능 후 ${esc(r.date.split(/[~,]/)[0])}</span>`;
  return '';
}
const deptDisp = r => !isJisaje(r) ? r.dept
  : r.dept.endsWith(')') ? r.dept.slice(0, -1) + '·지사제)'
  : r.dept + '(지사제)';
// 통합·계열 단위 모집(개별 학과가 아님). 원천이 '서울캠퍼스'·'전 모집단위'·'통합모집' 등으로
// 학과 칸에 묶음 단위를 넣는 경우가 있어, 상세 카드에 '통합모집' 라벨로 성격을 알려준다.
const isIntegrated = d => /캠퍼스$|^전\s*모집단위|통합모집|전공\s*개방|전공개방/.test(String(d || '').replace(/\n/g, ''));

/* ---------- 권역 구분자(qual) ----------
   지역의사제처럼 같은 대학·학과·전형을 권역별로 쪼개 1명씩 뽑는 전형이 있다.
   구분 정보가 '지원자격'에만 있어서 카드·목록에는 똑같은 줄이 6~7개 반복돼 보였다
   (아주대 의학과 지역의사선발전형 = 의정부/남양주/이천/포천/인천서북/인천중부 각 1명).
   전수 46종·205행. 같은 키에 행이 둘 이상일 때만 지원자격 앞부분을 구분자로 붙인다
   — 평소엔 붙지 않으므로 화면이 지저분해지지 않는다. */
(() => {
  const grp = {};
  ROWS.forEach(r => {
    const k = r.uni + '|' + r.dept + '|' + r.jhtype + '|' + r.jhname;
    (grp[k] = grp[k] || []).push(r);
  });
  Object.values(grp).forEach(list => {
    if (list.length < 2) return;
    list.forEach(r => {
      // 지원자격 첫 구절(괄호 앞)이 권역명인 경우가 대부분: '의정부권(의정부시,동두천시…)'
      const q = (r.jagyeok || '').replace(/\s+/g, ' ').trim();
      if (!q) return;
      r.qual = (q.split('(')[0] || q).trim().slice(0, 18);
    });
    // 구분자가 전부 같으면(구분에 도움이 안 되면) 붙이지 않는다.
    const vals = new Set(list.map(r => r.qual || ''));
    if (vals.size < 2) list.forEach(r => { delete r.qual; });
  });
})();

/* 특수전형 판정 — 전형명 기준. 전형 성격 필터(지역인재/기타전형)와 대학 패널 정렬이 함께 쓴다.
   ⚠️ 행 가공(hydrate)에서 쓰므로 반드시 그보다 위에 선언돼야 한다(const 는 TDZ 가 있다). */
const SPECIAL_JH = /지역인재|고른기회|기회균[등형]|교육기회|사회적?\s?배려|배려대상|배려자|사회통합|사회다양성|사회기여|사회공헌|농어촌|특성화고|기초차상위|기초생활|차상위|한부모|저소득|경제배려|국가보훈|보훈|장애|특수교육|서해\s?5도|만학|재직자|성인학습|평생학습|다문화|북한이탈|새터민|자립지원|계약학과|조기취업|채용조건|계역학과|지도자추천|목회자추천|추천인재|크리스천|선교|군사학|국가안보/;
/* 지원자격으로 보는 보조 판정 — **이름만으로는 못 잡는다.** 실측 예:
   협성대 '실기우수자전형'(자격: 지적·자폐성장애), 한경대 '음악특기자전형'(특수교육대상자),
   우송대 '자기추천전형'(다자녀·군인·다문화·만학·보훈·기초), 수원대 '고운사회전형'(군인·경찰·소방·다문화).
   이름이 평범한 특별전형이 실제로 존재하므로 자격 필드를 함께 본다. */
const SPECIAL_JAGYEOK = /기초생활|차상위|한부모|국가보훈|보훈|농어촌|특성화고|만학도|서해5도|자립지원|북한이탈|다문화|저소득|장애|특수교육대상/;
/* 지역 제한 판정 — **이름이 아니라 지원자격으로 본다.** 이름으로는 갈라낼 수 없다:
   '지역균형전형'(412행)은 자격이 "국내고 졸업자, 추천 인원 제한 없음"이라 전국 대상 일반전형이고,
   '지역전형'·'지역교과전형'·'지역의사선발전형'·'강원인재전형'은 권역 고교 출신으로 제한된다.
   자격 문구에 권역이 적히므로 그걸 신호로 쓴다(43종 716행 전수 확인). */
const REGION_JAGYEOK = /부울경|대구경북|충청|대전,?\s?세종|광주,?\s?전남|전남,?\s?전북|강원도|제주|경기|인천|호남|영남|충남|충북|경남|경북|전북|울산|부산|대구|광주|세종|권\s?\(|시,|군\)/;
// 수능최저 원문 → {n:합산 영역수, sum:등급 합, type}. type: 'none'(최저없음) | 'sum'(N합X) | 'etc'(1등급 2개·M개Y 등 특이).
function parseLeast(t) {
  const z = (t || '').replace(/\s/g, '');
  if (!z || /^(없음|미적용|x|-|미정)$/i.test(z)) return { n: null, sum: null, type: 'none' };
  // ① 'N합M'이 여러 번 나오면 가장 완화된(합이 큰) 조건을 쓴다.
  //    선택과목·응시조건에 따른 대안 경로가 병기되기 때문이다
  //    (예: '수+국,영,탐(1) 2합8 / 과탐 1과목 응시 : 2합9').
  //    이 필터는 '내 합으로 충족 가능한 전형'을 찾는 용도라, 한 경로라도 충족되면 보여야 한다.
  //    첫 매치만 쓰면 41행이 실제로는 지원 가능한데 목록에서 빠졌다.
  const ms = [...z.matchAll(/(\d)합(\d{1,2})/g)];
  if (ms.length) {
    const best = ms.reduce((a, b) => (+b[2] > +a[2] ? b : a));
    return { n: +best[1], sum: +best[2], type: 'sum' };
  }
  // ② '1개M'은 '1합M'과 수학적으로 같다(한 영역이 M등급 이내). 471행이 여기 해당한다.
  //    ⚠️ '3개3'(3개 각 3등급)은 '3합3'과 전혀 다르므로 1개일 때만 변환한다.
  const one = z.match(/1개(\d)/);
  if (one) return { n: 1, sum: +one[1], type: 'sum' };
  return { n: null, sum: null, type: 'etc' };   // 최저 있으나 N합X로 표현 안 됨 → '그 외'
}
/* ---------- 대학별고사 시기와 '수시 납치' 위험도 ----------
   수시에 합격하면 정시·추가모집에 지원할 수 없다(추가합격·등록포기도 마찬가지).
   수능을 잘 봐도 이미 붙은 수시 때문에 정시로 못 가는 상황을 '수시 납치'라 한다.
   회피 수단은 사실상 하나뿐 — 대학별고사에 불참하면 불합격 처리되어 정시 자격이 살아난다.
   따라서 고사 시기가 회피 가능성을 가른다. 2027 수능일은 2026-11-19(목).
     · 고사 없음(교과100·서류100) → 회피 불가, 위험 최고
     · 수능 '전' 면접·논술      → 이미 응시해 취소 불가, 위험 높음
     · 수능 '후' 면접·논술      → 가채점 보고 불참 가능, 위험 낮음
   ⚠️ 수능최저는 방패가 아니다. 납치는 '수능을 잘 봤다'는 전제라 최저는 어차피 충족된다.
   ⚠️ 원문 일자의 요일이 2026년 달력과 어긋나는 행(112행·13교)은 작년 일정이 남은 것으로 보여
      전/후 판정에서 제외한다 — 틀린 판정은 없느니만 못하다. */
// 2028학년도 수능은 2027-11-18(목)로 추정(11월 셋째 목요일). 교육부 공고가 나오면 확정할 것.
const SUNEUNG_2028 = new Date(2027, 10, 18);
const _DOW = ['일', '월', '화', '수', '목', '금', '토'];
ROWS.forEach(r => {
  r.examWhen = null;                    // 'pre' | 'post' | null(판정 불가)
  const hasExam = /면접|논술|실기|실적/.test(r.method || '');
  r.hasExam = hasExam;
  // 고사 종류. 논술은 전형 자체가 별도라 문구에서 섞지 않는다(사용자 피드백) —
  // 면접·실기 전형에만 종류를 명기하고, 그 외(인적성 등)는 '고사'로 둔다.
  // 면접 유무. 판정 근거는 전형방법 원문뿐이다 — jhname 만으로 잡히는 행은 실측 0건이었다.
  // ⚠️ 같은 전형 안에서도 학과에 따라 면접 유무가 갈린다(경상대 등 91개 전형). 그래서 행 단위로 본다.
  r.hasItv = /면접/.test((r.method || '') + (r.jhname || ''));
  // 전형 버킷 — 필터·대학패널이 함께 쓰는 **단일 축**이다. 특별전형이면 jhtype 을 덮어쓴다.
  // ⚠️ 처음엔 jhtype 과 별개 축(AND)으로 만들었는데 계속 오해를 샀다 — '교과·종합만 골랐는데
  //    기회균등·특수교육대상자가 나온다'(사용자 제보 2회). 기타는 글자 그대로 기타여야 한다.
  //    그래서 한 행은 정확히 한 버킷에만 속한다:
  //    기타 8,132 · 교과 7,424 · 종합 6,207 · 지역인재 2,440 · 논술 1,292 · 실기 892 · 특기자 30 = 26,417.
  //    즉 '학생부교과'는 이제 **일반 교과**만 뜻한다(특별전형 4,075행은 기타로 빠진다).
  // 우선순위 — ①이름의 '지역인재' ②정원외 또는 자격제한 특별전형 ③자격의 권역 제한 ④전형유형.
  // ②가 ③보다 앞선다: 지역+자격제한 하이브리드(지역기회균형·지역경제배려대상자 등)는
  // 출신 지역보다 사회경제적 자격이 더 좁은 조건이므로 기타전형으로 본다(사용자 확인).
  // ⚠️ **정원외 '(외)' 표기를 신호로 쓴다** — 사용자 가설을 실측으로 확인했다.
  //    정원외 4,690행 중 4,680행(99.8%)이 이미 기타전형이었고, 어긋난 10행은 전부 진짜 누락이었다
  //    (세종대·한양대ERICA 군 계약학과 5 · 동서대 특성화동일계 · 경북대 계약학과 2 ·
  //     숭실대 정보보호특기자 · GIST 정원외). 이름·자격 규칙이 못 잡는 것을 이 한 줄이 메운다.
  const _jag = (r.jagyeok || '').replace(/\n/g, ' ');
  r.jhBucket = /지역인재/.test(r.jhname || '') ? '지역인재'
    : (/\(외\)/.test(r.jhname || '') || SPECIAL_JH.test(r.jhname || '') || SPECIAL_JAGYEOK.test(_jag)) ? '기타전형'
    : REGION_JAGYEOK.test(_jag) ? '지역인재' : r.jhtype;
  r.examKind = /논술/.test(r.jhtype + (r.jhname || '')) ? '논술'
    : /면접/.test((r.method || '') + (r.jhname || '')) ? '면접'
    : /실기|실적/.test(r.jhtype + (r.jhname || '') + (r.method || '')) ? '실기'
    : (r.date ? '고사' : '');
  // 최저 '변경'의 방향 판정. ⚠️ N합M은 집합 포함관계가 성립할 때만 판정한다(합 숫자만 비교 금지).
  //   1개3→2합6: 2합6 충족자는 반드시 1개3 충족(역은 불성립) → 요건이 좁아짐 = 강화.
  //   탐구 2과목→1과목 반영: 2과목 기준 충족자는 상위 1과목 기준도 충족 → 완화.
  //   그 외(탐 필수→수 필수, 교과반영 변화 등)는 방향 단정이 부정직 → '변경' 유지.
  r.chKindShow = r.chKind;
  if (r.chKind === '변경') {
    const ch = (r.change || '').replace(/\s/g, '');
    if (/1개3→2합6/.test(ch)) r.chKindShow = '강화';
    else if (/2합6→1개3/.test(ch)) r.chKindShow = '완화';
    else if (/과탐?2→1과?목?/.test(ch) || /과\(2\)→과?1/.test(ch)) r.chKindShow = '완화';
  }
  // N수불가: 자격이 '졸업예정자'로만 한정된 경우(졸업(예정)자 형태 제외). 재수생 지원 불가.
  const jag = (r.jagyeok || '').replace(/\s/g, '');
  r.nsuNo = /졸업예정/.test(jag) && !/[(（]예정/.test(jag) && !/졸업\(/.test(jag);
  const t = r.date || '';
  if (!t) return;
  const hits = [...t.matchAll(/(\d{1,2})\.\s*(\d{1,2})\s*(?:\(([^)]{1,3})\))?/g)];
  if (!hits.length) return;
  let trustworthy = true, pre = false, post = false;
  hits.forEach(m => {
    const d = new Date(2026, +m[1] - 1, +m[2]);
    const dow = (m[3] || '').trim();
    if (dow && (!_DOW.includes(dow) || _DOW[d.getDay()] !== dow)) trustworthy = false;
    if (d < SUNEUNG_2028) pre = true; else post = true;
  });
  if (!trustworthy) return;             // 작년 일정 잔존 의심 → 판정 보류
  r.examWhen = pre && !post ? 'pre' : (!pre && post ? 'post' : null);
});

ROWS.forEach(r => { const p = parseLeast(r.choejeo); r.leastN = p.n; r.leastSum = p.sum; r.leastType = p.type; });
// N개 합별 슬라이더 범위(데이터 실측 min~max)
const LEAST_BOUNDS = {};
[1, 2, 3, 4].forEach(n => {
  const sums = ROWS.filter(r => r.leastN === n).map(r => r.leastSum);
  LEAST_BOUNDS[n] = sums.length ? { min: Math.min(...sums), max: Math.max(...sums), count: sums.length } : { min: n, max: n * 6, count: 0 };
});

const CAT_ICON = {
  all: '🎓', medical: '⚕️', med_med: '🩺', med_dent: '🦷', med_oriental: '🪡', med_vet: '🐾', med_pharm: '💊',
  nursing_health: '🏥', engineering: '⚙️',
  eng_cs: '💻', eng_ee: '⚡', eng_mech: '🔧', eng_chem: '⚗️', eng_civil: '🏗️', eng_etc: '🏭',
  natural: '🔬', nat_math: '📐', nat_phys: '⚛️', nat_bio: '🧬', nat_earth: '🌏', nat_agri: '🌾',
  business: '💼', biz_mgmt: '🏢', biz_econ: '📈', biz_tour: '🏨', biz_etc: '🏘️',
  language: '🗣️', lang_kor: '📖', lang_eng: '🔤', lang_asia: '🏯', lang_etc: '🌐',
  language: '🗣️', humanities_core: '📜', non_business_humanities: '🏛️', social_science: '🌐',
  statistics: '📈', semiconductor: '💾', semiconductor_contract: '🔗', contract_other: '🤝',
  military: '🎖️', teaching: '🍎', primary_ed: '✏️', ist: '🧪', free_major: '🧭', integrated: '🧩',
};
const CATS = D.cats;
const CAT_BY = {}; CATS.forEach(c => CAT_BY[c.key] = c);
// 표기 교정(사용자 요청): '비상경'만으로는 인문 계열임이 안 드러난다. 데이터 재빌드와 무관하게 유지되도록 여기서 덮는다.
{ const c = CATS.find(x => x.label === '비상경'); if (c) c.label = '인문(비상경)'; }
const JHTYPES = ['학생부교과', '학생부종합', '논술', '실기/실적', '특기자', '지역인재', '기타전형'];
const REGIONS = [...new Set(ROWS.map(r => r.region).filter(Boolean))].sort();
// '올해 유불리 예상' 추천은 메디컬(전 대학) 또는 상위권 본교(SKY·서성한·중경외시·건동홍)로 한정
const TOP_UNIS = new Set(['서울대학교', '연세대학교', '고려대학교', '서강대학교', '성균관대학교', '한양대학교',
  '중앙대학교', '경희대학교', '한국외국어대학교', '서울시립대학교', '건국대학교', '동국대학교', '홍익대학교']);
const isPickWorthy = r => r.cats.includes('medical') || r.cats.includes('semiconductor_contract') || TOP_UNIS.has(r.uni);
// 검색 결과 카드 정렬용 대학 서열(사용자 지정, 건동홍숙까지) — 이후는 가나다순
const UNI_RANK = ['서울대학교', '연세대학교', '고려대학교', '서강대학교', '성균관대학교', '한양대학교',
  '중앙대학교', '경희대학교', '한국외국어대학교', '서울시립대학교', '이화여자대학교',
  '건국대학교', '동국대학교', '홍익대학교', '숙명여자대학교'];
const uniRank = u => { const i = UNI_RANK.indexOf(u); return i < 0 ? 999 : i; };
// 특수전형 판별(지역인재·고른기회·사회배려 등) — 전형명 정렬에서 맨 뒤로 보낸다.
// ⚠️ '지역균형'은 특수전형이 아니다 — '지역'이 아니라 '지역인재'로만 잡는다.

/* ---------- state ---------- */
/* 지원희망은 법정 6장 + 후보 4칸(7~10번, '후보' 배지로 구분) — 넓게 담고 6장으로 추리는 용도. */
const FAV_HOPE_MAX = 10, FAV_REACH_MAX = 3, SUSI_LIMIT = 6;
const S = {
  cat: 'all', search: '', jhtypes: new Set(), region: '', minLeast: '', interview: '', view: 'results',
  changes: new Set(), sort: 'impact', sortDir: -1,
  examWhen: '',                 // '' | 'post' | 'pre' — 대학별고사 시기(수시 납치 회피용)
  leastN: '', leastSum: null,   // 수능최저 검색: 합산 영역 수('2'|'3'|'4') + 내 등급 합. 충족 가능 매칭

  cutOpen: null,   // 입결 컷 필터 펼침. null=미결정(모바일이면 접힘). 기준이 7종으로 늘어 모바일에서 373px를 먹었다
  stdCut: '', cutGrade: 9.0,   // 입결 컷 필터: '' | 'avg' | 'cut50' | 'cut70' | 'cut80' | 'cut90' | 'stage1', 슬라이더 등급(작을수록 우수). 9.0 = 사실상 미적용
  page: 1, perPage: 100, hlFilter: 'all', hlJhtype: '', chartMetric: 'grade', trendMetric: 'both',
  compare: new Set(load('cmp', [])),
  fav: migrateFav(load('fav', null)),
  favNote: String(load('favnote', '') || ''),          // 컨설턴트 의견(지원카드 하단 자유 기재)
  expanded: new Set(load('expanded', [])),
  advisor: Object.assign({ grade: null, leastN: '', leastSum: null, cat: 'all', region: '', school: '', width: 'normal' }, load('advisor', {})),
};
function migrateFav(v) {
  if (Array.isArray(v)) return { hope: v.slice(0, FAV_HOPE_MAX), reach: v.slice(FAV_HOPE_MAX, FAV_HOPE_MAX + FAV_REACH_MAX) };  // 구버전(단일 배열) 호환
  if (v && Array.isArray(v.hope) && Array.isArray(v.reach)) return { hope: v.hope.slice(0, FAV_HOPE_MAX), reach: v.reach.slice(0, FAV_REACH_MAX) };
  return { hope: [], reach: [] };
}
function load(k, def) { try { return JSON.parse(localStorage.getItem('ipsi_' + k)) ?? def; } catch (e) { return def; } }
function save(k, v) { try { localStorage.setItem('ipsi_' + k, JSON.stringify(v)); } catch (e) {} }

/* ---------- 공유 URL ----------
   ⚠️ 저장은 ROWS 인덱스(_i)로 하지만 링크에 인덱스를 실으면 안 된다.
      원천 엑셀이 갱신되면(V7.15→V7.24처럼 행이 추가·삭제됨) 인덱스가 밀려
      같은 링크가 전혀 다른 학과를 가리킨다 — 조용히 틀리는 최악의 유형이다.
      그래서 (대학|학과|전형유형|전형명)을 해시한 안정 키를 쓴다.
      실측: 26,416행 → 고유키 26,269 · 해시 충돌 0. 같은 키가 여럿인 34종(지역의사 권역 분할)은
      순번을 붙여 구분한다(예: 'abc12.1'). */
const hashKey = s => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(36); };
// ⚠️ 지원자격(jagyeok)까지 넣는다. 넣지 않으면 지역의사선발전형처럼 **권역별로 쪼개진 행**이
//    전부 같은 키가 되어 등장 순서로만 구분된다(34종 181행). 그 그룹에 행이 하나만 추가·삭제돼도
//    순번이 밀려 저장된 카드가 다른 권역을 가리킨다. 자격을 넣으면 충돌이 34종 → 3종으로 준다.
const rowKey = r => hashKey([r.uni, r.dept, r.jhtype, r.jhname, r.jagyeok || ''].join('|'));
// 옛 키(자격 미포함) — 이미 저장된 카드·공유 링크를 계속 읽기 위해 남긴다. 새로 쓸 때는 쓰지 않는다.
const rowKeyLegacy = r => hashKey([r.uni, r.dept, r.jhtype, r.jhname].join('|'));

/* ----- 저장(localStorage)도 안정 키로 -----
   위 주석이 공유 링크에 대해 경고한 그 위험이 지원카드·비교함에도 그대로 있었다.
   저장을 ROWS 인덱스로 하면 원천 엑셀이 갱신될 때(행 추가·삭제) 인덱스가 밀려
   **담아둔 카드가 조용히 다른 학과를 가리킨다.** 하필 접수 주간 직전에 데이터 갱신이
   예정돼 있어(DATA_UPDATE.md), 지원카드가 가장 값진 시점에 어긋날 수 있었다.
   → 저장은 rowKey 로, 읽을 때 인덱스로 되살린다. 숫자가 들어 있으면 구버전 저장값이므로
     그대로 인덱스로 해석한다(기존 사용자 카드가 사라지지 않게). */
/* ⚠️ 저장 키는 **공유 링크와 같은 규칙**(codeOf/indexOfCode)을 쓴다 — 아래 buildCodeMaps 참조.
   실측(2026-08-29): 순번 없는 rowKey 만 쓰던 탓에 34개 키에 181행이 충돌했다.
   지역의사선발전형은 권역이 지원자격에만 있어 (대학·학과·전형유형·전형명)이 전부 같다.
   그래서 강릉권(모집 1명)을 지원카드에 담아도 다음 방문에 춘천권(모집 8명)으로 조용히
   바뀌었다 — 권역마다 거주 요건과 의무복무 지역이 다른 별개 트랙인데 카드엔 권역 표시가 없다.
   같은 문제를 공유 링크에서는 이미 순번으로 풀어 놨는데 저장만 그 규칙을 안 따랐다.
   첫 행은 순번을 생략하므로 **기존에 저장된 카드도 그대로 복원된다.** */
const toIdx = v => { if (typeof v === 'number') return v; const i = indexOfCode(v); return i === null ? -1 : i; };
const toKey = i => (ROWS[i] ? codeOf(i) || null : null);
const saveCmp = () => save('cmp', [...S.compare].map(toKey).filter(Boolean));
/* ----- 분캠(캠퍼스) 구분 -----
   원천이 일관되지 않다. 강원대·단국대 등 13종은 대학명에 캠퍼스를 병기하는데,
   경북대(대구/상주)·부산대(부산/밀양/양산)·전남대(광주/여수) 등 33곳은 단일 대학명이고
   지역·시군으로만 갈린다. 그래서 표에서는 상주캠이 그냥 '경북대학교 경북'으로 보이고,
   대학 단위 집계에서는 캠퍼스가 섞여 평균이 왜곡됐다
   (실측: 경북대 대구캠 입결 2.70 · 상주캠 5.28 → 합산 3.20).
   ⚠️ 공유 링크의 안정 키(rowKey)가 대학명 해시라 **대학명 자체는 건드리지 않는다.**
   표시(campusOf)와 집계 키(campusKey)에서만 캠퍼스를 구분한다. */
const MULTI_CAMPUS = (() => {
  const m = {};
  ROWS.forEach(r => { if (!r.uni.includes('(')) (m[r.uni] = m[r.uni] || new Set()).add(r.sigun); });
  return new Set(Object.keys(m).filter(u => m[u].size > 1));
})();
// 표시용 캠퍼스 꼬리표. 캠퍼스가 갈리는 대학에서만, 시군이 지역명과 다를 때만 붙인다.
// ⚠️ '대구/상주'처럼 여러 캠퍼스 통합모집인 행(경북대 전 모집단위·경동대 통합선발 4행)은
//    지역 칸에 이미 '대구/경북'이 찍히므로 꼬리표를 붙이면 '대구/경북·대구/상주'가 된다 — 생략.
const campusOf = r => (MULTI_CAMPUS.has(r.uni) && r.sigun && r.sigun !== r.region && !r.sigun.includes('/')) ? r.sigun : '';
// 집계용 키 — 같은 대학이라도 캠퍼스가 다르면 별도로 센다.
const campusKey = r => { const c = campusOf(r); return c ? `${r.uni}(${c})` : r.uni; };
let _CODE_TO_I = null, _I_TO_CODE = null;
function buildCodeMaps() {
  if (_CODE_TO_I) return;
  _CODE_TO_I = new Map(); _I_TO_CODE = new Map();
  const seen = new Map();
  ROWS.forEach(r => {
    const base = rowKey(r);
    const n = seen.get(base) || 0; seen.set(base, n + 1);
    const code = n ? `${base}.${n}` : base;      // 첫 행은 순번 생략(링크 짧게)
    _CODE_TO_I.set(code, r._i); _I_TO_CODE.set(r._i, code);
  });
  // 옛 키도 읽기 전용으로 등록한다 — 키 규칙을 바꾸면 이미 저장된 지원카드·공유 링크가
  // 통째로 버려지기 때문이다(hydrateSaved 는 매칭 실패를 조용히 버린다).
  // 새 키가 이미 차지한 코드는 덮지 않는다. 옛 키는 순번 의존이 남아 있으므로 폴백일 뿐이다.
  const seenOld = new Map();
  ROWS.forEach(r => {
    const base = rowKeyLegacy(r);
    const n = seenOld.get(base) || 0; seenOld.set(base, n + 1);
    const code = n ? `${base}.${n}` : base;
    if (!_CODE_TO_I.has(code)) _CODE_TO_I.set(code, r._i);
  });
}
const codeOf = i => { buildCodeMaps(); return _I_TO_CODE.get(i) || ''; };
const indexOfCode = c => { buildCodeMaps(); const v = _CODE_TO_I.get(c); return v === undefined ? null : v; };
(function hydrateSaved() {   // ↑ codeOf/indexOfCode 정의 뒤여야 한다(const TDZ)
  S.compare = new Set([...S.compare].map(toIdx).filter(i => i >= 0 && i < ROWS.length));
  for (const b of ['hope', 'reach']) S.fav[b] = (S.fav[b] || []).map(toIdx).filter(i => i >= 0 && i < ROWS.length);
})();

function buildShareURL(kind) {
  const p = new URLSearchParams();
  if (kind === 'fav') {
    if (S.fav.hope.length) p.set('h', S.fav.hope.map(codeOf).filter(Boolean).join(','));
    if (S.fav.reach.length) p.set('r', S.fav.reach.map(codeOf).filter(Boolean).join(','));
  } else {
    const c = [...S.compare].map(codeOf).filter(Boolean);
    if (c.length) p.set('c', c.join(','));
  }
  return location.origin + location.pathname + '?' + p.toString();
}
/** 주소창의 공유 파라미터를 읽어 지원카드·비교함에 복원한다. 없으면 아무것도 하지 않는다. */
function applyShareURL() {
  const p = new URLSearchParams(location.search);
  const pick = k => (p.get(k) || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(indexOfCode).filter(v => v !== null);
  const h = pick('h'), r = pick('r'), c = pick('c');
  if (!h.length && !r.length && !c.length) return null;
  if (h.length || r.length) { S.fav = { hope: h.slice(0, FAV_HOPE_MAX), reach: r.slice(0, FAV_REACH_MAX) }; saveFav(); }
  if (c.length) { S.compare = new Set(c.slice(0, 6)); saveCmp(); }
  history.replaceState(null, '', location.origin + location.pathname);   // 주소창 정리
  return { fav: h.length + r.length, cmp: c.length };
}
async function copyShare(kind, btn) {
  const url = buildShareURL(kind);
  const done = ok => { if (!btn) return; const t = btn.textContent; btn.textContent = ok ? '✓ 링크 복사됨' : '복사 실패'; setTimeout(() => { btn.textContent = t; }, 1600); };
  try { await navigator.clipboard.writeText(url); done(true); }
  catch (e) {                                    // 클립보드 권한이 없는 브라우저 대비
    const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
    document.body.removeChild(ta);
    if (!ok) prompt('아래 주소를 복사하세요', url); else done(true);
  }
}

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const fmt = (v, d = 2) => (v == null || isNaN(v)) ? '–' : Number(v).toFixed(d);
// 좁은 칸(표·비교함·인쇄물)에 이름을 넣을 때 쓴다. 원문 학과명·전형명에는 줄바꿈이 섞여 있어
// (예: '기계공학부\n(기계공학,로봇공학,설비소방공학)') 줄바꿈까지 글자로 세면 괄호 안 핵심이
// 통째로 잘린다 — 실제로 '건축학부(건축공학,건축학전공(5년' 처럼 괄호도 못 닫았다.
// 한 줄로 펴서 자르고, 잘렸으면 '…'로 알린다. 잘림 표시가 없으면 잘린 이름을 전체로 오인한다.
const flat = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const cut = (s, n) => { const t = flat(s); return t.length > n ? t.slice(0, n) + '…' : t; };
const fmtInt = v => (v == null || isNaN(v)) ? '–' : Math.round(v).toLocaleString();
function avg(arr) { const a = arr.filter(x => x != null && !isNaN(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
/* 입결 평균은 '같은 기준'끼리만 내야 한다. 대학마다 발표 기준이 달라서(70%컷·평균·80%컷·
   90%컷·최저·1단계) 섞어 평균하면 순위가 뒤집힌다 — 실측 cut70 3.73 vs lowest 4.80으로
   1등급 넘게 벌어진다. 그래서 집계는 '가장 많은 기준' 하나만 쓰고, 무엇을 썼고 몇 건을
   뺐는지 화면에 밝힌다. 컷 필터가 켜져 있으면 자연히 그 기준 하나만 남는다. */
function dominantStd(rows) {
  const c = {};
  rows.forEach(r => { if (r.g[0] != null && r.stdK26) c[r.stdK26] = (c[r.stdK26] || 0) + 1; });
  let best = null, n = 0, tot = 0;
  for (const k in c) { tot += c[k]; if (c[k] > n) { n = c[k]; best = k; } }
  return { std: best, kept: n, dropped: tot - n };
}
function track(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} }

function numOr(s) { if (s == null) return null; const m = String(s).match(/-?\d+\.?\d*/); return m ? parseFloat(m[0]) : null; }

/* ---- 2026 vs 2025 year-over-year per metric ---- */
// 입결 등급: 숫자↑ = 입결 하락(쉬워짐) = 유리.
// ⚠ 단, 대학이 발표하는 '입결 기준'은 해마다 바뀔 수 있다(예: 2025 평균 → 2026 70%컷).
// 기준이 다르면 등급 차이는 지표 변경일 뿐 실제 변화가 아니므로 추세로 읽으면 안 된다.
// 실제로 이 비교 탓에 가짜 신호 983건(불리 633·유리 350)이 발생했다 → basisMismatch로 차단.
const nzStd = t => (t || '').replace(/\s/g, '');
function yoyGrade(r) {
  const a = r.g[1], b = r.g[0]; if (a == null || b == null) return null;
  const d = b - a;
  if (r.std26 && r.std25 && nzStd(r.std26) !== nzStd(r.std25)) {
    return { y25: a, y26: b, d, dir: 'na', basisMismatch: true, b25: r.std25, b26: r.std26 };
  }
  return { y25: a, y26: b, d, dir: d >= 0.1 ? 'easier' : d <= -0.1 ? 'harder' : 'flat' };
}
// 목록 경쟁률 칸 아래 한 줄 — 2027 최종 경쟁률(있을 때만). 2026 값·추이선 옆에 두되 굵게 하지 않는다:
// 이 칸의 정렬·유불리는 여전히 2026 기준이라 주인공처럼 보이면 안 된다.
function c27Line(r) {
  return r.c27 ? `<div class="c27-line" title="2027 수시 최종 경쟁률 · 지원 ${r.c27[1]}명">27 최종 ${r.c27[0].toFixed(1)}</div>` : '';
}
function yoyComp(r) { // 경쟁률: 하락 = 유리
  const a = r.c[1], b = r.c[0]; if (a == null || b == null) return null;
  const ratio = a ? b / a : 1, d = b - a;
  // 전형유형별 내부 잣대(표기하지 않음): 논술은 기본 경쟁률이 수십:1이라
  // ±10% 밴드로는 노이즈까지 신호로 잡힌다 → ±15%로 완화. 그 외는 ±10% 유지.
  const band = r.jhtype === '논술' ? 0.15 : 0.10;
  return { y25: a, y26: b, d, dir: ratio <= 1 - band ? 'down' : ratio >= 1 + band ? 'up' : 'flat' };
}
function yoyChung(r) { // 추합(충원): 증가 = 실질 문턱↓ = 유리
  // 산술 상한을 넘는 추합은 방향을 신뢰할 수 없다 — 자동 판정에서 뺀다(값은 표·모달에 그대로 나온다).
  if (r.chungDoubt) return null;
  const a = numOr(r.chung[1]), b = numOr(r.chung[0]); if (a == null || b == null) return null;
  const d = b - a;
  let dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  // ⚠️ 추합을 절대값으로만 비교하면 모집인원이 함께 변할 때 왜곡된다.
  //    모집 10명에 추합 5명(50%)과 모집 100명에 추합 5명(5%)은 실질 문턱이 전혀 다르다.
  //    실측: 추합 변화 15,148행 중 26.4%가 증감 동반, 그중 394행은 절대값↔비율 판정이 뒤집힌다.
  //    그 394행의 75%(296)가 '증감폭 20% 이상' 구간에 몰려 있어 그 구간만 비율로 재판정한다.
  //    ※ 배수형(chungRatio)은 이미 정규화된 지표라 손대지 않는다.
  //    ※ 2025 모집인원이 없어 (2027모집 − 전년대비증감)으로 근사한다 — 방향 판정 용도로만 쓴다.
  const dn = r.dn || 0, e26 = r.enroll;
  if (!r.chungRatio && dn && e26 > 0 && Math.abs(dn) / e26 >= 0.2) {
    const e25 = e26 - dn;
    if (e25 > 0) {
      const q26 = b / e26, q25 = a / e25;
      dir = q26 > q25 ? 'up' : q26 < q25 ? 'down' : 'flat';
    }
  }
  return { y25: a, y26: b, d, dir };
}

/* ---- 올해(2027) 입시 유불리 예상: 2026 vs 2025 결과 추이 + 2027 구조 변화 ---- */
function verdict(r) {
  const sig = []; let score = 0;
  // 2027 구조 변화 (모집인원)
  if (r.dkind === 'up') { sig.push({ dir: 'good', t: `모집인원 ${r.dn}명 증원`, m: '인원' }); score += 2; }
  else if (r.dkind === 'down') { sig.push({ dir: 'bad', t: `모집인원 ${Math.abs(r.dn)}명 감원`, m: '인원' }); score -= 2; }
  else if (r.dkind === 'new') sig.push({ dir: 'warn', t: '신설 — 첫해 입결 미형성(기회·변동)', m: '신설' });
  else if (r.dkind === 'closed') { sig.push({ dir: 'bad', t: '모집 폐지', m: '폐지' }); score -= 2; }
  else if (r.dkind === 'split') sig.push({ dir: 'warn', t: '모집단위 분리(인원·경쟁 재편)', m: '변동' });
  else if (r.dkind === 'merge') sig.push({ dir: 'warn', t: '모집단위 통합(인원·경쟁 재편)', m: '변동' });
  else if (r.dkind === 'changed') sig.push({ dir: 'warn', t: '전형 변경(개편·개명) — 전년 대비 인원 비교 불가', m: '변경' });
  // 2027 구조 변화 (수능최저)
  if (r.chKindShow === '강화' || r.chKindShow === '신설') { sig.push({ dir: 'good', t: `수능최저 ${r.chKindShow} → 지원 위축`, m: '최저' }); score += 2; }
  else if (r.chKindShow === '완화' || r.chKindShow === '폐지') { sig.push({ dir: 'bad', t: `수능최저 ${r.chKindShow} → 지원 증가`, m: '최저' }); score -= 2; }
  // 수시 납치 — 합격하면 정시 지원이 막히므로 고사 시기가 회피 가능성을 가른다.
  //   판정 근거·용어는 memory/ipsi-susi-napchi.md 참조. 점수(유불리)에는 반영하지 않는다 —
  //   납치는 '합격 가능성'이 아니라 '합격했을 때의 기회비용' 문제라 성격이 다르다.
  if (r.examWhen === 'pre') sig.push({ dir: 'warn', t: `수능 전 ${r.examKind} — 납치 위험 있음(수능 잘 봐도 정시 전환 불가)`, m: '납치' });
  else if (r.examWhen === 'post') sig.push({ dir: 'good', t: `수능 후 ${r.examKind} — 가채점 보고 응시 여부 선택 가능`, m: '일정' });
  // 대학별고사 없는 전형(교과100 등)은 별도 신호를 내지 않는다 — 수시 합격 시 정시 불가는
  // 모든 수시의 공통 규칙이라 전형마다 반복하면 소음이다(사용자 피드백).

  // 2026 vs 2025 결과 추이 (핵심)
  // 신설 전형은 위 디코드 단계에서 실적이 비워지므로 여기서 따로 거를 필요가 없다.
  const g = yoyGrade(r), c = yoyComp(r), ch = yoyChung(r);
  if (g) {
    if (g.basisMismatch) { sig.push({ dir: 'warn', t: `입결 기준이 달라 추세 비교 불가 (${g.b25} → ${g.b26})`, m: '입결' }); }
    else if (g.dir === 'easier') { sig.push({ dir: 'good', t: `입결 하락세 ${g.y25.toFixed(2)}→${g.y26.toFixed(2)}등급`, m: '입결' }); score += 2; }
    else if (g.dir === 'harder') { sig.push({ dir: 'bad', t: `입결 상승세 ${g.y25.toFixed(2)}→${g.y26.toFixed(2)}등급`, m: '입결' }); score -= 2; }
  }
  if (c) {
    // 경쟁률 변화가 입결에 얼마나 반영되는지는 전형유형마다 다르다. 2026 vs 2025 실측(14,842행)에서
    //   학생부교과 r=-0.414 (설명력 17%) · 학생부종합 r=-0.316 (10%) · 논술 r=+0.004 (0%)
    // 논술은 자연·인문 모두 r≈0 이고 95% 신뢰구간이 0을 포함한다(n=330). 기본 경쟁률이 수십:1이라
    // 지원자가 늘어도 합격선이 따라 움직이지 않는 것으로 보인다.
    // 그래서 논술은 **신호는 보여주되 점수는 주지 않는다** — 점수를 주면 근거 없는 유불리가 된다.
    const cw = r.jhtype === '논술' ? 0 : 2;
    const tail = cw ? '' : ' (논술은 합격선 영향 작음)';
    if (c.dir === 'down') { sig.push({ dir: cw ? 'good' : 'warn', t: `경쟁률 하락 ${c.y25.toFixed(1)}→${c.y26.toFixed(1)}:1${tail}`, m: '경쟁' }); score += cw; }
    else if (c.dir === 'up') { sig.push({ dir: cw ? 'bad' : 'warn', t: `경쟁률 상승 ${c.y25.toFixed(1)}→${c.y26.toFixed(1)}:1${tail}`, m: '경쟁' }); score -= cw; }
  }
  if (ch) { const cu = chungUnit(r), c1 = fmtChung(r, ch.y25), c2 = fmtChung(r, ch.y26);
    // 전형유형별 내부 잣대(표기하지 않음): 교과전형은 추합이 모집인원의 100~300%까지 도는
    // 실질 문턱의 핵심 변수라 ±2, 종합·논술·실기는 추합 규모가 작아 ±1 유지.
    const chW = r.jhtype === '학생부교과' ? 2 : 1;
    // 비율 재판정(모집 증감 20% 이상)이 걸리면 절대값 증감과 방향이 어긋날 수 있다.
    // 그때 '추합 증가 14→12명'처럼 모순돼 보이므로, 실제 근거인 '모집 대비 비율'을 문구로 쓴다.
    const absUp = ch.d > 0, mismatch = (ch.dir === 'up') !== absUp && ch.d !== 0;
    const lab = ch.dir === 'up' ? '증가' : '감소';
    const t = mismatch
      ? `추합 비율 ${lab} ${c1}→${c2}${cu} (모집 ${fmtInt(r.enroll - (r.dn || 0))}→${fmtInt(r.enroll)}명 대비)`
      : `추합 ${lab} ${c1}→${c2}${cu}`;
    if (ch.dir === 'up') { sig.push({ dir: 'good', t, m: '충원' }); score += chW; } else if (ch.dir === 'down') { sig.push({ dir: 'bad', t, m: '충원' }); score -= chW; } }
  let cls, label;
  if (score >= 2) { cls = 'good'; label = '유리'; }
  else if (score <= -2) { cls = 'bad'; label = '불리'; }
  else if (score > 0) { cls = 'good'; label = '유리'; }
  else if (score < 0) { cls = 'bad'; label = '불리'; }
  else if (r.dkind === 'new') { cls = 'new'; label = '신설'; }
  else if (sig.length) { cls = 'neu'; label = '중립'; }
  else { cls = 'neu'; label = '변화 없음'; }
  return { cls, label, score, sig, g, c, ch };
}
const _vc = new Map();
function V(r) { let v = _vc.get(r._i); if (!v) { v = verdict(r); _vc.set(r._i, v); } return v; }
function impactSummary(r) { const v = V(r); return { cls: v.cls, label: v.label }; }
const deltaInfo = row => {
  switch (row.dkind) {
    case 'up': return { cls: 'up', txt: '▲' + (row.dn ?? '') };
    case 'down': return { cls: 'down', txt: '▼' + Math.abs(row.dn ?? '') };
    case 'new': return { cls: 'new', txt: '신설' };
    case 'closed': return { cls: 'down', txt: '폐지' };
    case 'split': return { cls: 'new', txt: '분리' };
    case 'merge': return { cls: 'new', txt: '통합' };
    case 'changed': return { cls: 'new', txt: '변경' };
    default: return { cls: 'neu', txt: '–' };
  }
};

/* ---------- SVG sparkline (chronological 2024→2026) ---------- */
function sparkline(valsNewestFirst, opt = {}) {
  const vals = [valsNewestFirst[2], valsNewestFirst[1], valsNewestFirst[0]]; // chrono
  const pts = vals.map((v, i) => ({ v, i })).filter(p => p.v != null && !isNaN(p.v));
  const w = opt.w || 60, h = opt.h || 22, pad = 3;
  if (pts.length < 2) return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true"></svg>`;
  const xs = pts.map(p => p.i), ys = pts.map(p => p.v);
  const minX = 0, maxX = 2; let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const sx = i => pad + (i - minX) / (maxX - minX) * (w - pad * 2);
  const inv = opt.invert; // grade: lower is better -> invert so better is up
  const sy = v => { const t = (v - minY) / (maxY - minY); return pad + (inv ? t : 1 - t) * (h - pad * 2); };
  const path = pts.map((p, k) => (k ? 'L' : 'M') + sx(p.i).toFixed(1) + ' ' + sy(p.v).toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  const col = opt.color || 'var(--primary)';
  let dots = pts.map(p => `<circle cx="${sx(p.i).toFixed(1)}" cy="${sy(p.v).toFixed(1)}" r="1.5" fill="${col}"/>`).join('');
  return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true" focusable="false"><path d="${path}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>${dots}<circle cx="${sx(last.i).toFixed(1)}" cy="${sy(last.v).toFixed(1)}" r="2.6" fill="${col}"/></svg>`;
}

/* ---------- filtering ---------- */
function passChange(row) {
  if (!S.changes.size) return true;
  for (const c of S.changes) {
    if (c === 'new' && row.dkind === 'new') return true;
    if (c === 'up' && row.dkind === 'up') return true;
    if (c === 'down' && row.dkind === 'down') return true;
    if (c === 'changed' && row.dkind === 'changed') return true;
    if (c === 'ease' && (row.chKindShow === '완화' || row.chKindShow === '폐지')) return true;
    if (c === 'tighten' && (row.chKindShow === '강화' || row.chKindShow === '신설')) return true;
  }
  return false;
}
let FILTERED = [];
const UNIVERSITY_NAMES = [...new Set(ROWS.map(r => r.uni))];
const universityStem = t => t.toLowerCase().replace(/대학교$|대학$|대$/, '');
const UNIVERSITY_SEARCH_KEYS = new Map();
UNIVERSITY_NAMES.forEach(u => {
  const stem = universityStem(u);
  [u.toLowerCase(), stem + '대', stem + '대학교', ...(/여자$/.test(stem) ? [stem] : [])].forEach(key => {
    if (!UNIVERSITY_SEARCH_KEYS.has(key)) UNIVERSITY_SEARCH_KEYS.set(key, []);
    UNIVERSITY_SEARCH_KEYS.get(key).push(u);
  });
});
function searchMatches(r, tokens) {
  const medicalTerms = { '의예': 'med_med', '의예과': 'med_med', '치의예': 'med_dent', '치의예과': 'med_dent',
    '한의예': 'med_oriental', '한의예과': 'med_oriental', '수의예': 'med_vet', '수의예과': 'med_vet' };
  const hay = (r.uni + ' ' + r.dept + ' ' + r.jhname + ' ' + r.region + ' ' + r.jhtype + ' ' + r.sigun + ' ' + r.gye).toLowerCase();
  return tokens.every(t => {
    if (medicalTerms[t]) return r.cats.includes(medicalTerms[t]);
    const exact = UNIVERSITY_SEARCH_KEYS.get(t);
    return exact ? exact.includes(r.uni) : hay.includes(t);
  });
}
function applyFilters() {
  const q = S.search.trim().toLowerCase();
  // 약칭 확장: 학생들은 '이화여자'가 아니라 '이화여대'로 친다. 정식 명칭의 부분문자열이
  // 되도록 토큰을 고쳐 쓴다('이화여대'→'이화여자'⊂이화여자대학교, '한국외대'→'한국외국어대').
  const expandToken = t => t
    .replace(/^연대$/, '연세대').replace(/^고대$/, '고려대').replace(/^성대$/, '성균관대')
    .replace(/^의대$/, '의예').replace(/^치대$/, '치의예').replace(/^수의대$/, '수의예').replace(/^한의대$/, '한의예')
    .replace(/^이대$/, '이화여자')          // 특수 약칭 — 규칙으로 안 나온다
    .replace(/^한기대$/, '한국기술교육대')
    .replace(/여대/g, '여자')
    .replace(/외대/g, '외국어대')
    .replace(/과기대/g, '과학기술대')       // 서울과기대 → 서울과학기술대
    .replace(/교대$/, '교육대')
    .replace(/^카이스트$/, 'kaist')
    .replace(/^(포스텍|포항공대)$/, 'postech')
    // 분캠·과기원 한글 음차 — 원천이 영문 표기라 한글로는 0건이었다(2026-08-29 실측).
    // 지원카드 안내가 '과기원은 수시 6회 제한 밖'이라 알려 주는데 정작 검색이 안 됐다.
    .replace(/^에리카$/, 'erica').replace(/^와이즈$/, 'wise')
    .replace(/^디지스트$/, 'dgist').replace(/^유니스트$/, 'unist')
    .replace(/^지스트$/, 'gist').replace(/^켄텍$/, 'kentech');
  const SEARCH_TOKENS = q ? q.split(/\s+/).filter(Boolean).map(expandToken) : [];
  FILTERED = ROWS.filter(r => {
    if (S.cat !== 'all' && !r.cats.includes(S.cat)) return false;
    if (S.jhtypes.size && !S.jhtypes.has(r.jhBucket)) return false;
    if (S.region && r.region !== S.region) return false;
    if (S.minLeast === 'yes' && !r.hasChoejeo) return false;
    if (S.minLeast === 'no' && r.hasChoejeo) return false;
    if (S.interview === 'yes' && !r.hasItv) return false;
    if (S.interview === 'no' && r.hasItv) return false;
    if (!passChange(r)) return false;
    if (S.examWhen && r.examWhen !== S.examWhen) return false;
    // 수능최저 검색 — N개 합: 내 합(S.leastSum)으로 충족 가능한 전형(요구 합 ≥ 내 합) / '그 외': N합X 아닌 특이 최저
    if (S.leastN) {
      if (S.leastN === 'etc') { if (r.leastType !== 'etc') return false; }
      else { const n = +S.leastN; if (!(r.leastN === n && r.leastSum != null && r.leastSum >= S.leastSum)) return false; }
    }
    // 입결 컷 필터 — 라디오(기준) + 슬라이더(등급 이내)
    if (S.stdCut) {
      if (r.stdK26 !== S.stdCut) return false;
      if (S.cutGrade < 9 && !(r.g[0] != null && r.g[0] <= S.cutGrade)) return false;
    }
    if (q) {
      // 복합 검색: 공백으로 끊어 전부 포함(AND)해야 통과한다.
      //   '고려대 의예' → 대학명과 학과명이 원문에서 떨어져 있어 통짜 includes로는 0건이었다.
      //   토큰 1개면 기존 동작과 완전히 같고, 순서는 무관해진다('의예 고려대'도 동일).
      if (!searchMatches(r, SEARCH_TOKENS)) return false;
    }
    return true;
  });
  sortFiltered();
}
function sortFiltered() {
  const dir = S.sortDir;
  const key = S.sort;
  const val = r => {
    switch (key) {
      case 'impact': return V(r).score;
      case 'grade': return r.g[0] == null ? 999 : r.g[0];
      case 'comp': return r.c[0] == null ? -1 : r.c[0];
      case 'enroll': return r.enroll == null ? -1 : r.enroll;
      case 'uni': return r.uni;
      case 'jh': return r.jhtype + '·' + r.jhname;   // 전형유형 묶음 후 전형명 가나다
      case 'delta': return (r.dn == null ? 0 : r.dn);
      default: return V(r).score;
    }
  };
  // ⚠️ 무데이터는 **방향과 무관하게 항상 맨 뒤**로 보낸다.
  // 이 규칙이 입결에만 있어서 경쟁률·모집인원 오름차순은 무데이터가 최상단을 차지했다.
  // 실측(2026-08-29): 경쟁률 오름차순에서 무데이터 2,104행이 1~21페이지를 채워
  // 실제로 경쟁률이 낮은 전형은 22페이지 뒤에 있었다 — 사실상 도달 불가였다.
  const NULLABLE = { grade: r => r.g[0], comp: r => r.c[0], enroll: r => r.enroll };
  const nul = NULLABLE[key];
  FILTERED.sort((a, b) => {
    if (nul) {
      const na = nul(a) == null, nb = nul(b) == null;
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
    }
    if (key === 'grade') {
      const ga = a.g[0], gb = b.g[0];
      if (ga !== gb) return (ga - gb) * dir;
      return (b.c[0] || 0) - (a.c[0] || 0);   // 동점 시 경쟁률 높은순
    }
    let x = val(a), y = val(b);
    if (typeof x === 'string') return x.localeCompare(y, 'ko') * dir;
    if (x === y) {
      const ga = a.g[0] == null ? 999 : a.g[0], gb = b.g[0] == null ? 999 : b.g[0];
      return ga - gb;
    }
    return (x - y) * dir;
  });
  // 메디컬 표시 서열: 같은 대학 안에서는 의 > 치 > 한 > 수의 > 약 순으로 고정(사용자 지정).
  // ⚠️ **지표로 정렬할 때는 적용하지 않는다.** '자리 안에서만 재배치'라 정렬이 안 깨진다고
  //    적어 뒀었지만 사실이 아니었다 — 자리는 그대로여도 그 자리에 오는 행이 바뀐다.
  //    실측(2026-08-29) 경쟁률 내림차순에서 1위 아주대 약학 708.2:1 이 밀리고 5위에 33.25:1 이
  //    올라왔다(최대 422칸 이탈). '경쟁률 높은 순'으로 훑는 학생이 실제 상위를 못 본다.
  //    유불리(impact)·대학명(uni) 정렬에서는 같은 대학 행이 붙어 있어 서열이 뜻을 가진다.
  if (key === 'impact' || key === 'uni') {
  const MED_RANK = { med_med: 0, med_dent: 1, med_oriental: 2, med_vet: 3, med_pharm: 4 };
  const mrank = r => { for (const c of r.cats || []) if (c in MED_RANK) return MED_RANK[c]; return null; };
  const medByUni = {};
  FILTERED.forEach((r, i) => { if (mrank(r) != null) (medByUni[r.uni] = medByUni[r.uni] || []).push(i); });
  for (const idxs of Object.values(medByUni)) {
    if (idxs.length < 2) continue;
    const rows = idxs.map(i => FILTERED[i]);
    rows.sort((a, b) => mrank(a) - mrank(b));   // 안정 정렬 — 같은 서열끼리는 기존 순서 유지
    idxs.forEach((i, k) => { FILTERED[i] = rows[k]; });
  }
  }
}

/* ============================================================
   RENDER
   ============================================================ */
function renderAll() { applyFilters(); S.page = 1; renderCatHeader(); renderKPIs(); renderUniPanel(); renderCutFilter(); renderHighlights(); renderCharts(); renderTable(); renderView(); }
// 필터가 바뀌면 결과 집합이 달라지므로 페이지를 유지하면 안 된다.
// 실측: 5페이지를 보던 중 지역='제주'를 고르면 466건의 **마지막 페이지**가 첫 화면이 됐다
// (기본 정렬이 유불리순이라 '불리'만 모인 꼬리가 보인다).
function renderSoft(preserveCut = false) { applyFilters(); S.page = 1; renderCatHeader(); renderKPIs(); renderUniPanel(); if (preserveCut) updateCutValues(); else renderCutFilter(); renderHighlights(); renderCharts(); renderTable(); renderView(); }

const VIEW_KEYS = ['q', 'cat', 'region', 'types', 'changes', 'minimum', 'least', 'sum', 'cut', 'grade', 'exam', 'sort', 'dir', 'page', 'view'];
function viewValues() {
  return { q: S.search, cat: S.cat, region: S.region, types: [...S.jhtypes].join(','), changes: [...S.changes].join(','),
    minimum: S.minLeast, itv: S.interview, least: S.leastN, sum: S.leastSum, cut: S.stdCut, grade: S.cutGrade, exam: S.examWhen,
    sort: S.sort, dir: S.sortDir, page: S.page, view: S.view };
}
function persistView() {
  const values = viewValues();
  try { sessionStorage.setItem('ipsi_view_v1', JSON.stringify(values)); } catch (e) {}
  const p = new URLSearchParams(location.search);
  VIEW_KEYS.forEach(k => p.delete(k));
  const defaults = { cat: 'all', grade: 9, sort: 'impact', dir: -1, page: 1, view: 'results' };
  Object.entries(values).forEach(([k, v]) => { if (v !== '' && v != null && v !== defaults[k]) p.set(k, v); });
  try { history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : '')); } catch (e) {}
}
function restoreView() {
  const p = new URLSearchParams(location.search);
  if (['h', 'r', 'c', 'program'].some(k => p.has(k))) return;
  let v = {};
  if (VIEW_KEYS.some(k => p.has(k))) VIEW_KEYS.forEach(k => { if (p.has(k)) v[k] = p.get(k); });
  else { try { v = JSON.parse(sessionStorage.getItem('ipsi_view_v1') || '{}') || {}; } catch (e) {} }
  const validNumber = (x, min, max, fallback) => Number.isFinite(+x) && +x >= min && +x <= max ? +x : fallback;
  S.search = typeof v.q === 'string' ? v.q.slice(0, 180) : '';
  S.cat = v.cat === 'all' || CAT_BY[v.cat] ? v.cat : 'all';
  S.region = REGIONS.includes(v.region) ? v.region : '';
  S.jhtypes = new Set(String(v.types || '').split(',').filter(t => JHTYPES.includes(t)));
  S.changes = new Set(String(v.changes || '').split(',').filter(t => ['new', 'up', 'down', 'changed', 'ease', 'tighten'].includes(t)));
  S.minLeast = ['yes', 'no'].includes(v.minimum) ? v.minimum : '';
  S.interview = ['yes', 'no'].includes(v.itv) ? v.itv : '';
  S.leastN = ['1', '2', '3', '4', 'etc'].includes(String(v.least)) ? String(v.least) : '';
  S.leastSum = S.leastN && S.leastN !== 'etc' ? validNumber(v.sum, 1, 36, +S.leastN * 2) : null;
  S.stdCut = CUT_LABELS[v.cut] ? v.cut : '';
  S.cutGrade = validNumber(v.grade, 1, 9, 9);
  S.examWhen = ['pre', 'post'].includes(v.exam) ? v.exam : '';
  S.sort = ['impact', 'grade', 'comp', 'enroll', 'uni', 'jh', 'delta'].includes(v.sort) ? v.sort : 'impact';
  S.sortDir = Number(v.dir) === 1 ? 1 : -1;
  S.page = Math.floor(validNumber(v.page, 1, 1000, 1));
  S.view = v.view === 'analysis' ? 'analysis' : 'results';
  $('#search').value = S.search;
  syncSearchClear();
}
function renderView() {
  $('#resultsView').classList.toggle('hidden', S.view !== 'results');
  $('#analysisView').classList.toggle('hidden', S.view !== 'analysis');
  $('#resultsViewBtn').setAttribute('aria-pressed', String(S.view === 'results'));
  $('#analysisViewBtn').setAttribute('aria-pressed', String(S.view === 'analysis'));
}
function scrollToResults() {
  S.view = 'results'; renderView(); persistView();
  const t = $('#tableSec');
  const top = t.getBoundingClientRect().top + window.scrollY - $('#topbar').getBoundingClientRect().height - 16;
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  t.focus({ preventScroll: true });
}
function activeFilterItems() {
  const items = [];
  if (S.cat !== 'all') items.push(['cat', CAT_BY[S.cat].label]);
  if (S.search) items.push(['search', '검색 ' + S.search]);
  S.jhtypes.forEach(t => items.push(['type:' + t, t]));
  if (S.region) items.push(['region', S.region]);
  if (S.minLeast) items.push(['minLeast', '수능최저 ' + (S.minLeast === 'yes' ? '있음' : '없음')]);
  if (S.interview) items.push(['interview', '면접 ' + (S.interview === 'yes' ? '있음' : '없음')]);
  const changeLabels = { new: '신설', up: '증원', down: '감원', changed: '전형 변경', ease: '최저 완화', tighten: '최저 강화·신설' };
  S.changes.forEach(t => items.push(['change:' + t, changeLabels[t]]));
  if (S.leastN) items.push(['least', S.leastN === 'etc' ? '최저 특이 조건' : `최저 ${S.leastN}개 합 ${S.leastSum} 후보`]);
  if (S.stdCut) items.push(['cut', `${CUT_LABELS[S.stdCut]} · ${S.cutGrade < 9 ? S.cutGrade.toFixed(1) + ' 이내' : '전체 등급'}`]);
  if (S.examWhen) items.push(['exam', S.examWhen === 'post' ? '수능 후 고사' : '수능 전 고사']);
  return items;
}
function clearActiveFilter(key) {
  if (key === 'cat') S.cat = 'all';
  else if (key === 'search') { S.search = ''; $('#search').value = ''; syncSearchClear(); }
  else if (key.startsWith('type:')) S.jhtypes.delete(key.slice(5));
  else if (key.startsWith('change:')) S.changes.delete(key.slice(7));
  else if (key === 'least') { S.leastN = ''; S.leastSum = null; }
  else if (key === 'cut') { S.stdCut = ''; S.cutGrade = 9; }
  else if (key === 'exam') S.examWhen = '';
  else if (key === 'region') S.region = '';
  else if (key === 'minLeast') S.minLeast = '';
  else if (key === 'interview') S.interview = '';
  renderCatList(); renderFilters(); renderAll();
  $('#filterSummary').focus({ preventScroll: true });
}

// 입결 기준 버킷. 서로 다른 기준을 섞으면 '컷 이내' 필터가 왜곡되므로 분리해 둔다.
// stage1(1단계합격자·지원자 평균)은 최종등록자보다 훨씬 넓은 풀이라 별도 취급한다.
// 버킷별 보유 행 수. 0건인 기준은 라디오에 띄우지 않는다.
// 고사 시기별 행 수 — 필터 라벨에 띄운다.
const EXAM_COUNT = { pre: 0, post: 0 };
ROWS.forEach(r => { if (r.examWhen) EXAM_COUNT[r.examWhen]++; });
const STD_COUNT = {};
ROWS.forEach(r => { if (r.stdK26 && r.g[0] != null) STD_COUNT[r.stdK26] = (STD_COUNT[r.stdK26] || 0) + 1; });
const CUT_LABELS = { avg: '평균', cut50: '50% 컷', cut70: '70% 컷', cut80: '75~85% 컷', cut90: '90% 컷', lowest: '최저(등록자 끝단)', stage1: '1단계 평균' };
// 표·카드에 숫자 옆에 붙는 짧은 라벨. 대학마다 발표 기준이 달라 같은 숫자라도 뜻이 다르다
// (cut70 평균 3.73 vs lowest 4.80 — 1등급 넘게 벌어진다). 숫자만 보여주면 오해한다.
// 원천의 필요서류는 '학'·'학,증'·'학,추' 같은 약어다. 그대로 두면 뜻이 안 통한다.
const DOCS_LABEL = t => String(t || '').replace(/\s/g, '')
  .split(/[,.]/).filter(Boolean)
  .map(x => ({ '학': '학생부', '증': '증빙서류', '(증)': '증빙서류(해당자)', '추': '추천서',
               '활': '활동보고서', '자': '자기소개서' }[x] || x)).join(' · ');
// 3개년 입결의 **기준이 해마다 다르면** 추세선을 그대로 읽으면 안 된다.
// 70%컷과 평균을 한 선으로 이으면 없는 등락이 생긴다(실측 5,097행에서 2026≠2024).
// std24 를 뒤늦게 수집한 이유가 이것이다 — std25 는 쓰면서 std24 만 빠져 있었다.
const nzStd2 = t => String(t || '').replace(/\s/g, '');
// 환산점수는 대학·연도마다 **만점 척도**가 다르다(100/200/1000점). 척도가 바뀐 해를 한 선으로
// 이으면 없는 등락이 생긴다 — 실측 226행에서 3배 이상 벌어진다(경남대 174 / 945 / 254 등).
// 한국외대 학교장추천 59개 학과는 입결 등급이 비어 환산점수가 유일한 지표라 오독이 그대로 판단이 된다.
// ⚠️ 행 단위 3배 문턱만으로는 **전형 전체가 1.5~2배 옮겨간 해**를 놓친다 — 척도는 행이 아니라
//    전형×연도의 성질이기 때문이다. 실측 12개 (대학×전형)에서 262행이 경고 없이 노출됐다
//    (협성대 미래창의인재 2025 만 920 대 543·561 — 19행 전부, 배율 1.69로 문턱 아래).
//    빌드 단계에서 전형별 연도 중앙값을 비교해 표시한 D.vScale 을 함께 본다.
function scaleWarn(r) {
  const a = [r.v[0], r.v[1], r.v[2]].filter(x => x != null && !isNaN(x));
  if (a.length < 2) return '';
  const hi = Math.max(...a), lo = Math.min(...a);
  if (!r.vScale && (lo <= 0 || hi / lo < 3)) return '';
  return ` <span class="basis-warn" title="이 대학은 해마다 환산점수 만점 기준이 달랐어요 (${a.map(x => x.toFixed(1)).join(' / ')}). 기준이 다르면 점수를 나란히 놓아도 오른 건지 내린 건지 알 수 없습니다.">⚠ 만점 기준이 해마다 달라 비교할 수 없어요</span>`;
}
function basisWarn(r) {
  const ys = [['2026', r.std26], ['2025', r.std25], ['2024', r.std24]]
    .filter(([y, t]) => t && nzStd2(t));
  const uniq = [...new Set(ys.map(([, t]) => nzStd2(t)))];
  if (uniq.length < 2) return '';
  const detail = ys.map(([y, t]) => `${y}년 ${t}`).join(' · ');
  return ` <span class="basis-warn" title="대학이 해마다 다른 기준으로 발표했어요 (${esc(detail)}). 평균과 70%컷처럼 서로 다른 값이라 세 해를 이어서 추세로 읽으면 안 됩니다.">⚠ 발표 기준이 해마다 달라 비교할 수 없어요</span>`;
}
const CUT_SHORT = { avg: '평균', cut50: '50%', cut70: '70%', cut80: '75~85%', cut90: '90%', lowest: '최저', stage1: '1단계' };
/** 입결 숫자 옆에 붙일 기준 배지. 숫자만 보여주면 서로 다른 지표를 같은 잣대로 읽는다. */
function stdTag(r, cls) {
  const k = CUT_SHORT[r.stdK26];
  if (!k || r.g[0] == null) return '';
  return `<span class="std-tag${STD_NOT_FINAL.has(r.stdK26) ? ' warn' : ''}${cls ? ' ' + cls : ''}" title="${esc(r.std26 || '')}">${k}</span>`;
}
// 최종 등록자 지표가 아닌 기준 — 1단계 합격자는 최종보다 훨씬 넓은 풀이라 낙관 편향을 만든다.
const STD_NOT_FINAL = new Set(['stage1']);
function renderCutFilter() {
  const box = document.querySelector('#cutFilter');
  if (!box) return;
  const active = S.stdCut;
  const g = S.cutGrade;
  const gLabel = g >= 9 ? '전체' : `${g.toFixed(1)} 이내`;
  // 현재 필터로 몇 건 통과했는지
  const matched = active ? FILTERED.length : 0;
  const hint = active
    ? `<span class="cf-count">${matched.toLocaleString()}건</span>`
    : `<span class="cf-hint muted">2026년 과거 입결로 검색합니다. 개인의 합격 가능성 판단은 아닙니다.</span>`;
  // 모바일에서는 기본 접어둔다 — 기준 7종 + 슬라이더 + 고사시기까지 세로로 쌓이면
  // 화면의 절반을 먹어 상단 KPI·유불리 카드가 밀린다. 한 번 펼치면 그 선택을 유지한다.
  const open = S.cutOpen === null ? Boolean(S.stdCut || S.examWhen) : S.cutOpen;
  box.classList.toggle('collapsed', !open);
  box.innerHTML = `
    <div class="cf-head">
      <span class="cf-title">🎯 <b>과거 입결·고사 시기</b>로 좁혀보기</span>
      ${hint}
      <button class="cf-toggle" type="button" aria-expanded="${open}" aria-controls="cutFilter">${open ? '접기 ▲' : '펼치기 ▼'}</button>
    </div>
    <div class="cf-row">
      <div class="cf-radios" role="radiogroup" aria-label="입결 컷 기준">
        ${['avg', 'cut50', 'cut70', 'cut80', 'cut90', 'lowest', 'stage1'].filter(k => STD_COUNT[k]).map(k => `<label class="cf-radio${active === k ? ' on' : ''}"><input type="radio" name="stdCut" value="${k}"${active === k ? ' checked' : ''}> ${CUT_LABELS[k]}</label>`).join('')}
        <button class="cf-clear${active ? '' : ' hidden'}" type="button" aria-label="컷 필터 해제">해제</button>
      </div>
      <div class="cf-slider ${active ? '' : 'is-disabled'}">
        <label for="cutGrade">등급 <b>${gLabel}</b></label>
        <input id="cutGrade" type="range" min="1.0" max="9.0" step="0.1" value="${g}" ${active ? '' : 'disabled'}>
        <input id="cutGradeNumber" class="cut-number" type="number" min="1" max="9" step="0.1" value="${g.toFixed(1)}" aria-label="과거 입결 등급 상한 직접 입력" ${active ? '' : 'disabled'}>
      </div>
    </div>
    <p class="cut-explanation" id="cutExplanation">${active ? `2026년 ${esc(CUT_LABELS[active])} · ${gLabel === '전체' ? '전체 등급' : '과거 입결 ' + gLabel}인 전형입니다.` : '평균·70% 컷 등 같은 발표 기준을 선택해 비교하세요.'}</p>
    <div class="cf-row exam-row">
      <span class="cf-title">🗓️ <b>대학별고사 시기</b></span>
      <div class="cf-radios" role="radiogroup" aria-label="대학별고사 시기">
        ${[['post', `수능 후 (${EXAM_COUNT.post.toLocaleString()})`], ['pre', `수능 전 (${EXAM_COUNT.pre.toLocaleString()})`]]
          .map(([k, lab]) => `<label class="cf-radio${S.examWhen === k ? ' on' : ''}"><input type="radio" name="examWhen" value="${k}"${S.examWhen === k ? ' checked' : ''}> ${lab}</label>`).join('')}
        <button class="cf-clear${S.examWhen ? '' : ' hidden'}" type="button" data-role="exam-clear" aria-label="고사 시기 필터 해제">해제</button>
      </div>
      <span class="cf-hint muted">수능(11/19) 후 고사는 가채점을 보고 응시 여부를 정할 수 있어 <b>수시 납치</b> 위험이 낮습니다</span>
    </div>`;
  box.querySelectorAll('input[name="examWhen"]').forEach(el => el.onchange = () => {
    S.examWhen = el.value; renderSoft(); box.querySelector(`input[name="examWhen"][value="${S.examWhen}"]`).focus(); track('exam_filter', { when: S.examWhen });
  });
  const ec = box.querySelector('[data-role="exam-clear"]');
  if (ec) ec.onclick = () => { S.examWhen = ''; renderSoft(); };
  const tg = box.querySelector('.cf-toggle');
  if (tg) tg.onclick = () => { S.cutOpen = !open; renderCutFilter(); box.querySelector('.cf-toggle').focus(); };
  box.querySelectorAll('input[name="stdCut"]').forEach(el => el.onchange = () => {
    S.stdCut = el.value;
    renderSoft(); box.querySelector(`input[name="stdCut"][value="${S.stdCut}"]`).focus(); track('cut_filter', { std: S.stdCut, grade: S.cutGrade });
  });
  const clear = box.querySelector('.cf-clear');
  if (clear) clear.onclick = () => { S.stdCut = ''; S.cutGrade = 9.0; renderSoft(); };
  const slider = box.querySelector('#cutGrade');
  if (slider) slider.oninput = () => { S.cutGrade = parseFloat(slider.value); renderSoft(true); };
  const number = box.querySelector('#cutGradeNumber');
  if (number) number.oninput = () => {
    const value = Number(number.value);
    const valid = number.value !== '' && Number.isFinite(value) && value >= 1 && value <= 9;
    number.setAttribute('aria-invalid', String(!valid));
    if (valid) { S.cutGrade = Math.round(value * 10) / 10; renderSoft(true); }
  };
}
function updateCutValues() {
  const box = $('#cutFilter');
  const label = S.cutGrade >= 9 ? '전체' : S.cutGrade.toFixed(1) + ' 이내';
  const count = box.querySelector('.cf-count'); if (count) count.textContent = FILTERED.length.toLocaleString() + '건';
  const text = box.querySelector('.cf-slider label b'); if (text) text.textContent = label;
  const slider = box.querySelector('#cutGrade'); if (slider && document.activeElement !== slider) slider.value = S.cutGrade;
  const number = box.querySelector('#cutGradeNumber'); if (number && document.activeElement !== number) number.value = S.cutGrade.toFixed(1);
  $('#cutExplanation').textContent = `2026년 ${CUT_LABELS[S.stdCut]} · ${label === '전체' ? '전체 등급' : '과거 입결 ' + label}인 전형입니다.`;
}

/* ----- category list ----- */
function renderCatList() {
  const box = $('#catList'); box.innerHTML = '';
  const allBtn = el('button', 'cat-item all' + (S.cat === 'all' ? ' active' : ''));
  if (S.cat === 'all') allBtn.setAttribute('aria-current', 'true');
  allBtn.innerHTML = `<span class="cat-dot" aria-hidden="true"></span><span>전체 보기</span><span class="cat-n">${ROWS.length.toLocaleString()}</span>`;
  allBtn.onclick = () => { S.cat = 'all'; renderCatList(); renderAll(); };
  box.appendChild(allBtn);
  const subsByParent = {};
  CATS.forEach(c => { if (c.sub) (subsByParent[c.parent] = subsByParent[c.parent] || []).push(c); });
  const active = CAT_BY[S.cat];
  if (active && active.sub) S.expanded.add(active.parent);   // 선택된 세부의 상위는 자동 펼침
  const select = key => { S.cat = key; track('select_category', { category: key, label: CAT_BY[key] ? CAT_BY[key].label : key }); renderCatList(); renderAll(); closeSidebar(); };
  CATS.filter(c => !c.sub).forEach(c => {
    const subs = subsByParent[c.key];
    const open = subs && S.expanded.has(c.key);
    const b = el('button', 'cat-item' + (subs ? ' has-sub' : '') + (S.cat === c.key ? ' active' : ''));
    if (S.cat === c.key) b.setAttribute('aria-current', 'true');
    b.innerHTML = `<span class="cat-dot" style="background:${c.color}" aria-hidden="true"></span><span class="cat-name">${esc(c.label)}</span><span class="cat-n">${c.count.toLocaleString()}</span>` +
      (subs ? `<span class="cat-toggle${open ? ' open' : ''}" data-toggle="${c.key}" role="button" tabindex="0" aria-label="${esc(c.label)} 세부 ${open ? '접기' : '펼치기'}" aria-expanded="${open}">▾</span>` : '');
    b.title = c.desc;
    b.onclick = e => { if (e.target.closest('[data-toggle]')) return; select(c.key); };
    box.appendChild(b);
    if (subs) {
      const tog = b.querySelector('[data-toggle]');
      const toggleFn = e => { e.stopPropagation(); S.expanded.has(c.key) ? S.expanded.delete(c.key) : S.expanded.add(c.key); save('expanded', [...S.expanded]); renderCatList(); };
      tog.onclick = toggleFn;
      tog.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFn(e); } };
      if (open) subs.forEach(sc => {
        const sb = el('button', 'cat-item sub' + (S.cat === sc.key ? ' active' : ''));
        if (S.cat === sc.key) sb.setAttribute('aria-current', 'true');
        sb.innerHTML = `<span class="cat-dot" style="background:${sc.color}" aria-hidden="true"></span><span class="cat-name">${esc(sc.label)}</span><span class="cat-n">${sc.count.toLocaleString()}</span>`;
        sb.title = sc.desc;
        sb.onclick = () => select(sc.key);
        box.appendChild(sb);
      });
    }
  });
}

/* ----- filters ----- */
function renderFilters() {
  const box = $('#filters'); box.innerHTML = '';
  // 전형유형
  const g1 = el('div', 'f-group');
  g1.innerHTML = '<div class="f-title">전형유형</div>';
  const r1 = el('div', 'chip-row');
  const JH_TIP = {
    '지역인재': '전형명에 지역인재가 붙은 전형 (2,440건)',
    '기타전형': '기회균형·농어촌·사회배려·특성화고·특수교육대상자 등 특별전형 전부 (8,132건, 지역인재 제외)',
  };
  JHTYPES.forEach(t => {
    const c = el('button', 'chip' + (S.jhtypes.has(t) ? ' on' : ''), esc(t));
    c.title = JH_TIP[t] || `${t} 일반 모집 — 지역인재·특별전형은 각각의 칩에 있습니다`;
    c.setAttribute('aria-pressed', String(S.jhtypes.has(t)));   // 색만으로는 켜짐을 알 수 없다
    c.onclick = () => { S.jhtypes.has(t) ? S.jhtypes.delete(t) : S.jhtypes.add(t); renderSoft(); renderFilters(); };
    r1.appendChild(c);
  });
  g1.appendChild(r1); box.appendChild(g1);

  // 변화 유형
  const g2 = el('div', 'f-group');
  g2.innerHTML = '<div class="f-title">2026 대비 변화</div>';
  const r2 = el('div', 'chip-row');
  [['new', '신설', 'new'], ['up', '증원', 'good'], ['down', '감원', 'bad'], ['changed', '전형 변경', 'new'], ['ease', '최저 완화', 'bad'], ['tighten', '최저 강화·신설', 'good']].forEach(([k, lab, cls]) => {
    const c = el('button', 'chip' + (S.changes.has(k) ? ' on ' + cls : ''), esc(lab));
    c.setAttribute('aria-pressed', String(S.changes.has(k)));
    c.onclick = () => { S.changes.has(k) ? S.changes.delete(k) : S.changes.add(k); renderSoft(); renderFilters(); };
    r2.appendChild(c);
  });
  g2.appendChild(r2); box.appendChild(g2);

  // 수능최저
  const g3 = el('div', 'f-group');
  g3.innerHTML = '<div class="f-title">수능최저</div>';
  const r3 = el('div', 'chip-row');
  [['', '전체'], ['yes', '있음'], ['no', '없음']].forEach(([k, lab]) => {
    const c = el('button', 'chip' + (S.minLeast === k ? ' on' : ''), lab);
    c.setAttribute('aria-pressed', String(S.minLeast === k));
    c.onclick = () => { S.minLeast = k; renderSoft(); renderFilters(); };
    r3.appendChild(c);
  });
  g3.appendChild(r3); box.appendChild(g3);

  // 면접 — 수능최저 바로 아래(사용자 요청). 근거는 전형방법 원문의 '면접' 표기다.
  const g3b = el('div', 'f-group');
  g3b.innerHTML = '<div class="f-title">면접</div>';
  const r3b = el('div', 'chip-row');
  [['', '전체'], ['yes', '있음'], ['no', '없음']].forEach(([k, lab]) => {
    const c = el('button', 'chip' + (S.interview === k ? ' on' : ''), lab);
    c.setAttribute('aria-pressed', String(S.interview === k));
    c.onclick = () => { S.interview = k; renderSoft(); renderFilters(); };
    r3b.appendChild(c);
  });
  g3b.appendChild(r3b); box.appendChild(g3b);

  // 지역
  const g4 = el('div', 'f-group');
  g4.innerHTML = '<div class="f-title">지역(광역)</div>';
  const sel = el('select', 'f-select');
  sel.setAttribute('aria-label', '지역(광역)');
  sel.innerHTML = '<option value="">전국 전체</option>' + REGIONS.map(r => `<option ${S.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('');
  sel.onchange = () => { S.region = sel.value; renderSoft(); renderFilters(); };
  g4.appendChild(sel); box.appendChild(g4);

  // 수능최저 검색 (N개 합 + 내 등급 합 슬라이더, '그 외' 특이 최저) — 기존 '입결 등급 상한'을 대체
  const g5 = el('div', 'f-group least-filter');
  const n = S.leastN, isSum = n && n !== 'etc', b = isSum ? LEAST_BOUNDS[+n] : null;
  const hint = !n ? '영역 수와 등급 합으로 후보를 찾습니다.'
    : n === 'etc' ? 'N개 합으로 표현되지 않는 특이 최저(예: 1등급 2개) 전형' : `${n}개 영역 등급 합이 맞는 후보입니다.`;
  g5.innerHTML = `
    <div class="f-title">🎯 수능최저 후보 검색 ${n ? `<span class="range-val">${FILTERED.length.toLocaleString()}건 후보</span>` : ''}</div>
    <div class="lf-hint muted">${hint}</div>
    <p class="condition-note">과목·탐구·한국사 조건은 미확인입니다. 실제 최저 충족 여부는 모집요강과 대조하세요.</p>
    <div class="lf-radios" role="radiogroup" aria-label="합산 영역 수">
      ${[['1', '1개'], ['2', '2개 합'], ['3', '3개 합'], ['4', '4개 합'], ['etc', '그 외']].map(([k, lab]) => `<label class="lf-radio${n === k ? ' on' : ''}"><input type="radio" name="leastN" value="${k}"${n === k ? ' checked' : ''}> ${lab}</label>`).join('')}
      <button class="lf-clear${n ? '' : ' hidden'}" type="button" aria-label="최저 검색 해제">해제</button>
    </div>
    ${n === 'etc' ? '' : `<div class="lf-slider ${isSum ? '' : 'is-disabled'}">
      <label for="leastSum">${isSum && n === '1' ? '내 최고 등급' : `내 ${isSum ? n : 'N'}개 합`} <b>${isSum ? S.leastSum : '—'}</b></label>
      <input id="leastSum" type="range" min="${b ? b.min : 2}" max="${b ? b.max : 18}" step="1" value="${isSum ? S.leastSum : 0}" ${isSum ? '' : 'disabled'}>
      ${isSum ? `<div class="lf-scale"><span>등급 합 ${b.min}</span><span>등급 합 ${b.max}</span></div>` : ''}
    </div>`}`;
  box.appendChild(g5);
  g5.querySelectorAll('input[name="leastN"]').forEach(eln => eln.onchange = () => {
    S.leastN = eln.value;
    if (eln.value !== 'etc') { const bb = LEAST_BOUNDS[+eln.value]; S.leastSum = Math.max(bb.min, Math.min(bb.max, Math.round(+eln.value * 2.3))); }
    renderSoft(); renderFilters(); track('least_filter', { n: S.leastN, sum: S.leastSum });
  });
  const lc = g5.querySelector('.lf-clear');
  if (lc) lc.onclick = () => { S.leastN = ''; S.leastSum = null; renderSoft(); renderFilters(); };
  const ls = g5.querySelector('#leastSum');
  if (ls) ls.oninput = () => {
    S.leastSum = parseInt(ls.value);
    renderSoft();
    g5.querySelector('.lf-slider b').textContent = S.leastSum;
    const rv = g5.querySelector('.range-val'); if (rv) rv.textContent = FILTERED.length.toLocaleString() + '건 후보';
  };
  // 접힘 상태에서도 몇 개 걸려 있는지 보이게 한다 — 안 그러면 접어 둔 필터를 잊는다.
  const onCount = (S.jhtypes.size + S.changes.size + (S.region ? 1 : 0)
    + (S.minLeast ? 1 : 0) + (S.interview ? 1 : 0) + (S.leastN ? 1 : 0) + (S.examWhen ? 1 : 0));
  const fo = $('#filterOnCount'); if (fo) fo.textContent = onCount ? `${onCount}개 적용 중` : '';
  const fb = $('#filterBox'); if (fb) fb.classList.toggle('has-on', onCount > 0);
}

/* ----- category header ----- */
function renderCatHeader() {
  const c = S.cat === 'all' ? { label: '전체 전형', desc: '전국 모든 대학·계열 수시 전형', color: 'var(--primary)', key: 'all' } : CAT_BY[S.cat];
  const q = S.search.trim();
  // 검색 중엔 무엇을 찾고 있는지 제목에 드러내고, 결과 목록으로 바로 갈 수 있게 한다.
  // (모바일에서 표까지 4.7화면을 스크롤해야 했다 — 검색 의도 대비 결과가 너무 멀었다.)
  $('#catHeader').innerHTML =
    `<div class="ch-icon" style="background:${c.color}">${CAT_ICON[c.key] || '🎓'}</div>
     <div class="ch-body"><h2>${q ? `🔎 ${esc(q)}` : esc(c.label)}</h2>
       <p>${S.jhtypes.size ? esc([...S.jhtypes].join(' · ')) + ' 조건에서 검색' : q ? `${esc(c.label)}에서 검색` : esc(c.desc)} · 검색결과 <b>${FILTERED.length.toLocaleString()}</b>개</p></div>
     ${q || S.cat !== 'all' ? `<button class="ghost-btn ch-home" id="chHome" title="검색·필터를 모두 해제하고 처음 화면으로">🏠 처음 화면</button>` : ''}
     <button class="ghost-btn ch-jump" id="chJump">전형 목록 보기 <span aria-hidden="true">↓</span></button>`;
  const hb = $('#chHome');
  if (hb) hb.onclick = goHome;
  const jb = $('#chJump');
  // ⚠️ smooth 스크롤이 무시되는 환경이 있다(자동화 브라우저·reduced-motion 설정 등).
  //    그대로 두면 버튼을 눌러도 아무 일이 없어 보이므로, 이동이 없으면 즉시 점프로 폴백한다.
  if (jb) jb.onclick = scrollToResults;
  const items = activeFilterItems();
  $('#filterSummary').innerHTML = items.length
    ? `<span class="filter-summary-label">적용 조건 ${items.length}개</span>` + items.map(([key, text]) => `<button class="filter-token" data-clear-filter="${esc(key)}" aria-label="${esc(text)} 조건 해제">${esc(text)} <span aria-hidden="true">×</span></button>`).join('') + '<button class="filter-clear-all" id="clearAllFilters">모두 해제</button>'
    : '<span class="filter-summary-label">전체 대학 · 모든 전형을 보고 있습니다.</span>';
  $('#filterSummary').querySelectorAll('[data-clear-filter]').forEach(b => b.onclick = () => clearActiveFilter(b.dataset.clearFilter));
  const all = $('#clearAllFilters'); if (all) all.onclick = goHome;
  $('#emptySearchHelp').classList.toggle('hidden', FILTERED.length > 0);
  const help = $('#emptySearchText'); if (help) help.textContent = `“${S.search || c.label}”에 맞는 전형이 없습니다. 적용 조건을 해제하거나 대학·학과명을 선택해 다시 검색하세요.`;
}

/* ----- 대학 단위 전형별 학과 요약 -----
   검색·필터 결과가 한 대학으로 좁혀지면, 전형유형(교과/종합/논술/실기)별로
   전형→학과를 정렬해 한눈에 보여준다(사용자 요청). 여러 대학이 섞이면 숨긴다. */
const JHTYPE_ORDER = ['학생부교과', '학생부종합', '논술', '실기/실적', '지역인재', '기타전형'];
function renderUniPanel() {
  const box = $('#uniPanel');
  if (!box) return;
  const unis = [...new Set(FILTERED.map(r => r.uni))];
  // 본교+분교(예: 고려대/고려대(세종))가 함께 잡히는 경우가 흔해 2개 대학까지 허용한다.
  if (unis.length < 1 || unis.length > 2 || FILTERED.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
  // ⚠️ 묶는 단위는 대학명이 아니라 **캠퍼스**다. r.uni 로만 묶으면 경북대 대구 577행과
  //    상주 103행이 한 덩어리가 돼 어느 학과가 상주인지 알 수 없다(사용자 제보 2026-08-28).
  //    입결이 캠퍼스별로 크게 갈리므로(대구 2.70 vs 상주 5.28) 섞으면 판단을 그르친다.
  //    게이트(2개 대학)는 uni 기준을 유지한다 — campusKey 로 세면 부산대(부산·밀양·양산)가
  //    3개가 돼 멀쩡히 뜨던 패널이 사라진다.
  const keys = [...new Set(FILTERED.map(campusKey))];
  box.innerHTML = keys.map(k => uniPanelHTML(k, FILTERED.filter(r => campusKey(r) === k))).join('');
  box.style.display = '';
}
function uniPanelHTML(label, rows) {
  // label 은 캠퍼스까지 붙은 표시명(예: '경북대학교(상주)'), 접수일 조회는 실제 대학명으로 한다.
  const uni = rows[0] ? rows[0].uni : label;
  const byType = {};
  rows.forEach(r => {
    const t = JHTYPE_ORDER.includes(r.jhBucket) ? r.jhBucket : '기타';
    ((byType[t] = byType[t] || {})[r.jhname] = byType[t][r.jhname] || []).push(r);
  });
  const typeKeys = [...JHTYPE_ORDER, '기타'].filter(t => byType[t]);
  const ap = applyInfo(uni);
  return `<div class="panel-head"><h2>🏫 ${esc(label)} 전형별 학과 한눈에</h2>
      <span class="muted">전형을 누르면 학과 목록이 열립니다</span></div>
    ${ap ? `<div class="uni-apply${ap.early ? ' early' : ''}">🗓️ 원서접수 <b>${ap.txt}</b>${ap.early ? ' <span class="delta tighten">조기마감</span>' : ''} <span class="muted">· ${esc(ap.via)} 접수 기준</span></div>` : ''}
    <div class="uni-cols">${typeKeys.map(t => {
      // 전형명은 가나다순, 특수전형(지역인재·고른기회·사회배려 등)은 맨 뒤(그 안에서도 가나다).
      const jhs = Object.entries(byType[t]).sort((a, b) =>
        (SPECIAL_JH.test(a[0]) - SPECIAL_JH.test(b[0])) || a[0].localeCompare(b[0], 'ko'));
      return `<div class="uni-col"><h3 class="uni-type${S.jhtypes.has(t) ? ' on' : ''}" data-jt="${esc(t)}" role="button" tabindex="0" title="클릭하면 아래 표를 이 전형유형으로 거릅니다">${esc(t)} <span class="muted">${jhs.reduce((s, [, rs]) => s + sumE(rs), 0).toLocaleString()}명</span></h3>
        ${jhs.map(([jh, rs]) => `<details class="uni-jh"><summary><b>${esc(jh)}</b> <span class="muted">${rs.length}개 단위 · ${sumE(rs).toLocaleString()}명</span></summary>
          <ul>${rs.slice().sort((a, b) => (b.enroll || 0) - (a.enroll || 0)).map(r =>
            `<li class="uni-dept" data-i="${r._i}" role="button" tabindex="0" title="누르면 상세 카드가 열립니다">${esc(deptDisp(r)).replace(/\n/g, ' ')} <span class="muted">${r.enroll != null ? r.enroll + '명' : ''}</span></li>`).join('')}</ul>
        </details>`).join('')}</div>`;
    }).join('')}</div>`;
}
// 학과 클릭 → 해당 학과 상세 카드(위임 — 패널은 renderAll마다 다시 그려진다)
document.addEventListener('click', e => {
  const li = e.target.closest && e.target.closest('#uniPanel .uni-dept');
  if (li) { openModal(+li.dataset.i); return; }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const li = e.target.closest && e.target.closest('#uniPanel .uni-dept');
  if (li) { e.preventDefault(); openModal(+li.dataset.i); }
});
// 유형 헤더 클릭 → 전형유형 필터와 연동(위임 — 패널은 renderAll마다 다시 그려진다)
document.addEventListener('click', e => {
  const h = e.target.closest && e.target.closest('#uniPanel .uni-type');
  if (!h) return;
  const t = h.dataset.jt;
  S.jhtypes.has(t) ? S.jhtypes.delete(t) : S.jhtypes.add(t);
  renderSoft(); renderFilters();
});
const sumE = rs => rs.reduce((s, r) => s + (r.enroll || 0), 0);

/* ----- KPIs ----- */
function renderKPIs() {
  const f = FILTERED;
  const nNew = f.filter(r => r.dkind === 'new').length;
  const nUp = f.filter(r => r.dkind === 'up').length;
  const nDown = f.filter(r => r.dkind === 'down').length;
  const nTighten = f.filter(r => r.chKindShow === '강화' || r.chKindShow === '신설').length;
  const nEase = f.filter(r => r.chKindShow === '완화' || r.chKindShow === '폐지').length;
  const dom = dominantStd(f);
  const avgG = dom.std ? avg(f.filter(r => r.stdK26 === dom.std).map(r => r.g[0])) : null;
  const avgC = avg(f.map(r => r.c[0]));
  const nUni = new Set(f.map(r => r.uni)).size;
  let nGood = 0, nBad = 0;
  f.forEach(r => { const v = V(r); if (v.label === '유리') nGood++; else if (v.label === '불리') nBad++; });
  const cards = [
    { cls: 'primary', label: '📑 검색결과', val: f.length.toLocaleString(), sub: `${nUni}개 대학` },
    { cls: 'good', label: '🟢 올해 유리', val: nGood.toLocaleString(), sub: '2026↔2025 + 변화 종합' },
    { cls: 'bad', label: '🔴 올해 불리', val: nBad.toLocaleString(), sub: '2026↔2025 + 변화 종합' },
    { cls: 'new', label: '✨ 신설', val: nNew.toLocaleString(), sub: '첫해 입결 주목' },
    { cls: 'good', label: '▲ 증원', val: nUp.toLocaleString(), sub: '합격선 하락 가능' },
    { cls: 'bad', label: '▼ 감원', val: nDown.toLocaleString(), sub: '합격선 상승 가능' },
    { cls: 'good', label: '🔒 최저 강화·신설', val: nTighten.toLocaleString(), sub: '지원 위축→유리' },
    { cls: 'bad', label: '🔓 최저 완화·폐지', val: nEase.toLocaleString(), sub: '지원 증가→경쟁↑' },
    { cls: '', label: '🎯 평균 입결(2026)', val: avgG == null ? '–' : avgG.toFixed(2),
      sub: dom.std ? `${CUT_LABELS[dom.std]} 기준 ${fmtInt(dom.kept)}건` + (dom.dropped ? ` · 다른 기준 ${fmtInt(dom.dropped)}건 제외` : '') : '등급, 낮을수록 우수' },
    { cls: '', label: '🔥 평균 경쟁률(2027)', val: avgC == null ? '–' : avgC.toFixed(1) + ':1', sub: '지원자/모집' },
  ];
  $('#kpis').innerHTML = cards.map(c =>
    `<div class="kpi ${c.cls}"><div class="k-bar"></div><div class="k-label">${c.label}</div><div class="k-val">${c.val}</div><div class="k-sub">${c.sub}</div></div>`
  ).join('');
}

/* ----- YoY evidence strip (2026 vs 2025) ----- */
function yoyHTML(r, big) {
  const g = yoyGrade(r), c = yoyComp(r);
  const parts = [];
  if (g) { const cls = g.dir === 'easier' ? 'good' : g.dir === 'harder' ? 'bad' : 'neu';
    parts.push(`<span class="yoy ${cls}"><i>입결</i>${g.y25.toFixed(2)}<b>→</b>${g.y26.toFixed(2)}</span>`); }
  if (c) { const cls = c.dir === 'down' ? 'good' : c.dir === 'up' ? 'bad' : 'neu';
    parts.push(`<span class="yoy ${cls}"><i>경쟁</i>${c.y25.toFixed(1)}<b>→</b>${c.y26.toFixed(1)}</span>`); }
  if (!parts.length) return big ? '<div class="yoy-row"><span class="muted">2025·2026 입결 데이터 없음</span></div>' : '';
  return `<div class="yoy-row${big ? ' big' : ''}">${parts.join('')}</div>`;
}
/* ----- highlights (유불리 중심) ----- */
function hlRelevance(r) {
  const v = V(r);
  let s = Math.abs(v.score) * 10;
  if (r.dkind === 'new') s += 12;
  if (r.dkind === 'up' || r.dkind === 'down') s += Math.abs(r.dn || 0) * 1.5;
  if (r.c[0] != null) s += Math.min(r.c[0], 30) * 0.15;
  return s;
}
function renderHighlights() {
  const seg = $('#hlFilter');
  if (!seg.dataset.init) {
    seg.dataset.init = '1';
    seg.innerHTML = [['all', '전체'], ['good', '유리'], ['bad', '불리'], ['new', '신설'], ['nong', '농어촌']]
      .map(([k, l]) => `<button data-k="${k}" class="${S.hlFilter === k ? 'on' : ''}">${l}</button>`).join('');
    seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.hlFilter = b.dataset.k; [...seg.children].forEach(c => c.classList.toggle('on', c.dataset.k === S.hlFilter)); renderHighlights(); };
    // 전형유형 필터(사용자 요청): 유불리 카드도 교과/종합/논술/실기별로 골라 본다.
    const seg2 = el('div', 'seg hl-jhseg');
    seg2.innerHTML = [['', '전형 전체'], ['학생부교과', '교과'], ['학생부종합', '종합'], ['논술', '논술'], ['실기/실적', '실기']]
      .map(([k, l]) => `<button data-j="${k}" class="${(S.hlJhtype || '') === k ? ' on' : ''}">${l}</button>`).join('');
    seg2.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.hlJhtype = b.dataset.j; [...seg2.children].forEach(c => c.classList.toggle('on', c.dataset.j === (S.hlJhtype || ''))); renderHighlights(); };
    seg.parentElement.appendChild(seg2);
  } else {
    [...seg.children].forEach(c => c.classList.toggle('on', c.dataset.k === S.hlFilter));
  }
  document.querySelectorAll('#hlFilter button, .hl-jhseg button').forEach(b => b.setAttribute('aria-pressed', String(b.classList.contains('on'))));
  const nong = S.hlFilter === 'nong';
  const hd = $('#heroDesc');
  if (hd) hd.innerHTML = nong
    ? '<b>농어촌학생전형</b>만 모아 봅니다 — 큐레이션 없이 <b>전 대학</b> 대상으로, 2026 vs 2025 입결·경쟁률 추이와 2027 모집인원·수능최저 변화를 종합한 <b>자동 분석 결과</b>입니다. 카드를 누르면 상세 내용을 볼 수 있어요.'
    : '입결·추합 2026 vs 2025, 경쟁률 2027 vs 2026 추이와 2028 모집인원·수능최저 변화를 종합한 <b>자동 분석 결과</b>입니다. <b>메디컬·상위권 본교(SKY·서성한·중경외시·건동홍)</b>까지만 선별합니다. 카드를 누르면 상세 내용을 볼 수 있어요.';
  let pool = FILTERED.filter(r => {
    const v = V(r);
    if (!v.sig.length) return false;
    // 농어촌만 보기: 큐레이션(메디컬·상위권) 우회 — 전 대학의 농어촌학생전형을 유불리와 함께
    if (S.hlJhtype && r.jhtype !== S.hlJhtype) return false;   // 전형유형 필터
    if (nong) return r.jhname.includes('농어촌');
    if (!isPickWorthy(r)) return false;        // 메디컬·상위권 본교 한정
    if (S.hlFilter === 'good') return v.label === '유리';
    if (S.hlFilter === 'bad') return v.label === '불리';
    if (S.hlFilter === 'new') return r.dkind === 'new';
    return true;
  });
  let top;
  if (S.search.trim()) {
    // 검색 중엔 관련도 교차 배치 대신 대학 서열순(건동홍숙까지, 이후 가나다).
    // 같은 대학 안에서는 교과(추천) → 학종 → 논술 → 실기 순.
    const ji = t => { const i = JHTYPE_ORDER.indexOf(t); return i < 0 ? 9 : i; };  // r.jhBucket 기준
    pool.sort((a, b) => uniRank(a.uni) - uniRank(b.uni)
      || (uniRank(a.uni) === 999 ? a.uni.localeCompare(b.uni, 'ko') : 0)
      || ji(a.jhBucket) - ji(b.jhBucket)
      || a.jhname.localeCompare(b.jhname, 'ko'));
    top = pool.slice(0, 12);
  } else if (S.hlFilter === 'all') {                // 유리·불리·신설 교차 배치(편향 방지)
    const g = [], b = [], n = [];
    pool.forEach(r => { const c = V(r).cls; (c === 'good' ? g : c === 'bad' ? b : n).push(r); });
    [g, b, n].forEach(a => a.sort((x, y) => hlRelevance(y) - hlRelevance(x)));
    top = []; let gi = 0, bi = 0, ni = 0;
    while (top.length < 12 && (gi < g.length || bi < b.length || ni < n.length)) {
      const before = top.length;
      if (gi < g.length) top.push(g[gi++]);
      if (top.length < 12 && bi < b.length) top.push(b[bi++]);
      if (top.length < 12 && ni < n.length && top.length % 4 === 3) top.push(n[ni++]);
      // ⚠️ 진전 가드. 신설(n)만 남고 top.length%4!==3 이면 세 줄 모두 건너뛰어
      //    조건은 참인데 아무것도 안 담기는 무한 루프가 된다 — 실제로 '아주' 검색 시
      //    브라우저가 멈췄다(아주대는 메디컬로 선별되는데 남은 후보가 지역의사선발 신설뿐이라
      //    유리·불리가 비었다). 남은 항목은 아래 잔여 채우기가 처리하므로 빠져나가면 된다.
      if (top.length === before) break;
    }
    [...g.slice(gi), ...b.slice(bi), ...n.slice(ni)].sort((x, y) => hlRelevance(y) - hlRelevance(x)).forEach(r => { if (top.length < 12) top.push(r); });
  } else {
    pool.sort((a, b) => hlRelevance(b) - hlRelevance(a));
    top = pool.slice(0, 12);
  }
  $('#hlSub').textContent = nong ? `· 농어촌학생전형 · 전 대학 ${pool.length.toLocaleString()}건 중 주요 ${top.length}건` : `· ${pool.length.toLocaleString()}건 중 주요 ${top.length}건`;
  const box = $('#highlightCards');
  if (!top.length) { box.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="es-ico">🔍</div>이 조건의 <b>${nong ? '농어촌학생전형' : '메디컬·상위권 본교'}</b>에서 두드러진 유불리 신호가 없습니다.<br><span class="muted">아래 전형 목록에서 전체 대학을 확인하세요.</span></div>`; return; }
  box.innerHTML = top.map(r => {
    const v = V(r), d = deltaInfo(r);
    const medSub = ['med_med', 'med_dent', 'med_oriental', 'med_vet', 'med_pharm'].find(k => r.cats.includes(k));
    const medBadge = medSub ? `<span class="med-badge">🩺 메디컬·${esc(CAT_BY[medSub].label)}</span>` : '';
    const semiBadge = r.cats.includes('semiconductor_contract') ? `<span class="semi-badge" title="산학협력법 근거 정원 외 채용조건형 계약학과">🔗 정원 외·채용조건형</span>` : '';
    const tags = [];
    if (r.dkind === 'new') tags.push('<span class="tag new">신설</span>');
    else if (r.dkind === 'up') tags.push(`<span class="tag up">증원 ${d.txt}</span>`);
    else if (r.dkind === 'down') tags.push(`<span class="tag down">감원 ${d.txt}</span>`);
    else if (r.dkind === 'split') tags.push('<span class="tag new">분리</span>');
    else if (r.dkind === 'merge') tags.push('<span class="tag new">통합</span>');
    if (r.chKindShow) { const cls = (r.chKindShow === '강화' || r.chKindShow === '신설') ? 'tighten' : (r.chKindShow === '변경') ? 'neu' : 'ease'; tags.push(`<span class="tag ${cls}">최저 ${r.chKindShow}</span>`); }
    const reasons = v.sig.slice(0, 2).map(s => {
      const ico = s.dir === 'good' ? '<span class="dot-good">▲</span>' : s.dir === 'bad' ? '<span class="dot-bad">▼</span>' : '<span class="dot-new">✦</span>';
      return `<div class="imp-line">${ico}<span>${esc(s.t)}</span></div>`;
    }).join('');
    return `<div class="hl-card${medSub ? ' is-medical' : ''}" data-i="${r._i}" tabindex="0" role="button" aria-label="${medSub ? '메디컬 ' : ''}${esc(r.uni)} ${esc(deptDisp(r))}, 올해 ${v.label} — 상세 보기">
      <div class="hl-top">${medBadge}${semiBadge}<span class="hl-uni">${esc(r.uni)}</span><span class="impact-chip ${v.cls}" style="margin-left:auto">${v.label}</span></div>
      <div class="hl-dept">${esc(deptDisp(r))}</div>
      <div class="hl-jh">${esc(r.jhtype)} · ${esc(r.jhname)}${r.qual ? ` · <span class="qual-tag">${esc(r.qual)}</span>` : ''} · 모집 ${fmtInt(r.enroll)}명${examBadge(r)}</div>
      ${yoyHTML(r)}
      <div class="hl-tags">${tags.join('')}</div>
      <div class="hl-impact">${reasons || '<span class="muted">상세 보기</span>'}</div>
    </div>`;
  }).join('');
  box.querySelectorAll('.hl-card').forEach(c => {
    c.onclick = () => openModal(+c.dataset.i);
    c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(+c.dataset.i); } };
  });
}

/* ----- charts ----- */
function renderCharts() {
  const seg = $('#chartMetric');
  if (!seg.dataset.init) {
    seg.dataset.init = '1';
    seg.innerHTML = [['grade', '평균 입결'], ['comp', '평균 경쟁률'], ['count', '전형 수']]
      .map(([k, l]) => `<button data-k="${k}" class="${S.chartMetric === k ? 'on' : ''}">${l}</button>`).join('');
    seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.chartMetric = b.dataset.k; [...seg.children].forEach(c => c.classList.toggle('on', c.dataset.k === S.chartMetric)); renderCharts(); };
  }
  seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.classList.contains('on'))));
  // aggregate by university
  // 입결은 기준이 섞이면 대학 간 순위가 왜곡되므로 지배 기준 행만으로 평균한다.
  const domA = dominantStd(FILTERED);
  // 캠퍼스가 갈리는 대학은 캠퍼스별로 센다 — 본교와 분캠의 입결 차이가 커서 합산하면 왜곡된다.
  const byU = {};
  FILTERED.forEach(r => { const k = campusKey(r); (byU[k] = byU[k] || []).push(r); });
  let arr = Object.entries(byU).map(([uni, rs]) => ({
    uni, n: rs.length, comp: avg(rs.map(r => r.c[0])),
    grade: domA.std ? avg(rs.filter(r => r.stdK26 === domA.std).map(r => r.g[0])) : null,
    gn: domA.std ? rs.filter(r => r.stdK26 === domA.std && r.g[0] != null).length : 0,
  }));
  const metric = S.chartMetric;
  // 표본 하한. 기준을 하나로 좁히면 대학당 행수가 줄어 1~2건짜리가 상위에 올라온다
  // (실측: 서울교대 1건이 2위). 3건 미만은 대학 평균으로 보기 어려워 뺀다.
  if (metric === 'grade') { arr = arr.filter(a => a.grade != null && a.gn >= 3).sort((a, b) => a.grade - b.grade); }
  else if (metric === 'comp') { arr = arr.filter(a => a.comp != null).sort((a, b) => b.comp - a.comp); }
  else { arr.sort((a, b) => b.n - a.n); }
  arr = arr.slice(0, 22);
  $('#chartTitleA').innerHTML = metric === 'grade'
    ? `대학별 평균 입결등급 · 상위 22` +
      (domA.std ? ` <span class="chart-basis">${CUT_LABELS[domA.std]} 기준${domA.dropped ? ` · 다른 기준 ${fmtInt(domA.dropped)}건 제외` : ''}</span>` : '')
    : metric === 'comp' ? '대학별 평균 경쟁률 (높은 순) · 상위 22' : '대학별 전형 수 · 상위 22';
  const catColor = S.cat === 'all' ? 'var(--primary)' : CAT_BY[S.cat].color;
  if (!arr.length) { $('#chartA').innerHTML = '<div class="no-data" style="padding:20px">데이터 없음</div>'; }
  else {
    const getV = a => metric === 'grade' ? a.grade : metric === 'comp' ? a.comp : a.n;
    const maxV = Math.max(...arr.map(getV));
    const minV = metric === 'grade' ? Math.min(...arr.map(getV)) : 0;
    $('#chartA').innerHTML = arr.map(a => {
      const v = getV(a);
      const w = metric === 'grade'
        ? (8 + (1 - (v - minV) / ((maxV - minV) || 1)) * 88) // shorter bar = better grade visually inverted
        : (8 + v / (maxV || 1) * 90);
      const label = metric === 'grade' ? v.toFixed(2) : metric === 'comp' ? v.toFixed(1) + ':1' : v + '개';
      const inside = w >= 26;
      return `<div class="bar-row"><div class="bl" data-uni="${esc(a.uni)}" title="${esc(a.uni)}">${esc(a.uni)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(1)}%;background:${catColor}">${inside ? label : ''}</div>${inside ? '' : `<span class="bar-val-out">${label}</span>`}</div>
        <div class="bn">${metric === 'grade' ? a.gn : a.n}개</div></div>`;
    }).join('');
        // 라벨이 '경북대학교(상주)'처럼 캠퍼스를 달고 있으면 괄호를 풀어 검색어로 넣는다
    // (대학명에는 괄호가 없으므로 통짜로 넣으면 0건이 된다. 시군은 검색 대상에 포함돼 있다).
    $('#chartA').querySelectorAll('.bl').forEach(b => b.onclick = () => {
      const q = b.dataset.uni.replace(/\(([^)]+)\)$/, ' $1');
      $('#search').value = q; S.search = q; syncSearchClear(); renderAll();
    });
  }
  // trend chart B
  renderTrendChart();
}
function renderTrendChart() {
  const f = FILTERED;
  // 지표별 최신 가용 연도 — 입결 2024→2026, 경쟁률 2025→2027. 함께 그릴 땐 두 해를 병기한다.
  const yearsLab = S.trendMetric === 'comp' ? ['2025', '2026', '2027']
    : S.trendMetric === 'grade' ? ['2024', '2025', '2026'] : ['2024/25', '2025/26', '2026/27'];
  // 지표 토글 — 입결과 경쟁률은 축 방향이 반대(입결은 낮을수록 위)라 겹쳐 그리면 읽기 어렵다.
  // 하나만 고르면 그 지표가 세로 공간을 다 쓰고 눈금선·축 라벨까지 붙는다.
  const tseg = $('#trendMetric');
  if (tseg && !tseg.dataset.init) {
    tseg.dataset.init = '1';
    tseg.innerHTML = [['both', '함께'], ['grade', '입결'], ['comp', '경쟁률']]
      .map(([k, l]) => `<button data-k="${k}" class="${S.trendMetric === k ? 'on' : ''}" aria-pressed="${S.trendMetric === k}">${l}</button>`).join('');
    tseg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      S.trendMetric = b.dataset.k;
      [...tseg.children].forEach(c => { const on = c.dataset.k === S.trendMetric; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
      renderTrendChart();
    };
  }
  const tm = S.trendMetric || 'both';
  const solo = tm !== 'both';
  // 추이도 같은 기준끼리만. 연도 사이에 기준이 바뀐 행(std26≠std25)은 추세가 아니라 지표 변경이므로 뺀다.
  const domT = dominantStd(f);
  const gf = domT.std ? f.filter(r => r.stdK26 === domT.std && (!r.std26 || !r.std25 || nzStd(r.std26) === nzStd(r.std25))) : [];
  const gradeY = [avg(gf.map(r => r.g[2])), avg(gf.map(r => r.g[1])), avg(gf.map(r => r.g[0]))];
  const compY = [avg(f.map(r => r.c[2])), avg(f.map(r => r.c[1])), avg(f.map(r => r.c[0]))];
  const W = 320, H = solo ? 230 : 190, padL = solo ? 46 : 38, padR = 38, padT = solo ? 24 : 18, padB = 26;
  const x = i => padL + i / 2 * (W - padL - padR);
  function series(vals, lo, hi, color, fmtf, below, flip) {
    const ok = vals.map((v, i) => ({ v, i })).filter(p => p.v != null);
    if (ok.length < 2) return '';
    // flip=true(입결): 등급 숫자가 작을수록(=입결 우수) 위로. flip=false(경쟁률): 값이 클수록 위로
    const y = v => { const t = (v - lo) / ((hi - lo) || 1); return padT + (flip ? t : (1 - t)) * (H - padT - padB); };
    const path = ok.map((p, k) => (k ? 'L' : 'M') + x(p.i) + ' ' + y(p.v).toFixed(1)).join(' ');
    const dots = ok.map(p => `<circle cx="${x(p.i)}" cy="${y(p.v).toFixed(1)}" r="3.4" fill="${color}"/>
      <text x="${x(p.i)}" y="${(y(p.v) + (below ? 16 : -8)).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="${color}">${fmtf(p.v)}</text>`).join('');
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
  }
  const gOk = gradeY.filter(v => v != null), cOk = compY.filter(v => v != null);
  const showG = tm !== 'comp', showC = tm !== 'grade';
  // 장식이 아니라 데이터 차트다 — 숨기지 말고 스크린리더에 요약을 준다
  const gLab = gradeY.map((v, i) => v == null ? '' : `${2024 + i}년 ${v.toFixed(2)}등급`).filter(Boolean).join(', ');
  const cLab = compY.map((v, i) => v == null ? '' : `${2024 + i}년 ${v.toFixed(1)}대 1`).filter(Boolean).join(', ');
  const aria = tm === 'comp' ? `2024~2026 평균 경쟁률 추이. ${cLab || '데이터 없음'}`
    : tm === 'grade' ? `2024~2026 평균 입결 추이. ${gLab || '데이터 없음'}`
    : `2024~2026 평균 입결·경쟁률 추이. 평균 입결 ${gLab || '데이터 없음'}`;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${aria}">`;
  // 단독 보기에서는 값 축을 읽을 수 있게 가로 눈금선 3개와 좌측 라벨을 깐다
  if (solo) {
    const ok = tm === 'comp' ? cOk : gOk;
    if (ok.length) {
      const lo = tm === 'comp' ? Math.min(...ok) * .8 : Math.min(...ok) - .3;
      const hi = tm === 'comp' ? Math.max(...ok) * 1.15 : Math.max(...ok) + .3;
      const flip = tm === 'grade';
      for (let k = 0; k <= 2; k++) {
        const v = lo + (hi - lo) * k / 2;
        const t = (v - lo) / ((hi - lo) || 1);
        const yy = padT + (flip ? t : 1 - t) * (H - padT - padB);
        svg += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>`;
        svg += `<text x="${padL - 6}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="700" fill="var(--text-soft)">${tm === 'comp' ? v.toFixed(1) : v.toFixed(2)}</text>`;
      }
    }
  }
  svg += `<line class="axis" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>`;
  yearsLab.forEach((l, i) => { svg += `<text x="${x(i)}" y="${H - padB + 16}" text-anchor="middle" font-size="10.5" font-weight="700">${l}</text>`; });
  if (showG && gOk.length) { const lo = Math.min(...gOk) - .3, hi = Math.max(...gOk) + .3; svg += series(gradeY, lo, hi, 'var(--primary)', v => v.toFixed(2), true, true); }
  if (showC && cOk.length) { const lo = Math.min(...cOk) * .8, hi = Math.max(...cOk) * 1.15; svg += series(compY, lo, hi, 'var(--new)', v => v.toFixed(1), false, false); }
  svg += `</svg>`;
  const legG = `<span><i style="background:var(--primary)"></i>평균 입결 (위로 갈수록 우수)</span>`;
  const legC = `<span><i style="background:var(--new)"></i>평균 경쟁률 (위로 갈수록 높음)</span>`;
  svg += `<div class="legend">${showG ? legG : ''}${showC ? legC : ''}</div>`;
  if (solo && !(tm === 'comp' ? cOk : gOk).length) svg = `<div class="no-data" style="padding:20px">데이터 없음</div>`;
  $('#chartB').innerHTML = svg;
}

/* ----- table ----- */
const COLS = [
  // short: 모바일(≤620px)에서 쓰는 짧은 라벨. 긴 라벨은 좁은 화면에서 열을 넓혀 표를 밀어낸다.
  { k: 'uni', label: '대학 / 모집단위', short: '대학·학과', sort: 'uni' },
  { k: 'jh', label: '전형', short: '전형', sort: 'jh' },
  { k: 'enroll', label: '모집(전년대비)', short: '모집', sort: 'enroll' },
  { k: 'least', label: '수능최저', short: '최저', sort: null },
  { k: 'grade', label: '입결 2026 (전년비)', short: '입결', sort: 'grade' },
  { k: 'comp', label: '경쟁률 2027 (전년비)', short: '경쟁률', sort: 'comp' },
  { k: 'impact', label: '올해 유불리', short: '유불리', sort: 'impact' },
  { k: 'add', label: '담기', short: '담기', sort: null },
];
function yoyBadge(r, kind) {
  if (kind === 'grade') { const g = yoyGrade(r); if (!g || g.dir === 'flat') return ''; const cls = g.dir === 'easier' ? 'good' : 'bad'; const ar = g.dir === 'harder' ? '▲' : '▼';
    return `<span class="ybadge ${cls}" title="입결 ${g.y25.toFixed(2)} → ${g.y26.toFixed(2)}등급 · ${g.dir === 'easier' ? '입결 하락(쉬워짐)·유리' : '입결 상승(어려워짐)·불리'}">${ar}${Math.abs(g.d).toFixed(2)}</span>`; }
  if (kind === 'comp') { const c = yoyComp(r); if (!c || c.dir === 'flat') return ''; const cls = c.dir === 'down' ? 'good' : 'bad'; const ar = c.y26 > c.y25 ? '▲' : '▼';
    return `<span class="ybadge ${cls}" title="2025 ${c.y25.toFixed(1)} → 2026 ${c.y26.toFixed(1)}:1 (${c.dir === 'down' ? '경쟁 완화·유리' : '경쟁 심화·불리'})">${ar}${Math.abs(c.d).toFixed(1)}</span>`; }
  return '';
}
function renderTable() {
  $('#gridHead').innerHTML = '<tr>' + COLS.map(c =>
    `<th scope="col" data-sort="${c.sort || ''}" class="col-${c.k}${c.sort === S.sort ? ' sorted' : ''}"${c.sort ? ` role="button" tabindex="0" aria-sort="${c.sort === S.sort ? (S.sortDir < 0 ? 'descending' : 'ascending') : 'none'}"` : ''}><span class="lb-full">${c.label}</span><span class="lb-short">${c.short || c.label}</span>${c.sort ? `<span class="sort-ar" aria-hidden="true">${c.sort === S.sort ? (S.sortDir < 0 ? '▼' : '▲') : '▽'}</span>` : ''}</th>`
  ).join('') + '</tr>';
  $('#gridHead').querySelectorAll('th').forEach(th => {
    const sk = th.dataset.sort; if (!sk) return;
    const doSort = () => { if (S.sort === sk) S.sortDir *= -1; else { S.sort = sk; S.sortDir = (sk === 'grade' || sk === 'uni' || sk === 'jh') ? 1 : -1; } sortFiltered(); S.page = 1; renderTable(); };
    th.onclick = doSort;
    th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSort(); } };
  });
  // 표 상단 지역 필터(사이드바와 동일 상태 공유) — 표만 보는 사용자를 위한 진입점
  const ph = $('#sortSeg').parentElement;
  let rs = ph.querySelector('#tblRegion');
  if (!rs) {
    rs = document.createElement('select'); rs.id = 'tblRegion'; rs.className = 'f-select tbl-region';
    ph.insertBefore(rs, $('#sortSeg'));
    rs.onchange = () => { S.region = rs.value; renderSoft(); renderFilters(); };
  }
  rs.setAttribute('aria-label', '전형 목록 지역 필터');
  rs.innerHTML = '<option value="">지역: 전국</option>' + REGIONS.map(x => `<option value="${esc(x)}" ${S.region === x ? 'selected' : ''}>${esc(x)}</option>`).join('');
  // sort segment quick
  const ss = $('#sortSeg');
  // 입결 높은순 = 등급 숫자 작은(1.0) 순 = grade 오름차순(dir 1); 낮은순 = grade 내림차순(dir -1)
  const SORTS = [['유불리순', 'impact', -1], ['입결 높은순', 'grade', 1], ['입결 낮은순', 'grade', -1], ['경쟁률순', 'comp', -1], ['모집인원순', 'enroll', -1]];
  const isActive = (sk, sd) => S.sort === sk && (sk !== 'grade' || S.sortDir === sd);
  if (!ss.dataset.init) {
    ss.dataset.init = '1';
    ss.innerHTML = SORTS.map(([l, sk, sd]) => `<button data-sk="${sk}" data-sd="${sd}" class="${isActive(sk, sd) ? 'on' : ''}">${l}</button>`).join('');
    ss.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.sort = b.dataset.sk; S.sortDir = +b.dataset.sd; [...ss.children].forEach(c => c.classList.toggle('on', isActive(c.dataset.sk, +c.dataset.sd))); sortFiltered(); S.page = 1; renderTable(); };
  } else { [...ss.children].forEach(c => c.classList.toggle('on', isActive(c.dataset.sk, +c.dataset.sd))); }

  const total = FILTERED.length;
  const pages = Math.max(1, Math.ceil(total / S.perPage));
  if (S.page > pages) S.page = pages;
  persistView();
  [...ss.children].forEach(c => c.setAttribute('aria-pressed', String(isActive(c.dataset.sk, +c.dataset.sd))));
  const start = (S.page - 1) * S.perPage;
  const slice = FILTERED.slice(start, start + S.perPage);
  // ⚠️ '총 85개'만 보이면 화면의 60개가 전부인 줄 알고 '누락'으로 오해한다(사용자 제보 2026-08-28:
  //    교대 85행 중 청주·춘천·한국교원대가 2페이지로 밀렸다). 지금 보는 구간을 함께 밝힌다.
  $('#tableCount').textContent = total > slice.length
    ? `· ${(start + 1).toLocaleString()}~${(start + slice.length).toLocaleString()} / 총 ${total.toLocaleString()}개`
    : `· 총 ${total.toLocaleString()}개`;
  const statusEl = $('#a11yStatus'); if (statusEl) statusEl.textContent = `${(CAT_BY[S.cat] ? CAT_BY[S.cat].label : '전체')} 검색결과 ${total.toLocaleString()}개`;

  // 필터를 겹쳐 0건이 되면 표가 통째로 비어 '데이터가 빠졌다'·'앱이 멈췄다'로 읽힌다.
  // 어떤 조건 때문에 비었는지와 원클릭 해제를 함께 준다.
  if (!FILTERED.length) {
    const on = [];
    if (S.search) on.push(`검색 "${esc(S.search)}"`);
    if (S.region) on.push(`지역 ${esc(S.region)}`);
    if (S.jhtypes.size) on.push(`전형유형 ${[...S.jhtypes].map(esc).join('·')}`);
    if (S.changes.size) on.push(`변화 ${[...S.changes].length}종`);
    if (S.minLeast) on.push('수능최저 조건');
    if (S.interview) on.push('면접 조건');
    if (S.stdCut) on.push('과거 입결 조건');
    $('#gridBody').innerHTML =
      `<tr><td colspan="${COLS.length}" class="empty-row">` +
      `<b>조건에 맞는 전형이 없습니다.</b>` +
      (on.length ? `<span>적용 중: ${on.join(' · ')}</span>` : '') +
      `<button type="button" id="emptyReset" class="ghost-btn">상세 필터 해제</button>` +
      `</td></tr>`;
    const rb = $('#emptyReset');
    if (rb) rb.onclick = () => { const r = $('#resetBtn'); if (r && r.onclick) r.onclick(); };
    $('#pager').innerHTML = '';
    return;
  }
  $('#gridBody').innerHTML = slice.map(r => {
    const d = deltaInfo(r);
    const v = V(r);
    const gradeSpark = sparkline(r.g, { invert: true, color: 'var(--primary)' });
    const compSpark = sparkline(r.c, { color: 'var(--new)' });
    const least = r.hasChoejeo
      ? `<span class="jh-pill" style="background:var(--primary-soft);color:var(--primary-ink);border:none" title="${esc(r.choejeo)}">${esc(r.choejeo.slice(0, 16))}${r.choejeo.length > 16 ? '…' : ''}</span>${r.chKindShow ? `<span class="delta ${(r.chKindShow === '강화' || r.chKindShow === '신설') ? 'up' : 'down'}" style="margin-left:4px">${r.chKindShow}</span>` : ''}`
      : '<span class="no-data">없음</span>';
    const inCmp = S.compare.has(r._i);
    const fb = favBucket(r._i);
    const jn = flat(r.jhname);   // 줄바꿈 섞인 전형명을 한 줄로 — 자세한 이유는 flat/cut 정의부 참조
    return `<tr data-i="${r._i}">
      <td class="col-uni"><div class="td-uni">${esc(r.uni)} <span class="muted">${esc(r.region)}${campusOf(r) ? '·' + esc(campusOf(r)) : ''}</span></div><button class="td-dept dept-btn" aria-label="${esc(r.uni)} ${esc(deptDisp(r))} ${esc(jn)} 상세 보기">${esc(deptDisp(r))}${r.cats.includes('semiconductor_contract') ? ' <span class="semi-badge sm" title="정원 외 채용조건형 계약학과">🔗</span>' : ''}</button></td>
      <td class="col-jh">${r.jhBucket !== r.jhtype ? `<span class="jh-pill bucket" title="필터에서는 '${esc(r.jhBucket)}'으로 분류됩니다 — 교과·종합 칩에는 나오지 않습니다">${esc(r.jhBucket)}</span>` : ''}<span class="jh-pill">${esc(r.jhtype.replace('학생부', ''))}</span><div class="muted" style="margin-top:3px" title="${esc(jn)}">${esc(jn)}</div>${r.qual ? `<div class="qual-tag">${esc(r.qual)}</div>` : ''}${examBadge(r)}</td>
      <td class="enroll-cell col-enroll">${fmtInt(r.enroll)}<span class="delta ${d.cls}">${d.txt}</span></td>
      <td class="col-least">${least}</td>
      <td class="col-grade"><div class="cell-top"><span class="grade-val" title="${esc(r.std26 || '기준 미상')}">${fmt(r.g[0])}</span>${r.g[0] != null && CUT_SHORT[r.stdK26] ? `<span class="std-tag${STD_NOT_FINAL.has(r.stdK26) ? ' warn' : ''}" title="${esc(r.std26)}">${CUT_SHORT[r.stdK26]}</span>` : ''}${yoyBadge(r, 'grade')}</div>${gradeSpark}</td>
      <td class="col-comp"><div class="cell-top"><span class="grade-val">${r.c[0] == null ? '–' : r.c[0].toFixed(1)}</span>${yoyBadge(r, 'comp')}</div>${compSpark}${c27Line(r)}</td>
      <td class="col-impact"><span class="impact-chip ${v.cls}">${v.label}</span></td>
      <td class="col-add"><div class="row-btns"><button class="row-fav ${fb ? 'in ' + fb : ''}" data-fav="${r._i}" aria-pressed="${!!fb}" aria-label="${esc(r.uni)} ${esc(deptDisp(r))} ${esc(jn)} 지원카드 ${fb ? '변경' : '담기'}" title="지원카드에 담기 (지원희망/상향 선택)">${fb ? '★' : '☆'}</button><button class="row-add ${inCmp ? 'in' : ''}" data-add="${r._i}" aria-pressed="${inCmp}" aria-label="${esc(r.uni)} ${esc(deptDisp(r))} ${esc(jn)} 비교함 ${inCmp ? '제거' : '담기'}" title="비교함에 담기">${inCmp ? '✓' : '⇄'}</button></div></td>
    </tr>`;
  }).join('');
  $('#gridBody').querySelectorAll('tr').forEach(tr => {
    tr.onclick = e => { if (e.target.closest('[data-add],[data-fav]')) return; openModal(+tr.dataset.i); };
  });
  $('#gridBody').querySelectorAll('[data-add]').forEach(b => b.onclick = e => { e.stopPropagation(); toggleCompare(+b.dataset.add); });
  $('#gridBody').querySelectorAll('[data-fav]').forEach(b => b.onclick = e => { e.stopPropagation(); openFavMenu(+b.dataset.fav, b); });
  renderPager(pages, total);
}
function renderPager(pages, total) {
  const p = $('#pager');
  if (pages <= 1) { p.innerHTML = total ? `<span class="pg-info">총 ${total.toLocaleString()}개</span>` : ''; return; }
  const cur = S.page;
  let btns = [];
  const mk = (n, lab, on, dis) => `<button ${dis ? 'disabled' : ''} class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''} aria-label="${lab === '‹' ? '이전 페이지' : lab === '›' ? '다음 페이지' : n + '페이지'}" data-p="${n}">${lab || n}</button>`;
  btns.push(mk(cur - 1, '‹', false, cur === 1));
  const win = [];
  let s = Math.max(1, cur - 2), e = Math.min(pages, cur + 2);
  if (cur <= 3) e = Math.min(pages, 5);
  if (cur >= pages - 2) s = Math.max(1, pages - 4);
  if (s > 1) { btns.push(mk(1)); if (s > 2) btns.push('<span class="pg-info">…</span>'); }
  for (let i = s; i <= e; i++) btns.push(mk(i, null, i === cur));
  if (e < pages) { if (e < pages - 1) btns.push('<span class="pg-info">…</span>'); btns.push(mk(pages)); }
  btns.push(mk(cur + 1, '›', false, cur === pages));
  btns.push(`<span class="pg-info">${cur} / ${pages}</span>`);
  p.innerHTML = btns.join('');
  p.querySelectorAll('button[data-p]').forEach(b => b.onclick = () => { S.page = +b.dataset.p; renderTable(); scrollToResults(); });
}

/* ----- dialog focus management (trap + return) ----- */
let _focusReturn = null, _trapCleanup = null;
function openDialog(container, label) {
  if (_trapCleanup) _trapCleanup();
  _focusReturn = document.activeElement;
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  if (label) container.setAttribute('aria-label', label);
  const foc = () => [...container.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(n => n.offsetParent !== null);
  const first = foc()[0]; if (first) setTimeout(() => first.focus(), 30);
  const onKey = e => {
    if (e.key !== 'Tab') return;
    const f = foc(); if (!f.length) return;
    const a = f[0], b = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
    else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
  };
  container.addEventListener('keydown', onKey);
  _trapCleanup = () => { container.removeEventListener('keydown', onKey); _trapCleanup = null; };
}
function closeDialog() {
  if (_trapCleanup) _trapCleanup();
  if (_focusReturn && _focusReturn.focus) { try { _focusReturn.focus(); } catch (e) {} }
  _focusReturn = null;
}

function dialogFocusKey(container) {
  const active = document.activeElement;
  if (!active || !container.contains(active)) return null;
  if (active.id) return '#' + active.id;
  for (const key of ['rm', 'up', 'dn', 'sw', 'fav-open', 'cmp-open']) {
    const value = active.getAttribute('data-' + key);
    if (value != null) return `[data-${key}="${value}"]`;
  }
  return null;
}
function restoreDialogFocus(container, key, fallback) {
  if (!key) return;
  const target = container.querySelector(key);
  const next = target && !target.disabled ? target : container.querySelector(fallback);
  next?.focus({ preventScroll: true });
}

/* ----- detail modal ----- */
let _modalReturn = null;
function programURL(i) {
  const p = new URLSearchParams({ program: codeOf(i) });
  return location.origin + location.pathname + '?' + p.toString();
}
async function copyProgramLink(i, btn) {
  const url = programURL(i);
  try {
    await navigator.clipboard.writeText(url);
    if (btn) {
      const label = btn.textContent;
      btn.textContent = '✓ 전형 링크 복사됨';
      setTimeout(() => { if (btn.isConnected) btn.textContent = label; }, 1600);
    }
  } catch (e) { prompt('이 전형의 주소를 복사하세요.', url); }
}
function comparisonBasisNotice(items) {
  const bases = new Set(items.filter(r => r.g[0] != null).map(r => flat(r.std26) || '기준 미상'));
  const differs = bases.size > 1;
  return `${differs ? '입결 기준이 서로 다릅니다. ' : ''}평균·70% 컷 등 각 전형의 기준을 확인하세요. 대학별 반영과목과 환산식이 달라 숫자만으로 직접 비교할 수 없습니다.`;
}
function comparisonRequirements(rowM) {
  const value = s => esc(flat(s)) || '자료 없음 · 모집요강 확인';
  return rowM('지원자격', r => value(r.jagyeok) + (r.nsuNo ? '<br><b>졸업예정자만 지원 가능</b>' : ''))
    + rowM('전형방법', r => value(r.method))
    + rowM('반영과목', r => value(r.subjects))
    + rowM('학년별 반영 / 진로선택', r => value(r.gradeRatio) + '<br>' + value(r.careerSubj))
    + rowM('필요서류', r => value(DOCS_LABEL(r.docs)))
    + rowM('복수지원', r => value(r.dupApply))
    + rowM('원서접수', r => {
      const ap = applyInfo(r.uni);
      return ap ? `${esc(ap.txt)}<br>${esc(ap.via)}${ap.unstated ? '<br>시각 미공표 · 입학처 확인' : ''}` : '일정 자료 없음 · 입학처 확인';
    })
    + rowM('대학별고사', r => r.date ? `${esc(r.date)}${r.examKind ? '<br>' + esc(r.examKind) : ''}` : '일정 자료 없음 · 모집요강 확인');
}
function openModal(i, options = null) {
  const r = ROWS[i];
  if (!r) return;
  const wasOpen = !$('#modal').classList.contains('hidden');
  if (options !== null || !wasOpen) _modalReturn = options && typeof options.onClose === 'function' ? options : null;
  const priorScroll = wasOpen ? $('#modalCard').scrollTop : 0;
  const focusKey = wasOpen ? dialogFocusKey($('#modalCard')) : null;
  const d = deltaInfo(r), v = V(r);
  track('view_program', { uni: r.uni, dept: r.dept, verdict: v.label });
  // vals are chronological [2024,2025,2026]; sparkline expects newest-first → reverse
  const trendRow = (lab, vals, f, color) => `<tr><td class="metric">${lab}</td>${vals.map(x => `<td>${x == null ? '–' : f(x)}</td>`).join('')}<td>${sparkline([vals[2], vals[1], vals[0]], { color, invert: color === 'var(--primary)' })}</td></tr>`;
  const reasons = v.sig.length ? v.sig.map(s => {
    const ico = s.dir === 'good' ? '🟢' : s.dir === 'bad' ? '🔴' : '🟠';
    return `<div class="imp-line"><span class="imp-ico">${ico}</span><span><b>[${esc(s.m)}]</b> ${esc(s.t)}</span></div>`;
  }).join('') : '<div class="muted">2026·2025 추이/구조 변화에서 두드러진 신호가 없습니다.</div>';
  // 2026 vs 2025 per-metric comparison
  const yoyCmp = (lab, info, fmtf, goodWhen) => {
    if (!info) return `<tr><td class="metric">${lab}</td><td>–</td><td>–</td><td colspan="2"><span class="muted">데이터 없음</span></td></tr>`;
    const good = goodWhen(info.dir);
    const cls = info.dir === 'flat' ? 'neu' : good ? 'good' : 'bad';
    const word = info.dir === 'flat' ? '변화 미미' : good ? '유리' : '불리';
    // 입결은 난이도 기준 화살표(상승=▲), 그 외는 값 기준
    const ar = lab.includes('입결')
      ? (info.dir === 'harder' ? '▲' : info.dir === 'easier' ? '▼' : '–')
      : (info.y26 > info.y25 ? '▲' : info.y26 < info.y25 ? '▼' : '–');
    const dec = lab.includes('입결') ? 2 : lab.includes('추합') ? (lab.includes('배') ? 2 : 0) : 1;
    return `<tr><td class="metric">${lab}</td><td>${fmtf(info.y25)}</td><td><b>${fmtf(info.y26)}</b></td><td class="ycell ${cls}">${ar} ${Math.abs(info.d).toFixed(dec)}</td><td><span class="impact-chip ${cls}">${word}</span></td></tr>`;
  };
  const cats = r.cats.map(k => CAT_BY[k] ? `<span class="tag" style="background:${CAT_BY[k].color}22;border-left:3px solid ${CAT_BY[k].color}">${esc(CAT_BY[k].label)}</span>` : '').join(' ');
  const inCmp = S.compare.has(i);
  const bk = favBucket(i);
  $('#modalCard').innerHTML = `
    <div class="modal-head"><div class="mh-top"><div>
      <div class="mh-uni">${esc(r.uni)}${campusOf(r) ? ' · ' + esc(campusOf(r)) + ' 캠퍼스' : ''} · ${esc(r.region)} ${esc(r.sigun)}</div>
      <h3>${esc(deptDisp(r))}${isIntegrated(r.dept) ? ' <span class="qual-tag" title="개별 학과가 아닌 통합·계열 단위 모집입니다">통합모집</span>' : ''}</h3>
      <div class="modal-admission">${esc(flat(r.jhname))} · ${esc(r.jhtype)}</div>
      <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">${cats}</div>
    </div><button class="modal-close" id="modalClose">✕</button></div></div>
    <div class="modal-body">
      <div class="program-tools">${_modalReturn ? `<button class="ghost-btn" id="modalReturn">← ${esc(_modalReturn.returnLabel || '이전 목록으로 돌아가기')}</button>` : ''}<button class="ghost-btn" id="modalLink">🔗 이 전형 링크 복사</button></div>
      <div class="msec official-source"><h4>지원 전 공식 자료 확인</h4>${typeof window.officialLinksHTML === 'function' ? window.officialLinksHTML(r) : '<p class="muted">대학 입학처에서 2027학년도 수시 모집요강과 접수 공지를 확인하세요.</p>'}</div>
      <div class="msec"><div class="kv">
        <dt>전형</dt><dd>${esc(r.jhtype)} · ${esc(r.jhname)}</dd>
        <dt>모집인원</dt><dd><b>${fmtInt(r.enroll)}명</b> <span class="delta ${d.cls}">${d.txt}</span> <span class="muted">(2026 대비: ${r.dkind === 'changed' ? '전형 변경(개편·개명)' : esc(r.prev || '-')})</span></dd>
        <dt>지원자격</dt><dd>${r.jagyeok ? esc(r.jagyeok) : '<span class="muted">전형명 참조 · 세부 자격은 대학 요강에서 확인하세요</span>'}${r.nsuNo ? ' <span class="delta tighten" title="졸업예정자(현 고3)만 지원 가능 — 재수생 이상 지원 불가">N수불가</span>' : ''}</dd>
        <dt>전형방법</dt><dd>${esc(r.method) || '–'}</dd>
        ${r.dupApply ? `<dt>복수지원</dt><dd>${/불가/.test(r.dupApply)
            ? `<b class="dup-no">${esc(r.dupApply)}</b>` : esc(r.dupApply)}</dd>` : ''}
        ${r.docs ? `<dt>필요서류</dt><dd>${esc(DOCS_LABEL(r.docs))}</dd>` : ''}
        <dt>수능최저</dt><dd>${r.hasChoejeo ? esc(r.choejeo) : '없음'} ${r.chKindShow ? `<span class="delta ${(r.chKindShow === '강화' || r.chKindShow === '신설') ? 'tighten' : (r.chKindShow === '변경') ? 'neu' : 'ease'}">최저 ${r.chKindShow}</span>` : ''}</dd>
        ${r.gradeRatio ? `<dt>학년별반영</dt><dd>${esc(r.gradeRatio)}</dd>` : ''}
        ${recordScope(r)}
        ${r.subjects ? `<dt>반영과목</dt><dd>${esc(r.subjects)}</dd>` : ''}
        ${r.careerSubj ? `<dt>진로선택</dt><dd>${esc(r.careerSubj)}</dd>` : ''}
        ${(() => { const ap = applyInfo(r.uni); if (!ap) return ''; const un = ap.unstated ? ` <span class="warn-tag" title="이 대학은 요강에 접수 ${ap.toUnstated ? '마감' : '시작'} 시각을 적지 않았습니다. 표시된 시각은 접수처 시스템 값이라 실제와 다를 수 있으니 반드시 입학처 공지를 확인하세요.">시각 미공표</span>` : ''; return `<dt>원서접수</dt><dd><b>${ap.txt}</b>${ap.early ? ' <span class="delta tighten" title="공통 마감(9/11)보다 일찍 닫습니다">조기마감</span>' : ''}${un} <span class="muted">· ${esc(ap.via)}</span></dd>`; })()}
        ${r.date ? `<dt>대학별고사</dt><dd>${esc(r.date)}${r.examKind && r.examKind !== '논술' ? ` ${r.examKind}` : ''}</dd>` : ''}
      </div></div>
      <div class="msec hero-sec"><h4>🎯 올해 입시 유불리 예상 <span class="muted">입결 2026 vs 2025 · 경쟁률 2027 vs 2026 + 2028 변화 종합 · AI 분석</span></h4>
        <div class="verdict-head"><span class="verdict-big ${v.cls}">${v.label}</span>
          <span class="muted">${v.cls === 'good' ? '합격선이 낮아질 신호가 우세합니다.' : v.cls === 'bad' ? '합격선이 높아질 신호가 우세합니다.' : v.cls === 'new' ? '신설로 입결이 미형성되어 변동성이 큽니다.' : '뚜렷한 방향성이 약합니다.'}</span></div>
        <div class="detail-table-scroll" role="region" aria-label="전년 대비 지표 비교표" tabindex="0"><table class="trend-table yoy-table"><thead><tr><th>지표</th><th>2025</th><th>2026</th><th>전년비</th><th>해석</th></tr></thead><tbody>
          ${yoyCmp(`입결(등급) ${stdTag(r)}`, v.g, x => x.toFixed(2), dir => dir === 'easier')}
          ${yoyCmp('경쟁률', v.c, x => x.toFixed(1) + ':1', dir => dir === 'down')}
          ${yoyCmp(`추합(충원, ${chungUnit(r)})`, v.ch, x => fmtChung(r, x), dir => dir === 'up')}
        </tbody></table></div>
        <div class="impact-box" style="margin-top:12px">${reasons}</div>
        <div class="verdict-note" style="margin-top:8px">※ 입결 하락세·경쟁률 하락·증원·수능최저 강화는 ‘유리’ 신호로, 그 반대는 ‘불리’ 신호로 추정합니다.${r.jhtype === '논술' ? ' <b>단, 논술은 경쟁률 변화를 점수에 넣지 않습니다</b> — 2026 실측에서 논술만 경쟁률과 합격선이 사실상 무관했습니다.' : ''}</div>
        <div class="verdict-note" style="margin-top:4px">※ 다만 실제 입시에서는 입결이 내려간 학과로 오히려 지원이 몰려 경쟁이 폭발하는 경우도 있으니 주의하세요.</div>
      </div>
      ${r.change ? `<div class="msec"><h4>📝 2026 대비 변경사항(2027)</h4><div class="change-box">${esc(r.change)}</div></div>` : ''}
      <div class="msec"><h4>📈 3개년 입결·경쟁률 추이</h4>
        <div class="detail-table-scroll" role="region" aria-label="3개년 입결과 경쟁률 추이표" tabindex="0"><table class="trend-table"><thead><tr><th>구분</th><th>2024</th><th>2025</th><th>2026</th><th>추이</th></tr></thead><tbody>
          ${trendRow(`입결(등급) ${stdTag(r)}${basisWarn(r)}`, [r.g[2], r.g[1], r.g[0]], v => v.toFixed(2), 'var(--primary)')}
          ${trendRow(`입결(대학 환산점수)${scaleWarn(r)}`, [r.v[2], r.v[1], r.v[0]], v => v.toFixed(1), 'var(--good)')}
          ${trendRow('경쟁률', [r.c[2], r.c[1], r.c[0]], v => v.toFixed(2) + ':1', 'var(--new)')}
          ${trendRow(`충원(추합, ${chungUnit(r)})${r.chungDoubt ? ' <span class="warn-tag" title="충원합격자가 \'지원자 − 모집인원\'을 넘습니다. 원천 값을 그대로 보여주되 유불리 판정에서는 제외했습니다.">⚠ 확인필요</span>' : ''}`, [numOr(r.chung[2]), numOr(r.chung[1]), numOr(r.chung[0])], v => fmtChung(r, v), 'var(--neutral)')}
        </tbody></table></div>
        ${r.c27 ? `<div class="c27-box">📣 <b>2027 최종 경쟁률 ${r.c27[0].toFixed(2)}:1</b> <span class="muted">(지원 ${fmtInt(r.c27[1])}명 / 모집 ${fmtInt(r.enroll)}명)</span><div class="muted">원서접수 마감 직후 집계라 수시 6회 위반자 정리 후 대학 공식 발표와 조금 다를 수 있습니다.</div></div>` : ''}
        <div class="muted" style="margin-top:6px">※ 입결 등급은 숫자가 <b>낮을수록</b> 성적이 높습니다. 환산점수는 대학마다 계산식이 달라 <b>다른 학교와 견주면 안 됩니다</b>.</div>
      </div>
      ${(() => {
        if (!r.raw) return '';
        const LBL = { enroll: '모집인원', c26: '경쟁률 2026', c25: '경쟁률 2025', c24: '경쟁률 2024',
                      g26: '입결 2026', g25: '입결 2025', g24: '입결 2024',
                      v26: '환산 2026', v25: '환산 2025', v24: '환산 2024' };
        const items = Object.entries(r.raw).map(([k, v]) =>
          `<div class="raw-line"><b>${esc(LBL[k] || k)}</b><span>${esc(v)}</span></div>`).join('');
        // 왜 이 섹션이 있나 — 원천이 한 칸에 여러 값을 적어(계열·성별 분리, 구간 분포) 단일 값으로
        // 환원할 수 없는 경우다. 임의로 하나를 고르거나 평균 내면 틀린 숫자가 되므로 비워 두고,
        // 대신 원문을 그대로 보여준다.
        return `<div class="msec"><h4>📄 원문 표기 <span class="muted">단일 값으로 환산이 안 되는 항목</span></h4>
          <div class="raw-box">${items}</div></div>`;
      })()}
      ${r.note ? `<div class="msec"><h4>💡 지원 시 유의사항</h4><div class="change-box" style="background:var(--surface-2);color:var(--text-soft);border-color:var(--line)">${expandNote(r)}</div></div>` : ''}
      <div class="msec"><h4>🗂️ 지원카드에 담기 <span class="muted">지원희망 또는 상향을 선택</span></h4>
        <div class="modal-actions">
          <button class="ghost-btn fav-pick ${bk === 'hope' ? 'on' : ''}" id="modalFavHope">${bk === 'hope' ? '✓ 지원희망에 담김' : '🎯 지원희망으로'} <span class="muted">${S.fav.hope.length}/${FAV_HOPE_MAX}</span></button>
          <button class="ghost-btn fav-pick reach ${bk === 'reach' ? 'on' : ''}" id="modalFavReach">${bk === 'reach' ? '✓ 상향에 담김' : '🚀 상향·도전으로'} <span class="muted">${S.fav.reach.length}/3</span></button>
        </div>
        <button class="ghost-btn" id="modalAdd" style="width:100%;justify-content:center;margin-top:8px">${inCmp ? '✓ 비교함에서 보기' : '⇄ 비교함에 담기'}</button>
      </div>
    </div>`;
  $('#modal').classList.remove('hidden');
  $('#modalCard').scrollTop = priorScroll;
  $('#modalClose').setAttribute('aria-label', '상세 닫기');
  if (!wasOpen) openDialog($('#modalCard'), `${r.uni} ${r.dept} 상세 정보`);
  $('#modalClose').onclick = closeModal;
  if ($('#modalReturn')) $('#modalReturn').onclick = closeModal;
  $('#modalLink').onclick = () => copyProgramLink(i, $('#modalLink'));
  $('#modalAdd').onclick = () => { if (S.compare.has(i)) { closeModal(false); openCompare(); } else { toggleCompare(i); openModal(i); } };
  $('#modalFavHope').onclick = () => { addFav(i, 'hope'); openModal(i); };
  $('#modalFavReach').onclick = () => { addFav(i, 'reach'); openModal(i); };
  restoreDialogFocus($('#modalCard'), focusKey, '#modalClose');
}
function closeModal(resume = true) {
  if ($('#modal').classList.contains('hidden')) return;
  const previous = _modalReturn;
  _modalReturn = null;
  $('#modal').classList.add('hidden');
  const params = new URLSearchParams(location.search);
  if (params.has('program')) {
    params.delete('program');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params.toString() : '') + (location.hash || ''));
  }
  closeDialog();
  // The shared Escape handler closes other panels in the same event before restoring the source.
  if (resume !== false && previous) setTimeout(previous.onClose, 0);
}
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

/* ----- compare ----- */
function toggleCompare(i) {
  if (S.compare.has(i)) S.compare.delete(i);
  else { if (S.compare.size >= 6) { toast('비교함은 최대 6개까지 담을 수 있습니다.'); return; } S.compare.add(i); }
  saveCmp();
  updateCompareBtn(); renderTable();
}
function updateCompareBtn() { $('#compareCount').textContent = S.compare.size; }
function openCompare() {
  const focusKey = dialogFocusKey($('#compareInner'));
  const items = [...S.compare].map(i => ROWS[i]);
  const inner = $('#compareInner');
  if (!items.length) {
    inner.innerHTML = `<div class="drawer-head"><h3>비교함</h3><button class="modal-close" id="cmpClose">✕</button></div><div class="empty-state"><div class="es-ico">📊</div>비교할 전형을 목록의 ⇄ 버튼이나 상세에서 담아보세요.<br>최대 6개 전형의 지원 조건을 나란히 볼 수 있습니다.</div>`;
  } else {
    const rowM = (lab, fn) => `<tr><td class="rowlab">${lab}</td>${items.map(r => `<td>${fn(r)}</td>`).join('')}</tr>`;
    inner.innerHTML = `<div class="drawer-head"><h3>전형 비교 <span class="muted">${items.length}개</span></h3>
      <div style="display:flex;gap:8px"><button class="ghost-btn" id="cmpShare">🔗 링크 복사</button><button class="ghost-btn" id="cmpPrint">🖨️ PDF 저장</button><button class="ghost-btn" id="cmpClear">전체 비우기</button><button class="modal-close" id="cmpClose">✕</button></div></div>
      <p class="comparison-note">${comparisonBasisNotice(items)}</p>
      <div class="compare-table-scroll" role="region" aria-label="선택 전형의 지원 조건 비교표" tabindex="0" style="overflow-x:auto;padding:0 4px 30px"><table class="cmp-table"><thead><tr><th>구분</th>${items.map(r =>
        `<th>${esc(r.uni)}${campusOf(r) ? `<div class="muted">${esc(campusOf(r))} 캠퍼스</div>` : ''}<div class="cmp-dept">${esc(flat(deptDisp(r)))}</div><div class="cmp-admission">${esc(flat(r.jhname))}</div><div class="cmp-card-actions"><button class="ghost-btn" data-cmp-open="${r._i}" aria-label="${esc(r.uni)} ${esc(flat(deptDisp(r)))} ${esc(flat(r.jhname))} 상세 보기">상세 보기</button><button class="cmp-rm" data-rm="${r._i}" aria-label="${esc(r.uni)} ${esc(flat(deptDisp(r)))} ${esc(flat(r.jhname))} 비교함에서 제거">✕ 제거</button></div></th>`).join('')}</tr></thead><tbody>
        ${rowM('🎯 올해 유불리', r => `<span class="impact-chip ${V(r).cls}">${V(r).label}</span>`)}
        ${rowM('계열/지역', r => esc(r.gye) + ' · ' + esc(r.region))}
        ${rowM('전형', r => esc(r.jhtype) + '<br><span class="muted">' + esc(r.jhname) + '</span>')}
        ${comparisonRequirements(rowM)}
        ${rowM('모집인원(전년대비)', r => `<b>${fmtInt(r.enroll)}</b> <span class="delta ${deltaInfo(r).cls}">${deltaInfo(r).txt}</span>`)}
        ${rowM('수능최저', r => r.hasChoejeo ? esc(r.choejeo) + (r.chKindShow ? ` <span class="delta ${(r.chKindShow === '강화' || r.chKindShow === '신설') ? 'up' : 'down'}">${r.chKindShow}</span>` : '') : '<span class="muted">없음</span>')}
        ${rowM('입결 2025→2026', r => { const g = yoyGrade(r); return `${fmt(r.g[1])} → <b>${fmt(r.g[0])}</b>` + stdTag(r) + (g && g.dir !== 'flat' ? ` <span class="ycell ${g.dir === 'easier' ? 'good' : 'bad'}">${g.dir === 'easier' ? '유리' : '불리'}</span>` : ''); })}
        ${rowM('입결 기준 · 2026', r => esc(r.std26 || '기준 자료 없음') + basisWarn(r))}
        ${rowM('입결 추이', r => sparkline(r.g, { invert: true, color: 'var(--primary)', w: 70 }))}
        ${rowM('경쟁률 2025→2026', r => { const c = yoyComp(r); return (r.c[1] == null ? '–' : r.c[1].toFixed(1)) + ' → <b>' + (r.c[0] == null ? '–' : r.c[0].toFixed(1)) + ':1</b>' + (c && c.dir !== 'flat' ? ` <span class="ycell ${c.dir === 'down' ? 'good' : 'bad'}">${c.dir === 'down' ? '유리' : '불리'}</span>` : ''); })}
        ${rowM('경쟁률 추이', r => sparkline(r.c, { color: 'var(--new)', w: 70 }))}
        ${rowM('2027 최종 경쟁률', r => r.c27 ? `<b>${r.c27[0].toFixed(1)}:1</b>` : '<span class="muted">–</span>')}
        ${rowM('충원 2025→2026', r => esc(r.chung[1] || '–') + ' → ' + esc(r.chung[0] || '–'))}
        ${rowM('공식 자료 확인', r => typeof window.officialLinksHTML === 'function' ? window.officialLinksHTML(r) : '대학 입학처에서 모집요강 확인')}
      </tbody></table></div>`;
  }
  const wasOpen = !$('#compareDrawer').classList.contains('hidden');
  $('#compareDrawer').classList.remove('hidden');
  if (!wasOpen) openDialog($('#compareInner'), '전형 비교함');
  $('#cmpClose').setAttribute('aria-label', '비교함 닫기');
  $('#cmpClose').onclick = closeCompareDrawer;
  const cp = $('#cmpPrint'); if (cp) cp.onclick = printCompare;
  const cs = $('#cmpShare'); if (cs) cs.onclick = () => copyShare('cmp', cs);
  const clr = $('#cmpClear'); if (clr) clr.onclick = () => { S.compare.clear(); saveCmp(); updateCompareBtn(); renderTable(); openCompare(); };
  inner.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { S.compare.delete(+b.dataset.rm); saveCmp(); updateCompareBtn(); renderTable(); openCompare(); });
  inner.querySelectorAll('[data-cmp-open]').forEach(b => b.onclick = () => {
    const i = +b.dataset.cmpOpen, scroll = $('#compareDrawer').scrollTop, innerScroll = inner.scrollTop;
    const horizontal = inner.querySelector('.compare-table-scroll').scrollLeft;
    closeCompareDrawer();
    openModal(i, { returnLabel: '비교함으로 돌아가기', onClose: () => {
      openCompare();
      $('#compareDrawer').scrollTop = scroll; inner.scrollTop = innerScroll;
      const tableScroll = inner.querySelector('.compare-table-scroll');
      if (tableScroll) tableScroll.scrollLeft = horizontal;
      setTimeout(() => inner.querySelector(`[data-cmp-open="${i}"]`)?.focus({ preventScroll: true }), 40);
    } });
  });
  restoreDialogFocus(inner, focusKey, '[data-cmp-open], #cmpClose');
}
function closeCompareDrawer() { if ($('#compareDrawer').classList.contains('hidden')) return; $('#compareDrawer').classList.add('hidden'); closeDialog(); }
$('#compareDrawer').onclick = e => { if (e.target.id === 'compareDrawer') closeCompareDrawer(); };
$('#compareBtn').onclick = openCompare;

/* ----- favorites (지원카드: 지원희망 6 + 상향·도전 3, 버킷 선택) ----- */
const BUCKET_MAX = { hope: FAV_HOPE_MAX, reach: FAV_REACH_MAX };
const BUCKET_NAME = { hope: '지원희망', reach: '상향·도전' };
function favBucket(i) { return S.fav.hope.includes(i) ? 'hope' : S.fav.reach.includes(i) ? 'reach' : null; }
function isFav(i) { return !!favBucket(i); }
function favCount() { return S.fav.hope.length + S.fav.reach.length; }
function saveFav() {
  // 인덱스가 아니라 안정 키로 — 데이터 갱신 시 카드가 다른 학과를 가리키지 않게(위 hydrateSaved 참조)
  save('fav', { hope: S.fav.hope.map(toKey).filter(Boolean), reach: S.fav.reach.map(toKey).filter(Boolean) });
  applySchedule(); updateFavBtn();
}
function saveFavNote() { save('favnote', S.favNote); }
function updateFavBtn() { $('#favCount').textContent = favCount(); }
function addFav(i, bucket) {
  const cur = favBucket(i);
  if (cur === bucket) { removeFav(i); return; }                 // 같은 버킷 다시 누르면 토글 해제
  if (S.fav[bucket].length >= BUCKET_MAX[bucket]) { toast(`${BUCKET_NAME[bucket]}은(는) 최대 ${BUCKET_MAX[bucket]}장까지 담을 수 있습니다.`); return; }
  if (cur) S.fav[cur].splice(S.fav[cur].indexOf(i), 1);         // 다른 버킷이면 이동
  S.fav[bucket].push(i);
  track('add_favorite', { uni: ROWS[i].uni, dept: ROWS[i].dept, bucket });
  saveFav(); renderTable(); if (!$('#favDrawer').classList.contains('hidden')) openFav();
}
function removeFav(i) {
  const b = favBucket(i); if (!b) return;
  S.fav[b].splice(S.fav[b].indexOf(i), 1);
  saveFav(); renderTable(); if (!$('#favDrawer').classList.contains('hidden')) openFav();
}
function switchBucket(i) {
  const cur = favBucket(i); if (!cur) return;
  const other = cur === 'hope' ? 'reach' : 'hope';
  if (S.fav[other].length >= BUCKET_MAX[other]) { toast(`${BUCKET_NAME[other]}은(는) 최대 ${BUCKET_MAX[other]}장입니다.`); return; }
  S.fav[cur].splice(S.fav[cur].indexOf(i), 1); S.fav[other].push(i);
  saveFav(); renderTable(); openFav();
}
function moveFav(bucket, pos, dir) {
  const arr = S.fav[bucket], j = pos + dir; if (j < 0 || j >= arr.length) return;
  [arr[pos], arr[j]] = [arr[j], arr[pos]]; saveFav(); openFav(); renderTable();
}
/* add-time bucket chooser popover */
function closeFavMenu() { const m = document.querySelector('.fav-menu'); if (m) m.remove(); }
function openFavMenu(i, anchor) {
  closeFavMenu();
  const cur = favBucket(i);
  const m = el('div', 'fav-menu');
  m.innerHTML = `<div class="fm-title">지원카드에 담기</div>
    <button data-b="hope" class="${cur === 'hope' ? 'on' : ''}"><span>🎯 지원희망</span><span class="fm-n">${S.fav.hope.length}/${FAV_HOPE_MAX}</span></button>
    <button data-b="reach" class="${cur === 'reach' ? 'on reach' : 'reach'}"><span>🚀 상향·도전</span><span class="fm-n">${S.fav.reach.length}/3</span></button>
    ${cur ? `<button data-b="remove" class="fm-rm">✕ 지원카드에서 빼기</button>` : ''}`;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  let left = r.right - 184; if (left < 8) left = 8;
  m.style.left = left + 'px';
  m.style.top = (r.bottom + 6 + m.offsetHeight > window.innerHeight ? r.top - 6 - m.offsetHeight : r.bottom + 6) + 'px';
  m.querySelectorAll('button').forEach(b => b.onclick = ev => { ev.stopPropagation(); const bk = b.dataset.b; if (bk === 'remove') removeFav(i); else addFav(i, bk); closeFavMenu(); });
  setTimeout(() => document.addEventListener('click', function h() { closeFavMenu(); document.removeEventListener('click', h); }), 0);
}
function favSlotCard(i, bucket, pos, lastIdx) {
  const cand = bucket === 'hope' && pos >= SUSI_LIMIT;      // 7~10번은 법정 6장 밖의 후보 칸
  const label = bucket === 'hope' ? (pos + 1) : '상' + (pos + 1);
  const badge = `<span class="rank-badge ${bucket}${cand ? ' cand' : ''}"${cand ? ' title="후보 칸 — 수시 원서는 최대 6장"' : ''}>${label}</span>`;
  if (i == null) return `<div class="fav-slot empty">${badge}<span class="fav-empty-t">비어 있음 — ${bucket === 'hope' ? (cand ? '후보로 담기 (수시 원서는 최대 6장)' : '표의 ☆에서 지원희망으로 담기') : '상향으로 담기'}</span></div>`;
  const r = ROWS[i], v = V(r), d = deltaInfo(r);
  return `<div class="fav-slot" data-open="${i}">${badge}
    <div class="fav-body">
      <div class="fav-uni">${esc(r.uni)} <span class="muted">${esc(r.region)}${campusOf(r) ? ' · ' + esc(campusOf(r)) + ' 캠퍼스' : ''}</span>${(() => { const ap = applyInfo(r.uni); return ap ? ` <span class="fav-apply${ap.early ? ' early' : ''}" title="원서접수 ${ap.txt} · ${esc(ap.via)}">${ap.short}</span>` : ''; })()}</div>
      <button class="fav-dept fav-detail-btn" data-fav-open="${i}" aria-label="${esc(r.uni)} ${esc(flat(deptDisp(r)))} ${esc(flat(r.jhname))} 상세 보기">${esc(deptDisp(r))} <span aria-hidden="true">↗</span></button>
      <div class="fav-admission">${esc(flat(r.jhname))}</div>
      <div class="fav-meta"><span class="jh-pill">${esc(r.jhtype.replace('학생부', ''))}</span> 모집 ${fmtInt(r.enroll)} <span class="delta ${d.cls}">${d.txt}</span>
        · 입결 <b>${fmt(r.g[0])}</b>${stdTag(r)} · 경쟁 ${r.c[0] == null ? '–' : r.c[0].toFixed(1)}:1 <span class="impact-chip ${v.cls}">${v.label}</span></div>
      ${yoyHTML(r)}
    </div>
    <div class="fav-ctrl"><button data-up="${bucket}:${pos}" ${pos === 0 ? 'disabled' : ''} aria-label="${esc(flat(r.jhname))} 우선순위 위로" title="위로">▲</button><button data-dn="${bucket}:${pos}" ${pos === lastIdx ? 'disabled' : ''} aria-label="${esc(flat(r.jhname))} 우선순위 아래로" title="아래로">▼</button>
      <button class="fav-sw" data-sw="${i}" aria-label="${esc(flat(r.jhname))} ${bucket === 'hope' ? '상향으로 이동' : '지원희망으로 이동'}" title="${bucket === 'hope' ? '상향으로 이동' : '지원희망으로 이동'}">⇄</button><button class="fav-rm" data-rm="${i}" aria-label="${esc(r.uni)} ${esc(flat(deptDisp(r)))} ${esc(flat(r.jhname))} 지원카드에서 제거" title="빼기">✕</button></div>
  </div>`;
}
/* 지원카드 고사일 대조 — 같은 날 대학별고사가 있는 카드 조합을 '주의' 톤으로 알린다.
   수시 6장을 고를 때 고사일까지 대조하는 학생은 드물고, 겹치면 한 장은 원서비만 버린다.
   같은 날이어도 시간대가 다르면 응시 가능할 수 있으므로 경고가 아니라 확인 안내다.
   기간형(11.25~27)은 같은 달·7일 이내만 일 단위로 펴서 본다 — 그 이상은 판정이 모호하다. */
function favDateNotices() {
  const entries = [];
  [...(S.fav.hope || []), ...(S.fav.reach || [])].forEach(i => {
    const r = ROWS[i];
    if (!r || !r.date) return;
    const days = new Map();                       // 'm/d' -> viaRange
    for (const m of r.date.matchAll(/(\d{1,2})\.\s*(\d{1,2})/g))
      if (!days.has(`${+m[1]}/${+m[2]}`)) days.set(`${+m[1]}/${+m[2]}`, false);
    for (const m of r.date.matchAll(/(\d{1,2})\.\s*(\d{1,2})[^~\d]*~\s*(?:(\d{1,2})\.)?\s*(\d{1,2})/g)) {
      const mo1 = +m[1], d1 = +m[2], mo2 = m[3] ? +m[3] : mo1, d2 = +m[4];
      if (mo1 === mo2 && d2 > d1 && d2 - d1 <= 7)
        for (let dd = d1 + 1; dd <= d2; dd++) if (!days.has(`${mo1}/${dd}`)) days.set(`${mo1}/${dd}`, true);
    }
    days.forEach((viaRange, day) => entries.push({ day, r, viaRange }));
  });
  const byDay = {};
  entries.forEach(e => (byDay[e.day] = byDay[e.day] || []).push(e));
  return Object.entries(byDay)
    .filter(([, es]) => new Set(es.map(e => e.r._i)).size >= 2)
    .map(([day, es]) => {
      const [mo, dd] = day.split('/').map(Number);
      return { mo, dd, dow: _DOW_KO[new Date(2026, mo - 1, dd).getDay()],
               items: [...new Map(es.map(e => [e.r._i, e])).values()] };
    })
    .sort((a, b) => (a.mo - b.mo) || (a.dd - b.dd));
}
/* 같은 날 항목 표기 — 같은 대학이 둘 이상이면 학과명을 붙여 구분한다. */
function fcName(e, items) {
  const dup = items.filter(x => x.r.uni === e.r.uni).length > 1;
  return `${esc(e.r.uni.replace('학교', ''))}${campusOf(e.r) ? `(${esc(campusOf(e.r))})` : ''}${dup ? ` ${esc(flat(deptDisp(e.r)))} · ${esc(flat(e.r.jhname))}` : ''} ${esc(e.r.examKind || '고사')}`;
}

function openFav() {
  const inner = $('#favInner'), focusKey = dialogFocusKey($('#favInner'));
  const mk = (bucket, n) => { const arr = S.fav[bucket], out = []; for (let k = 0; k < n; k++) out.push(favSlotCard(arr[k] ?? null, bucket, k, arr.length - 1)); return out.join(''); };
  inner.innerHTML = `<div class="drawer-head"><div><h3>🗂️ 내 지원카드 <span class="muted">${favCount()}/${FAV_HOPE_MAX + FAV_REACH_MAX}</span></h3>
      <div class="muted" style="font-size:11.5px">담을 때 지원희망/상향을 선택하고, ▲▼ 순위변경 · ⇄ 칸 이동 · ✕ 빼기</div></div>
    <div style="display:flex;gap:8px">${favCount() ? '<button class="ghost-btn" id="favShare">🔗 링크 복사</button><button class="ghost-btn" id="favPrint">🖨️ PDF 저장</button><button class="ghost-btn" id="favClear">전체 비우기</button>' : ''}<button class="modal-close" id="favClose">✕</button></div></div>
    <div class="fav-wrap">
      ${(() => { const ns = favDateNotices(); return ns.length ? `<div class="fav-clash">🗓️ <b>고사일 확인</b> — 같은 날에 대학별고사가 있는 카드가 있어요.
        ${ns.map(n => `<div class="fc-line"><b>${n.mo}/${n.dd}(${n.dow})</b> — ${n.items.map(e => `${fcName(e, n.items)}${e.viaRange ? '<span class="fc-rg" title="기간형 일정 — 실제 배정일을 확인하세요">기간</span>' : ''}`).join(' · ')}</div>`).join('')}
        <div class="fc-note">시간대가 다르면 응시할 수 있는 경우도 있어요. 각 대학의 고사 시간을 확인하세요.</div></div>` : ''; })()}
      <div class="fav-group-label hope">🎯 지원희망 (수시 6장 + 후보 4칸) <span class="muted">${S.fav.hope.length}/${FAV_HOPE_MAX}</span></div>
      <div class="fav-hint muted">과기원(KAIST·GIST·DGIST·UNIST·KENTECH)·사관학교·전문대는 수시 6회 제한에 들어가지 않아요.</div>
      ${mk('hope', FAV_HOPE_MAX)}
      <div class="fav-group-label reach">🚀 상향·도전 (3장) <span class="muted">${S.fav.reach.length}/3</span></div>
      ${mk('reach', FAV_REACH_MAX)}
      <div class="fav-group-label note">📝 컨설턴트 의견</div>
      <div class="fav-hint muted">이 브라우저에만 저장되며 PDF에 함께 인쇄됩니다. 공유 링크에는 담기지 않습니다.</div>
      <textarea id="favNote" class="fav-note" rows="4" maxlength="1000"
        placeholder="예) 지원희망 3~4번은 고사일이 겹치니 하나를 상향으로 옮길 것. 최저 충족이 관건."
        aria-label="컨설턴트 의견 입력">${esc(S.favNote)}</textarea>
    </div>`;
  const wasOpen = !$('#favDrawer').classList.contains('hidden');
  $('#favDrawer').classList.remove('hidden');
  if (!wasOpen) openDialog($('#favInner'), '내 지원카드');
  $('#favClose').setAttribute('aria-label', '지원카드 닫기');
  $('#favClose').onclick = closeFavDrawer;
  const fn = $('#favNote');
  if (fn) fn.oninput = () => { S.favNote = fn.value; saveFavNote(); };
  const fp = $('#favPrint'); if (fp) fp.onclick = printFav;
  const fs2 = $('#favShare'); if (fs2) fs2.onclick = () => copyShare('fav', fs2);
  const clr = $('#favClear'); if (clr) clr.onclick = () => { if (confirm('지원카드를 모두 비울까요?')) { S.fav = { hope: [], reach: [] }; saveFav(); renderTable(); openFav(); } };
  inner.querySelectorAll('[data-up]').forEach(b => b.onclick = e => { e.stopPropagation(); const [bk, p] = b.dataset.up.split(':'); moveFav(bk, +p, -1); });
  inner.querySelectorAll('[data-dn]').forEach(b => b.onclick = e => { e.stopPropagation(); const [bk, p] = b.dataset.dn.split(':'); moveFav(bk, +p, 1); });
  inner.querySelectorAll('[data-sw]').forEach(b => b.onclick = e => { e.stopPropagation(); switchBucket(+b.dataset.sw); });
  inner.querySelectorAll('[data-rm]').forEach(b => b.onclick = e => { e.stopPropagation(); removeFav(+b.dataset.rm); });
  const showFavDetail = i => {
    const scroll = $('#favDrawer').scrollTop, innerScroll = inner.scrollTop;
    closeFavDrawer();
    openModal(i, { returnLabel: '지원카드로 돌아가기', onClose: () => {
      openFav(); $('#favDrawer').scrollTop = scroll; inner.scrollTop = innerScroll;
      setTimeout(() => inner.querySelector(`[data-fav-open="${i}"]`)?.focus({ preventScroll: true }), 40);
    } });
  };
  inner.querySelectorAll('[data-fav-open]').forEach(b => b.onclick = e => { e.stopPropagation(); showFavDetail(+b.dataset.favOpen); });
  inner.querySelectorAll('[data-open]').forEach(c => c.onclick = e => { if (e.target.closest('button,a')) return; showFavDetail(+c.dataset.open); });
  restoreDialogFocus(inner, focusKey, '[data-fav-open], #favClose');
}
function closeFavDrawer() { if ($('#favDrawer').classList.contains('hidden')) return; $('#favDrawer').classList.add('hidden'); closeDialog(); }
$('#favDrawer').onclick = e => { if (e.target.id === 'favDrawer') closeFavDrawer(); };
$('#favBtn').onclick = openFav;

/* ============================================================
   맞춤 추천 (BETA) — 입력 내신과 공개 입결의 등급 차이를 비교한다.
   ⚠️ 설계 원칙 세 가지. 이 기능은 학생의 진로 결정에 영향을 주므로 과신을 유도하면 안 된다.
     ① 입결 '기준'이 5종 섞여 있다(cut70 12,000·avg 5,460·cut90·cut50·stage1).
        같은 2.5등급도 기준이 다르면 의미가 다르므로 **결과에 기준을 반드시 표기**한다.
     ② 입결이 있는 행은 69%뿐이다. 나머지는 판정 대상에서 빼고 그 사실을 알린다.
     ③ 합격 '가능성'을 확률로 말하지 않는다. 등급 차이라는 관측값만 보여준다.
   ============================================================ */
/* 지역 칩. 가나다순 앞 8개만 자르면 서울(모집 42,923명 1위)·경기(2위)가 빠지고
   '강원/경기'처럼 깨진 표기가 칩을 차지한다(사용자 지적). 규모·상담 빈도 순으로 고정하고
   '수도권'은 서울+경기+인천을 한 번에 거는 묶음으로 둔다. */
const ADVISOR_REGIONS = [
  ['', '전국'], ['__metro', '수도권(서울·경기·인천)'],
  ['서울', '서울'], ['경기', '경기'], ['인천', '인천'],
  ['부산', '부산'], ['대구', '대구'], ['광주', '광주'], ['대전', '대전'], ['울산', '울산'],
  ['충남', '충남'], ['충북', '충북'], ['전남', '전남'], ['전북', '전북'],
  ['경남', '경남'], ['경북', '경북'], ['강원', '강원'], ['제주', '제주'], ['세종', '세종'],
];
const METRO = new Set(['서울', '경기', '인천']);
/* 밴드 폭(좁게·보통·넓게). 고정 폭만으로는 부족하다 — 입결 밀도가 성적대마다 달라
   (1.0등급대 68개 vs 3.5등급대 570개) 같은 ±0.5도 상위권과 중위권에서 8배 차이가 난다.
   그래서 기준을 화면에 명시하되 사용자가 조절할 수 있게 3단계로 둔다.
   ⚠️ '안정'에 상한이 필요하다. 상한이 없으면 내신 1.2에서 안정이 17,254개나 잡히는데
      85%가 과도한 하향이라 "안정권이 이렇게 많다"는 착시를 준다(시나리오 테스트). */
const ADVISOR_WIDTHS = {
  tight:  { label: '좁게', fit: 0.2, safe: 0.6, reach: 0.6 },
  normal: { label: '보통', fit: 0.3, safe: 0.8, reach: 0.8 },
  wide:   { label: '넓게', fit: 0.5, safe: 1.2, reach: 1.2 },
};
/** 폭 설정으로 밴드 경계를 만든다. diff = 입결 − 내등급 (양수면 내가 우수). */
function advisorBands(w) {
  const W = ADVISOR_WIDTHS[w] || ADVISOR_WIDTHS.normal, f = W.fit;
  return [
    { key: 'safe',  label: '내신상 여유', desc: `입결보다 ${f}~${W.safe}등급 우수`,  min: f,            max: W.safe, cls: 'good' },
    { key: 'fit',   label: '내신상 근접', desc: `입결과 ±${f}등급 이내`,             min: -f,           max: f,      cls: 'neu'  },
    { key: 'reach', label: '내신상 도전', desc: `입결보다 ${f}~${W.reach}등급 부족`, min: -W.reach,     max: -f,     cls: 'bad'  },
  ];
}
/** 내신 등급(myGrade)과 각 행의 입결을 비교해 밴드로 분류한다.
 *  등급은 숫자가 작을수록 우수하므로 diff = 입결 − 내등급 (양수면 내가 더 우수). */
/** 학교유형으로 지원 자체가 막히는 전형을 걸러낸다.
 *  판별 근거는 전형명·지원자격이며, 원천에 근거가 없으면 '막지 않는다'(과다 차단이 더 나쁘다).
 *   · 특성화고 전용(1,094행·3,744명): 일반고 학생은 지원 불가
 *   · 일반고 전용(194행·4,984명): 특성화고 학생은 지원 불가
 *   · N수불가(졸업예정자 한정): 졸업생(N수) 지원 불가 — 기존 r.nsuNo 재사용 */
function schoolTypeBlocked(r, type) {
  if (!type) return false;
  const jn = r.jhname || '', jag = r.jagyeok || '';
  const isVocOnly = /특성화고|특성화 고|동일계|마이스터/.test(jn);
  const isGenOnly = /일반고/.test(jn) || /일반고,\s*특목고/.test(jag);
  if (type === 'voc') return isGenOnly;                    // 특성화고 학생 → 일반고 전용 차단
  if (type === 'gen') return isVocOnly;                    // 일반고 학생 → 특성화고 전용 차단
  if (type === 'grad') return isVocOnly || r.nsuNo;        // 졸업생(N수) → 특성화 전용·N수불가 차단
  if (type === 'ged') return isVocOnly || isGenOnly || r.nsuNo || /검정.*불가|검정고시 지원 불가/.test(jag);
  return false;
}
function advisorPick(opts) {
  const { grade, leastN, leastSum, cat, region, school, width } = opts;
  const BANDS = advisorBands(width);
  const out = { safe: [], fit: [], reach: [] };
  let noGrade = 0, filtered = 0, blocked = 0, notFinal = 0;
  ROWS.forEach(r => {
    if (cat && cat !== 'all' && !r.cats.includes(cat)) return;
    if (region === '__metro') { if (!METRO.has(r.region)) return; }
    else if (region && r.region !== region) return;
    if (schoolTypeBlocked(r, school)) { blocked++; return; }
    // 수능최저: 입력했으면 '충족 가능'한 전형만(요구 합 ≥ 내 합). 최저 없는 전형은 항상 통과.
    if (leastN && r.hasChoejeo) {
      if (!(r.leastN === +leastN && r.leastSum != null && r.leastSum >= leastSum)) return;
    }
    filtered++;
    const g = r.g[0];
    if (g == null) { noGrade++; return; }          // 입결 미공개·신설 → 판정 불가
    // ⚠️ 1단계 합격자 평균은 최종 등록자 지표가 아니다. 1단계 풀은 최종보다 훨씬 넓고
    //    성적이 나빠서, 이 값을 최종 입결처럼 밴드에 넣으면 실제보다 쉬워 보인다(낙관 편향).
    //    내신 3.0 기준 안정 74건·적정 63건이 여기 해당했다. 판정에서 뺀다.
    if (STD_NOT_FINAL.has(r.stdK26)) { notFinal++; return; }
    const diff = g - grade;
    const b = BANDS.find(x => diff >= x.min && diff < x.max);
    if (b) out[b.key].push({ r, diff });
  });
  // 정렬: **입결이 좋은(등급 숫자가 작은) 순**이 먼저다.
  //   유불리 점수 순으로 두면 내신 1.2 학생의 '안정' 상위에 입결 2.3대 학교가 올라오고
  //   정작 입결이 더 좋은 곳은 뒤로 밀린다(사용자 지적). 상담에서는 '내가 갈 수 있는 곳 중
  //   가장 좋은 곳'부터 보는 것이 자연스럽다. 동률이면 유불리 점수로 가른다.
  //   ⚠️ 다만 '적정·도전'까지 같은 잣대로 두면 밴드 경계값만 12개 뜬다 — 실측에서
  //   내신 2.5의 '적정' 12개가 전부 2.20(=내 등급 −0.3)이었고 정작 2.5 근처는 안 보였다.
  //   '적정'은 내 등급에 가까운 순, '도전'도 덜 무리한 순이 상담 맥락에 맞다.
  for (const k of Object.keys(out)) {
    if (k === 'safe') out[k].sort((a, b) => (a.r.g[0] - b.r.g[0]) || (V(b.r).score - V(a.r).score));
    else out[k].sort((a, b) => (Math.abs(a.diff) - Math.abs(b.diff)) || (a.r.g[0] - b.r.g[0]) || (V(b.r).score - V(a.r).score));
  }
  return { out, noGrade, filtered, blocked, notFinal, bands: BANDS };
}
const ADVISOR_PAGE_SIZE = 12;
const advisorView = { gradeInput: null, sumInput: null, query: '', shown: {}, timer: null };
function advisorRefresh(selector) {
  const inner = $('#advisorInner'), scrollTop = inner.scrollTop;
  const active = document.activeElement, start = active?.selectionStart, end = active?.selectionEnd;
  renderAdvisor();
  const target = selector ? inner.querySelector(selector) : null;
  if (target) {
    target.focus({ preventScroll: true });
    if (typeof start === 'number' && target.setSelectionRange && target.type === 'text') target.setSelectionRange(start, end);
  }
  inner.scrollTop = scrollTop;
}
function renderAdvisor() {
  const inner = $('#advisorInner');
  const st = S.advisor;
  if (advisorView.gradeInput == null) advisorView.gradeInput = String(st.grade ?? '');
  if (advisorView.sumInput == null) advisorView.sumInput = String(st.leastSum ?? '');
  const gradeText = advisorView.gradeInput.trim(), grade = Number(gradeText);
  const gradeValid = gradeText !== '' && Number.isFinite(grade) && grade >= 1 && grade <= 9;
  const gradeError = gradeText !== '' && !gradeValid ? '내신 등급은 1.00~9.00 사이의 숫자로 입력해 주세요.' : '';
  const sumText = advisorView.sumInput.trim(), sum = Number(sumText), leastN = Number(st.leastN);
  const sumValid = !st.leastN || (sumText !== '' && Number.isInteger(sum) && sum >= leastN && sum <= leastN * 9);
  const sumError = st.leastN && sumText !== '' && !sumValid ? `${leastN}개 영역 합은 ${leastN}~${leastN * 9} 사이의 정수로 입력해 주세요.` : '';
  const chips = (name, items, cur) => items.map(([v, l]) =>
    `<button type="button" class="chip${String(cur) === String(v) ? ' on' : ''}" aria-pressed="${String(cur) === String(v)}" data-adv="${name}" data-v="${esc(v)}">${esc(l)}</button>`).join('');
  const res = gradeValid && sumValid ? advisorPick({ ...st, grade, leastSum: sum }) : null;
  const terms = advisorView.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = o => terms.every(t => `${o.r.uni} ${deptDisp(o.r)} ${o.r.jhtype} ${o.r.jhname}`.toLocaleLowerCase().includes(t));
  const matchCount = res ? res.bands.reduce((n, b) => n + res.out[b.key].filter(matches).length, 0) : 0;

  const card = (o) => {
    const r = o.r, v = V(r), std = CUT_LABELS[r.stdK26] || r.std26 || '기준 미표기';
    return `<button type="button" class="adv-card" data-adv-open="${r._i}" aria-label="${esc(r.uni)} ${esc(deptDisp(r))} ${esc(r.jhname)} 상세 보기">
      <span class="adv-top"><b>${esc(r.uni)}</b> <span class="muted">${esc(r.region)}</span>
        <span class="impact-chip ${v.cls}">${v.label}</span></span>
      <span class="adv-dept">${esc(deptDisp(r))}</span>
      <span class="adv-meta muted">${esc(r.jhtype)} · ${esc(r.jhname)} · 모집 ${fmtInt(r.enroll)}명</span>
      <span class="adv-grade">입결 <b>${fmt(r.g[0])}</b> <span class="adv-std">${esc(std)}</span>
        <span class="adv-diff ${o.diff >= 0 ? 'good' : 'bad'}">${o.diff >= 0 ? '여유 ' : '부족 '}${Math.abs(o.diff).toFixed(2)}등급</span></span>
      <span class="adv-meta muted">${r.hasChoejeo ? `수능최저 ${esc(r.choejeo)}` : '수능최저 없음'}</span>
      <span class="adv-conditions">지원자격·대학별 내신 반영 미확인${r.hasChoejeo ? '<br>수능 필수영역·탐구 반영 미확인' : ''}</span>
      <span class="adv-card-action">상세 조건 확인 →</span>
    </button>`;
  };

  inner.innerHTML = `<div class="drawer-head">
      <div><h3>🧭 맞춤 추천 <span class="badge beta-badge">BETA</span></h3>
      <div class="muted">입력 내신과 공개 입결의 등급 차이를 비교합니다. 합격 가능성이나 지원자격을 판정하지 않습니다.</div></div>
      <button class="modal-close" id="advClose" aria-label="맞춤 추천 닫기">✕</button></div>
    <div class="adv-body">
      <div class="adv-form">
        <div class="adv-row"><label class="adv-label" for="advGrade">내신 등급</label>
          <input type="text" inputmode="decimal" id="advGrade" placeholder="예: 2.35" autocomplete="off"
                 value="${esc(advisorView.gradeInput)}" class="adv-input" aria-invalid="${!!gradeError}" aria-describedby="advGradeHelp advGradeError"> <span id="advGradeHelp" class="muted">1.00 ~ 9.00</span></div>
        <p id="advGradeError" class="adv-error" role="status">${gradeError}</p>
        <div class="adv-row"><span class="adv-label">구간 폭</span>
          <div class="chip-row">${chips('width', Object.entries(ADVISOR_WIDTHS).map(([k, v]) => [k, `${v.label} (±${v.fit})`]), st.width)}</div>
          <span class="muted">내신상 근접 구간의 폭입니다.</span></div>
        <div class="adv-row"><span class="adv-label">학교 유형</span>
          <div class="chip-row">${chips('school', [['', '선택 안 함'], ['gen', '일반고·자율고'], ['voc', '특성화고·마이스터'], ['grad', '졸업생(N수)'], ['ged', '검정고시']], st.school)}</div></div>
        <div class="adv-row"><span class="adv-label">수능최저</span>
          <div class="chip-row">${chips('leastN', [['', '입력 안 함'], ['2', '2개 합'], ['3', '3개 합'], ['4', '4개 합']], st.leastN)}</div></div>
        ${st.leastN ? `<div class="adv-row"><label class="adv-label" for="advSum">내 등급 합</label>
          <input type="text" inputmode="numeric" id="advSum" placeholder="예: 7" autocomplete="off" value="${esc(advisorView.sumInput)}" class="adv-input" aria-invalid="${!!sumError}" aria-describedby="advSumHelp advSumError">
          <span id="advSumHelp" class="muted">${esc(st.leastN)}개 영역의 합으로 좁힙니다. 필수영역·탐구 반영은 별도로 확인하세요.</span></div>
          <p id="advSumError" class="adv-error" role="status">${sumError}</p>` : ''}
        <div class="adv-row"><span class="adv-label">계열</span>
          <div class="chip-row">${chips('cat', [['all', '전체'], ['medical', '메디컬'], ['engineering', '공학'], ['natural', '자연'], ['business', '상경'], ['nursing_health', '간호·보건'], ['teaching', '사범']], st.cat)}</div></div>
        <div class="adv-row"><span class="adv-label">지역</span>
          <div class="chip-row">${chips('region', ADVISOR_REGIONS, st.region)}</div></div>
      </div>
      ${!res ? `<div class="empty-state"><div class="es-ico">🧭</div>${gradeError || sumError ? '입력값을 수정하면 내신 비교 결과를 보여드립니다.' : gradeValid ? '선택한 수능 영역의 등급 합을 입력해 주세요.' : '내신 등급을 입력하면 공개 입결과의 차이를 구간별로 보여드립니다.'}</div>`
      : `<div class="adv-note">📌 입결 <b>기준이 대학마다 다릅니다</b>(70%컷·평균 등). 카드에 기준을 함께 표기했으니 같은 기준끼리 비교하세요.
           <br>농어촌·지역인재·추천 자격과 서류·면접 평가는 반영하지 않았습니다. 각 카드의 상세 조건을 확인하세요.
           ${res.noGrade ? `입결 미공개·신설 <b>${fmtInt(res.noGrade)}건</b>은 판정에서 제외했습니다.` : ''}
           ${res.blocked ? `학교 유형으로 지원 불가한 <b>${fmtInt(res.blocked)}건</b>을 제외했습니다.` : ''}
           ${res.notFinal ? `입결이 <b>1단계 합격자 평균</b>으로만 공개된 <b>${fmtInt(res.notFinal)}건</b>은 최종 등록자 성적이 아니라 제외했습니다.` : ''}</div>
         <div class="adv-search"><label for="advSearch">추천 결과에서 찾기</label>
           <input type="text" id="advSearch" class="adv-input" value="${esc(advisorView.query)}" placeholder="대학·학과·전형명 검색" autocomplete="off">
           ${advisorView.query ? '<button type="button" class="ghost-btn" id="advSearchClear">검색어 지우기</button>' : ''}
           <span class="muted" role="status" aria-live="polite">${terms.length ? '검색 결과' : '내신 비교 결과'} ${fmtInt(matchCount)}개</span></div>
         <p class="adv-sort muted">내신상 여유는 입결 등급 숫자가 작은 순, 근접·도전은 내 등급과 가까운 순입니다. 같은 기준끼리 비교하세요.</p>
         ${res.bands.map(b => {
        const list = res.out[b.key].filter(matches), limit = advisorView.shown[b.key] || ADVISOR_PAGE_SIZE;
        const displayed = Math.min(limit, list.length);
        return `<div class="adv-band" data-band="${b.key}"><h4><span class="impact-chip ${b.cls}">${b.label}</span>
            <span class="muted">${b.desc} · ${fmtInt(list.length)}개</span></h4>
          ${list.length ? `<div class="adv-grid">${list.slice(0, limit).map(card).join('')}</div>
            <div class="adv-more"><span class="muted">${fmtInt(displayed)}개 표시 / 전체 ${fmtInt(list.length)}개</span>
            ${displayed < list.length ? `<button type="button" class="ghost-btn" data-adv-more="${b.key}">${b.label} ${Math.min(ADVISOR_PAGE_SIZE, list.length - displayed)}개 더 보기</button>` : ''}</div>`
            : `<div class="muted" style="padding:6px 2px">${terms.length ? '검색어와 일치하는 전형이 없습니다. 검색어를 바꾸거나 지워 보세요.' : '해당 구간에 전형이 없습니다. 구간 폭이나 계열·지역을 바꿔 보세요.'}</div>`}</div>`;
      }).join('')}`}
      ${res ? `<div class="adv-fb" id="advFb">
        <span class="fb-q">이 추천이 도움이 됐나요?</span>
        <button class="fb-btn" data-fb="up" aria-label="도움이 됐어요">👍 도움됨</button>
        <button class="fb-btn" data-fb="down" aria-label="아쉬웠어요">👎 아쉬움</button>
      </div>` : ''}
    </div>`;

  const wasOpen = !$('#advisorDrawer').classList.contains('hidden');
  $('#advisorDrawer').classList.remove('hidden');
  if (!wasOpen) { openDialog($('#advisorInner'), '맞춤 추천'); track('advisor_open'); }
  /* 베타 계측 — 교사 피드백을 기다리는 동안 '쓰이는가·어디서 멈추는가'를 데이터로 본다.
     성적을 넣기 전(res=null)과 넣은 뒤를 나눠 보면 이탈 지점이 드러난다. */
  track('advisor_result', {
    has_grade: res ? 1 : 0,
    grade: st.grade ?? '',
    cat: st.cat || 'all', region: st.region || '', school: st.school || '',
    width: st.width || 'normal', least_n: st.leastN || '',
    n_safe: res ? res.out.safe.length : 0,
    n_fit: res ? res.out.fit.length : 0,
    n_reach: res ? res.out.reach.length : 0,
    empty: res && !(res.out.safe.length + res.out.fit.length + res.out.reach.length) ? 1 : 0,
  });
  $('#advClose').onclick = closeAdvisor;
  inner.querySelectorAll('[data-adv]').forEach(b => b.onclick = () => {
    const k = b.dataset.adv, v = b.dataset.v;
    clearTimeout(advisorView.timer);
    S.advisor[k] = v;
    if (k === 'leastN' && !v) { S.advisor.leastSum = null; advisorView.sumInput = ''; }
    advisorView.shown = {};
    track('advisor_filter', { field: k, value: v || '(해제)' });
    save('advisor', S.advisor); advisorRefresh(`[data-adv="${k}"][data-v="${v}"]`);
  });
  inner.querySelectorAll('[data-adv-more]').forEach(b => b.onclick = () => {
    const key = b.dataset.advMore, previous = advisorView.shown[key] || ADVISOR_PAGE_SIZE;
    advisorView.shown[key] = previous + ADVISOR_PAGE_SIZE;
    renderAdvisor();
    const next = inner.querySelectorAll(`[data-band="${key}"] [data-adv-open]`)[previous];
    next?.focus();
  });
  const search = $('#advSearch');
  if (search) search.oninput = () => {
    advisorView.query = search.value; advisorView.shown = {};
    clearTimeout(advisorView.timer);
    advisorView.timer = setTimeout(() => advisorRefresh('#advSearch'), 250);
  };
  const searchClear = $('#advSearchClear');
  if (searchClear) searchClear.onclick = () => {
    clearTimeout(advisorView.timer); advisorView.query = ''; advisorView.shown = {};
    advisorRefresh('#advSearch');
  };
  /* 인앱 피드백. 교사가 따로 연락하지 않아도 그 자리에서 남길 수 있게 한다.
     👎를 누르면 한 줄 이유를 받는다 — '왜 아쉬웠는지'가 개선의 실마리다. */
  inner.querySelectorAll('[data-fb]').forEach(b => b.onclick = () => {
    const v = b.dataset.fb, box = $('#advFb');
    track('advisor_feedback', { vote: v, grade: st.grade ?? '', cat: st.cat || 'all' });
    if (v === 'up') { box.innerHTML = '<span class="fb-q">고맙습니다. 의견이 전달됐어요.</span>'; return; }
    box.innerHTML = `<span class="fb-q">어떤 점이 아쉬웠나요?</span>
      <input id="advFbTxt" class="adv-input fb-input" maxlength="120" placeholder="예: 우리 학교 전형이 안 보여요">
      <button class="fb-btn" id="advFbSend">보내기</button>`;
    $('#advFbTxt').focus();
    $('#advFbSend').onclick = () => {
      const t = ($('#advFbTxt').value || '').trim();
      track('advisor_feedback_text', { text: t.slice(0, 100), grade: st.grade ?? '' });
      box.innerHTML = '<span class="fb-q">고맙습니다. 의견이 전달됐어요.</span>';
    };
  });

  const gi = $('#advGrade');
  if (gi) gi.oninput = () => {
    advisorView.gradeInput = gi.value; advisorView.shown = {};
    const v = Number(gi.value);
    S.advisor.grade = (gi.value.trim() && Number.isFinite(v) && v >= 1 && v <= 9) ? v : null;
    save('advisor', S.advisor);
    clearTimeout(advisorView.timer); advisorView.timer = setTimeout(() => {
      track('advisor_grade', { grade: S.advisor.grade ?? '', valid: S.advisor.grade ? 1 : 0 });
      advisorRefresh('#advGrade');
    }, 400);
  };
  const si = $('#advSum');
  if (si) si.oninput = () => {
    advisorView.sumInput = si.value; advisorView.shown = {};
    const v = Number(si.value), n = Number(S.advisor.leastN);
    S.advisor.leastSum = (si.value.trim() && Number.isInteger(v) && v >= n && v <= n * 9) ? v : null;
    save('advisor', S.advisor);
    clearTimeout(advisorView.timer); advisorView.timer = setTimeout(() => advisorRefresh('#advSum'), 400);
  };
  inner.querySelectorAll('[data-adv-open]').forEach(c => c.onclick = () => {
    track('advisor_card_open', { band: c.closest('.adv-band')?.dataset.band || '' });
    const id = +c.dataset.advOpen, scrollTop = inner.scrollTop;
    closeAdvisor();
    openModal(id, { returnLabel: '추천 결과로 돌아가기', onClose: () => {
      renderAdvisor();
      inner.scrollTop = scrollTop;
      setTimeout(() => {
        if ($('#advisorDrawer').classList.contains('hidden')) return;
        inner.querySelector(`[data-adv-open="${id}"]`)?.focus({ preventScroll: true });
        inner.scrollTop = scrollTop;
      }, 50);
    } });
  });
}
function closeAdvisor() { clearTimeout(advisorView.timer); if ($('#advisorDrawer').classList.contains('hidden')) return; $('#advisorDrawer').classList.add('hidden'); closeDialog(); }

/* 졸업생(N수) 학생부 교과 반영 학기 범위. 원천 엑셀에 없어 요강에서 손으로 수집한 값이라
   **확인된 대학만** 보여 준다(record_scope.js). 없는 대학은 아무것도 그리지 않는다 —
   빈칸이 오답보다 낫고, '미확인'을 굳이 띄우면 화면만 시끄러워진다.
   ⚠️ 교과 성적 산출이 있는 전형에만 의미가 있다. 논술 100%·실기 위주에는 붙이지 않는다. */
function recordScope(r) {
  const S2 = (window.IPSI_RECORD_SCOPE || {}).universities || {};
  const e = S2[r.uni];
  if (!e) return '';
  if (e.conf === 'na') {
    return `<dt>졸업생 지원</dt><dd><span class="rs-na">불가</span> <span class="muted">${esc(e.note || '')}</span>
      <div class="rs-src">요강 “${esc(e.quote)}” · <a href="${esc(e.source)}" target="_blank" rel="noopener noreferrer">공식 확인 ↗</a></div></dd>`;
  }
  if (r.jhtype !== '학생부교과') return '';        // 교과 산출이 없는 전형엔 의미가 없다
  const same = e.graduate === e.current;
  return `<dt>졸업생 교과반영</dt><dd><b class="${same ? '' : 'rs-diff'}">${esc(e.graduate)}</b>
      <span class="muted">(재학생 ${esc(e.current)})</span>
      ${e.conf === 'inferred' ? '<span class="warn-tag" title="요강에 재학생·졸업생을 나누는 조항이 없어, 단일 규정이 졸업생에도 적용된다고 본 값입니다. 반드시 입학처에 확인하세요.">해석</span>' : ''}
      ${e.note ? `<div class="muted rs-note">${esc(e.note)}</div>` : ''}
      <div class="rs-src">요강 “${esc(e.quote)}” · <a href="${esc(e.source)}" target="_blank" rel="noopener noreferrer">공식 확인 ↗</a></div></dd>`;
}
/* ----- PDF 저장 (인쇄) — 지원카드·비교함을 A4 인쇄용 문서로 렌더 후 window.print() ----- */
/* 원자료 비고(note)는 한 줄 메모라 학생에겐 불친절하다 — 자주 나오는 패턴을 풀어쓴 해설로 확장한다.
   패턴에 없으면 원문 + 공통 안내를 붙인다. 원문은 항상 보존한다(자의적 대체 금지). */
const NOTE_RULES = [
  [/환산점수로.*비교/, '이 대학 입결은 원점수 등급이 아니라 대학 자체 환산점수 기준입니다. 단순 내신 평균등급으로 비교하면 오판할 수 있으니, 대학 입학처의 환산점수 계산기로 본인 점수를 산출해 전년 입결과 비교하세요.'],
  [/환산등급으로 판단|대?식 환산등급|입결은 .*식 (평균 )?등급/, '이 대학 입결은 대학 자체 환산식으로 산출한 등급입니다. 학교 내신 평균등급과 산식이 달라 직접 비교하면 오판할 수 있으니, 해당 대학 환산식 기준으로 본인 등급을 다시 계산해 비교하세요.'],
  [/환산등급으로 26학년만 비교/, '2026학년도부터 입결 산출 기준이 바뀌어 그 이전 연도 입결과의 직접 비교는 의미가 없습니다. 2026 값만 참고하고, 이전 연도는 추세 확인 용도로만 쓰세요.'],
  [/입결은 전\s?과목 등급|전교과 등급 평균/, '표기된 입결은 반영교과가 아닌 전 과목 평균등급 기준입니다. 본인의 전 과목 평균과 비교해야 하며, 반영교과만 계산한 등급과 혼동하면 실제보다 유리하게 오판할 수 있습니다.'],
  [/서류평가는 과목 선택 위주/, '서류평가에서 전공 관련 과목의 선택·이수 여부를 비중 있게 봅니다. 지원 학과와 관련된 교과 이수 내역과 세부능력특기사항 기록을 미리 점검하고, 부족하면 지원 전략을 재고하세요.'],
  [/교과이수기준|핵심권장과목/, '이 모집단위는 교과이수기준과 핵심권장과목 이수 여부를 확인합니다. 미이수 시 평가에서 불리하거나 지원 자체가 제한될 수 있으니, 모집요강의 권장과목 표와 본인 이수 내역을 대조하세요.'],
  [/본캠.*학적부? 이동.*불가능/, '입학 후 본캠퍼스로의 학적 이동(캠퍼스 간 전과)은 사실상 불가능합니다. 소속 캠퍼스를 확인하고, 캠퍼스가 다른 동일 학과와 혼동하지 않도록 주의하세요.'],
  [/일반고:?면접형/, '고교 유형별 합격 비율이 전형에 따라 다릅니다. 표기된 비율은 일반고 출신 합격자 비중으로, 본인 고교 유형에서의 실질 경쟁 구도를 가늠하는 참고 지표로 활용하세요.'],
  [/[가-힣]+대?식\s*(환산)?\s*(등급|점수)/, '이 대학 입결은 대학 자체 산출 방식(환산등급·환산점수)의 값입니다. 학교 내신 평균등급과 산식이 달라 그대로 비교하면 오판할 수 있으니, 해당 대학 입학처가 제공하는 산출 방식으로 본인 성적을 환산해 비교하세요.'],
  [/국영수사과|국·?영·?수·?사·?과/, '표기된 입결은 국어·영어·수학·사회·과학 반영교과 기준 등급입니다. 전 과목 평균이 아니라 반영교과만 계산한 값이므로, 본인 성적도 같은 교과 조합으로 산출해 비교해야 정확합니다.'],
  [/하락 예상/, '전형 방법이나 반영 방식 변화로 올해 합격선이 전년보다 낮아질(등급 숫자가 커질) 수 있다는 원자료의 분석입니다. 어디까지나 예측이므로 확정 정보로 받아들이지 말고, 전년 입결과 함께 보수적으로 참고하세요.'],
  [/등급 상승 가능|상승 예상/, '수능최저 완화 등으로 지원 문턱이 낮아져 경쟁이 붙으면 합격선이 오히려 올라갈(등급 숫자가 작아질) 수 있다는 원자료의 분석입니다. 전년 입결만 믿고 지원선을 잡으면 위험할 수 있으니 여유를 두고 판단하세요.'],
  [/등급\s?왜곡/, '교과 반영 방식이 바뀌어 표기된 등급이 실제 합격자 수준과 다르게 보일 수 있습니다. 이 값만으로 판단하지 말고, 대학어디가(adiga.kr)의 2026학년도 공식 입결과 대학 입학처 발표를 함께 확인하세요.'],
  [/일반고\s*\d점대\s*지원/, '일반고 기준으로 해당 내신 등급대라면 지원을 검토해볼 만하다는 원자료의 분석입니다. 고교 유형과 학교 내 위치에 따라 실제 경쟁력은 달라지므로, 담임·진학 교사와 상의해 최종 판단하세요.'],
  [/합격\s?확률|합격확률/, '원자료가 제시한 사실상의 지원 하한선입니다. 이 등급대를 넘어서는 성적이라면 이 전형은 상향 지원으로 분류하고, 다른 전형과의 조합(수시 6장)을 함께 설계하세요.'],
  [/핵심과목의?\s*내신|교과이수\s*중요|선택과목 이수 여부|원점수 및 세특/, '지원 학과와 관련된 과목의 이수 여부·성적·세부능력특기사항이 평가에 비중 있게 반영됩니다. 학생부에서 해당 과목 기록을 미리 점검하고, 이수 내역이 부족하면 지원 전략을 재검토하세요.'],
  [/전형\s*방식\s*등급|방식 등급 평균/, '표기된 입결은 해당 전형의 성적 반영 방식으로 산출한 등급 평균입니다. 단순 전 과목 평균과 다를 수 있으니, 같은 방식으로 본인 성적을 계산해 비교하세요.'],
];
function expandNote(r) {
  const note = r.note || '';
  for (const [re, tip] of NOTE_RULES) if (re.test(note)) return `<b>${esc(note)}</b><br><span style="display:block;margin-top:6px">${esc(tip)}</span>`;
  return `<b>${esc(note)}</b><br><span style="display:block;margin-top:6px">전형 조건과 예외 사항은 대학마다 다르게 적용됩니다. 지원 전에 반드시 해당 대학의 2027학년도 수시 모집요강 원문에서 세부 내용을 확인하고, 애매한 부분은 대학 입학처에 직접 문의하세요.</span>`;
}

function printDoc(title, subtitle, bodyHTML) {
  const host = $('#printArea');
  const stamp = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  host.innerHTML = `<div class="pr-head">
      <div><div class="pr-title">${esc(title)}</div><div class="pr-sub">${esc(subtitle)}</div></div>
      <div class="pr-brand">이투스247학원<div class="pr-date">${esc(stamp)} 기준</div></div>
    </div>${bodyHTML}
    <div class="pr-foot">2027학년도 수시지원 대시보드 · 입결·경쟁률은 2026학년도 기준 · 모집인원·수능최저는 2027학년도 기준</div>`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); host.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
function printFav() {
  if (!favCount()) { toast('지원카드가 비어 있습니다. 표의 ☆에서 먼저 담아주세요.'); return; }
  const card = (i, label) => {
    const r = ROWS[i], v = V(r), d = deltaInfo(r), g = yoyGrade(r), c = yoyComp(r);
    const dirTxt = x => x == null ? '' : x.basisMismatch ? '기준상이' : ({ easier: '유리', harder: '불리', flat: '유지', down: '유리', up: '불리' }[x.dir] || '');
    return `<tr>
      <td class="pr-rank">${label}</td>
      <td><b>${esc(r.uni)}</b> <span class="pr-mut">${esc(r.region)}${campusOf(r) ? ' · ' + esc(campusOf(r)) + ' 캠퍼스' : ''}</span><br>${esc(deptDisp(r))}${(() => { const ap = applyInfo(r.uni); return ap ? `<br><span class="pr-mut">접수 ${ap.txt}</span>` : ''; })()}</td>
      <td>${esc(r.jhtype)}<br><b>${esc(flat(r.jhname))}</b></td>
      <td class="pr-c">${fmtInt(r.enroll)}<br><span class="pr-mut">${r.dkind === 'changed' ? '전형변경' : esc(r.prev || '-')}</span></td>
      <td class="pr-c">${r.hasChoejeo ? esc(r.choejeo) : '<span class="pr-mut">없음</span>'}</td>
      <td class="pr-c"><b>${fmt(r.g[0])}</b>${CUT_SHORT[r.stdK26] && r.g[0] != null ? ` <span class="pr-mut">(${CUT_SHORT[r.stdK26]})</span>` : ''}<br><span class="pr-mut">${r.g[1] == null ? '' : fmt(r.g[1]) + '→'} ${dirTxt(g)}</span></td>
      <td class="pr-c">${r.c[0] == null ? '–' : r.c[0].toFixed(1)}:1<br><span class="pr-mut">${dirTxt(c)}</span></td>
      <td class="pr-c pr-vd ${v.cls}">${v.label}</td></tr>`;
  };
  const section = (bucket, name) => {
    if (!S.fav[bucket].length) return '';
    const rows = S.fav[bucket].map((i, k) => card(i, bucket === 'hope' ? (k >= SUSI_LIMIT ? `${k + 1} (후보)` : k + 1) : '상' + (k + 1))).join('');
    return `<h2 class="pr-h2">${name} <span class="pr-mut">${S.fav[bucket].length}장</span></h2>
      <table class="pr-table"><thead><tr><th>순위</th><th>대학 / 모집단위</th><th>전형</th><th>모집<br>(전년대비)</th><th>수능최저</th><th>입결<br>(2026)</th><th>경쟁률<br>(2026)</th><th>올해<br>유불리</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  const notices = favDateNotices();
  const noticeHtml = notices.length
    ? `<div class="pr-clash">🗓️ 고사일 확인 — ${notices.map(n => `${n.mo}/${n.dd}(${n.dow}): ${n.items.map(e => fcName(e, n.items)).join('·')}`).join(' / ')} <span class="pr-mut">(시간대가 다르면 응시 가능할 수 있음 — 각 대학 고사 시간 확인)</span></div>`
    : '';
  const note = S.favNote.trim();
  const noteHtml = note ? `<h2 class="pr-h2">📝 컨설턴트 의견</h2><div class="pr-note">${esc(note)}</div>` : '';
  printDoc('내 지원카드', `지원희망 ${S.fav.hope.length}장 · 상향·도전 ${S.fav.reach.length}장`,
    noticeHtml + section('hope', '🎯 지원희망') + section('reach', '🚀 상향·도전') + noteHtml);
}
function printCompare() {
  const items = [...S.compare].map(i => ROWS[i]);
  if (!items.length) { toast('비교함이 비어 있습니다. 표의 ⇄ 버튼에서 먼저 담아주세요.'); return; }
  const rowM = (lab, fn) => `<tr><td class="pr-rowlab">${lab}</td>${items.map(r => `<td>${fn(r)}</td>`).join('')}</tr>`;
  const body = `<p class="pr-mut">${comparisonBasisNotice(items)}</p><table class="pr-cmp"><thead><tr><th>구분</th>${items.map(r =>
      `<th><b>${esc(r.uni)}</b>${campusOf(r) ? `<br>${esc(campusOf(r))} 캠퍼스` : ''}<br>${esc(flat(deptDisp(r)))}<br><span class="pr-mut">${esc(flat(r.jhname))}</span></th>`).join('')}</tr></thead><tbody>
      ${rowM('올해 유불리', r => `<span class="pr-vd ${V(r).cls}">${V(r).label}</span>`)}
      ${rowM('계열/지역', r => esc(r.gye) + ' · ' + esc(r.region))}
      ${rowM('전형', r => esc(r.jhtype) + '<br><span class="pr-mut">' + esc(r.jhname) + '</span>')}
      ${comparisonRequirements(rowM)}
      ${rowM('모집(전년대비)', r => `${fmtInt(r.enroll)} <span class="pr-mut">${r.dkind === 'changed' ? '전형변경' : esc(r.prev || '-')}</span>`)}
      ${rowM('수능최저', r => r.hasChoejeo ? esc(r.choejeo) : '없음')}
      ${rowM('입결 2025→2026', r => `${fmt(r.g[1])} → <b>${fmt(r.g[0])}</b>` + (CUT_SHORT[r.stdK26] && r.g[0] != null ? ` <span class="pr-mut">(${CUT_SHORT[r.stdK26]})</span>` : ''))}
      ${rowM('입결 기준 · 2026', r => esc(r.std26 || '기준 자료 없음'))}
      ${rowM('경쟁률 2025→2026', r => `${r.c[1] == null ? '–' : r.c[1].toFixed(1)} → <b>${r.c[0] == null ? '–' : r.c[0].toFixed(1)}:1</b>`)}
      ${rowM('2027 최종 경쟁률', r => r.c27 ? `<b>${r.c27[0].toFixed(1)}:1</b>` : '–')}
      ${rowM('충원 2025→2026', r => esc(r.chung[1] || '–') + ' → ' + esc(r.chung[0] || '–'))}
    </tbody></table>`;
  printDoc('전형 비교', `${items.length}개 전형 비교`, body);
}

/* ----- 변화 인사이트 (2027 vs 2026) ----- */
const INS = window.IPSI_INSIGHTS || { meta: {}, order: [], unis: {} };
let _insUni = (INS.order || []).find(u => INS.unis[u]) || (INS.order || [])[0] || null;
let _insQuery = '';
function openInsight(uni) {
  if (uni && INS.unis[uni]) { _insUni = uni; _insQuery = ''; }
  if (!_insUni || !INS.unis[_insUni]) _insUni = (INS.order || []).find(u => INS.unis[u]);
  renderInsightRail(); renderInsightDetail(_insUni);
  const v = $('#insightView'); const wasOpen = !v.classList.contains('hidden');
  v.classList.remove('hidden');
  if (!wasOpen) openDialog(v, '대학별 변화 인사이트');
  track('open_insight', { uni: _insUni });
}
function closeInsight() { if ($('#insightView').classList.contains('hidden')) return; $('#insightView').classList.add('hidden'); closeDialog(); }
// 홈 화면 변화 인사이트 배너: 전체 대학에서 고르게 4개를 뽑아 미리보기 카드로 노출
function renderInsightBanner() {
  const sec = $('#insightBanner');
  const list = (INS.order || []).filter(u => INS.unis[u]);
  if (!sec || list.length < 4) { if (sec) sec.classList.add('hidden'); return; }
  // 디폴트는 최상위권 5교(사용자 지정) — 균등 분산은 서울대 옆에 전남대·금오공대가 놓여 어색했다.
  const N = 5, PREF = ['서울대학교', '연세대학교', '고려대학교', '성균관대학교', '한양대학교'];
  const feat = PREF.filter(u => INS.unis[u]);
  for (const u of list) { if (feat.length >= N) break; if (!feat.includes(u)) feat.push(u); }
  const cards = feat.map(u => {
    const d = INS.unis[u];
    const tags = (d.tags || []).slice(0, 2).map(t => `<span class="ins-tag">${esc(t)}</span>`).join('');
    return `<button class="ib-card" data-uni="${esc(u)}" aria-label="${esc(u)} 변화 인사이트 보기">
      <div class="ib-top"><span class="ib-uni">${esc(u)}</span>${d.tier ? `<span class="ins-tier">${esc(d.tier)}</span>` : ''}</div>
      <div class="ib-head">${esc(d.headline)}</div>
      <div class="ib-tags">${tags}</div></button>`;
  }).join('');
  sec.innerHTML = `<div class="panel-head">
      <h2>📰 대학별 변화 인사이트 <span class="muted">2027 vs 2026 · ${insUniCount()}개 대학</span></h2>
      <button class="ghost-btn ib-all" id="ibAllBtn">전체 보기 <span aria-hidden="true">→</span></button>
    </div>
    <div class="ib-cards">${cards}</div>`;
  sec.classList.remove('hidden');
  $('#ibAllBtn').onclick = () => openInsight();
  sec.querySelectorAll('.ib-card').forEach(c => c.onclick = () => openInsight(c.dataset.uni));
}
// 인사이트 항목 중 '이슈·특집'(주제별 총정리) 판별 — 레일과 홈 배너가 같은 기준을 써야
// 한쪽은 169개, 다른 쪽은 164개를 '대학'이라 세는 모순이 안 생긴다.
const isIssueKey = u => !!INS.unis[u] && (INS.unis[u].tier === '이슈' || INS.unis[u].tier === '특집');
const insUniCount = () => (INS.order || []).filter(u => INS.unis[u] && !isIssueKey(u)).length;

function renderInsightRail() {
  const rail = $('#insightRail');
  if (!$('#insightSearch')) {
    rail.innerHTML = `<div class="ins-rail-head"><h3>📰 변화 인사이트</h3><div class="muted">${esc(INS.meta.compare || '')}</div></div>
      <div class="ins-search"><label for="insightSearch">대학·주제 찾기</label>
        <div class="ins-search-row"><input id="insightSearch" type="search" placeholder="예: 경국대, 수능최저" autocomplete="off" aria-controls="insightResults" />
          <button id="insightSearchClear" class="ghost-btn" aria-label="인사이트 검색어 지우기">지우기</button></div>
        <div id="insightSearchStatus" class="muted" role="status" aria-live="polite"></div></div>
      <div id="insightResults" class="ins-rail-results"></div>
      <div id="insightSelectionStatus" class="sr-only" role="status" aria-live="polite"></div>`;
    $('#insightSearch').oninput = e => { _insQuery = e.target.value; renderInsightResults(); };
    $('#insightSearchClear').onclick = () => {
      _insQuery = ''; $('#insightSearch').value = ''; renderInsightResults(); $('#insightSearch').focus();
    };
  }
  $('#insightSearch').value = _insQuery;
  renderInsightResults();
}
function renderInsightResults() {
  const results = $('#insightResults');
  const item = u => {
    const d = INS.unis[u], active = u === _insUni;
    return `<button class="ins-rail-item${active ? ' active' : ''}${d ? '' : ' soon'}" data-uni="${esc(u)}" aria-controls="insightMain"${active ? ' aria-current="true"' : ''}${d ? '' : ' disabled'}>
      <span class="irl-name">${esc(u)}</span>${d ? (d.tier ? `<span class="ins-tier">${esc(d.tier)}</span>` : '') : '<span class="ins-soon">준비중</span>'}</button>`;
  };
  const norm = s => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const query = norm(_insQuery);
  const order = (INS.order || []).filter(u => !query || norm(`${u} ${u.replace(/대학교/g, '대')} ${INS.unis[u]?.tier || ''}`).includes(query));
  const issues = order.filter(isIssueKey);
  const unis = order.filter(u => !issues.includes(u));
  $('#insightSearchClear').disabled = !_insQuery;
  $('#insightSearchStatus').textContent = `대학 ${unis.length}개 · 주제 ${issues.length}개`;
  results.innerHTML = (issues.length ? `<div class="ins-rail-group">🔎 이슈·특집</div>` + issues.map(item).join('') : '')
    + (unis.length ? `<div class="ins-rail-group">🏫 대학별</div>` + unis.map(item).join('') : '')
    + (!order.length ? '<p class="ins-search-empty">검색 결과가 없습니다. 대학명 일부를 입력하거나 검색어를 지워주세요.</p>' : '');
  results.querySelectorAll('.ins-rail-item:not([disabled])').forEach(b => b.onclick = () => {
    _insUni = b.dataset.uni;
    // Keep the activated button mounted so keyboard focus and list position survive a university change.
    results.querySelectorAll('.ins-rail-item').forEach(button => {
      const active = button.dataset.uni === _insUni;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    });
    renderInsightDetail(_insUni);
    $('#insightSelectionStatus').textContent = `${_insUni} 인사이트를 표시했습니다.`;
    track('open_insight', { uni: _insUni });
  });
}
// 서술체 문장을 두괄식(결론) + 개조식(글머리표)으로 분해
function bulletize(text) {
  const t = (text || '').trim();
  if (!t) return { head: '', bullets: [] };
  const m = t.match(/^([\s\S]+?)\s[—–-]\s([\s\S]+)$/);
  const head = m ? m[1].trim() : t;
  const rest = m ? m[2].trim() : '';
  const bullets = rest
    ? rest.split(/(?<=[.!?])\s+(?=[가-힣A-Za-z①-⑳])/)
        .map(s => s.trim().replace(/[.]$/, ''))
        .filter(Boolean)
    : [];
  return { head, bullets };
}

// verdict 문구를 '대상: 결론' 형태면 앞을 강조하도록 분해
function splitVerdict(text) {
  const t = (text || '').trim();
  const m = t.match(/^([^:：]{2,32})[:：]\s*(.+)$/);
  return m ? { subj: m[1].trim(), body: m[2].trim() } : { subj: '', body: t };
}

function renderInsightDetail(uni) {
  const main = $('#insightMain'), d = INS.unis[uni];
  if (!d) { main.innerHTML = `<div class="ins-head"><div></div><button class="modal-close" id="insClose" aria-label="닫기">✕</button></div><div class="empty-state"><div class="es-ico">📰</div>준비중입니다.</div>`; $('#insClose').onclick = closeInsight; return; }
  const tags = (d.tags || []).map(t => `<span class="ins-tag">${esc(t)}</span>`).join('');
  const sections = (d.sections || []).map(s => {
    let body = '';
    if (s.rows) body += `<div class="ins-tablewrap"><table class="ins-table"><thead><tr><th>항목</th><th>${esc(INS.meta.fromYear || '이전')}</th><th aria-hidden="true"></th><th>${esc(INS.meta.toYear || '올해')}</th></tr></thead><tbody>` +
      s.rows.map(r => `<tr><td class="il">${esc(r.label)}</td><td class="ifrom">${esc(r.from)}</td><td class="ia ${esc(r.dir)}" aria-hidden="true">→</td><td class="it ${esc(r.dir)}"><b>${esc(r.to)}</b>${r.note ? `<span class="inote">${esc(r.note)}</span>` : ''}</td></tr>`).join('') + `</tbody></table></div>`;
    if (s.bullets) body += `<ul class="ins-bullets">` + s.bullets.map(b => `<li>${esc(b)}</li>`).join('') + `</ul>`;
    if (s.caption) body += `<p class="ins-caption">${esc(s.caption)}</p>`;
    return `<div class="ins-section"><h4>${s.icon || ''} ${esc(s.title)}</h4>${body}</div>`;
  }).join('');
  const verdict = (d.verdict || []).map(v => {
    const sv = splitVerdict(v.text);
    const body = sv.subj ? `<b>${esc(sv.subj)}</b> — ${esc(sv.body)}` : esc(sv.body);
    return `<div class="ins-vline ${esc(v.type)}"><span class="iv-ico">${v.type === 'good' ? '🟢' : v.type === 'bad' ? '🔴' : v.type === 'info' ? '🔵' : v.type === 'neutral' ? '⚪' : '🟠'}</span><span>${body}</span></div>`;
  }).join('');
  const ol = bulletize(d.oneLine);
  const oneLineHtml = ol.head ? `<div class="ins-oneline"><div class="ins-oneline-head">💡 ${esc(ol.head)}</div>${ol.bullets.length ? `<ul class="ins-oneline-bullets">${ol.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</div>` : '';
  main.innerHTML = `
    <div class="ins-head">
      <div class="ins-head-l"><div class="ins-uni">${esc(uni)}${d.tier ? ` <span class="ins-tier">${esc(d.tier)}</span>` : ''} <span class="muted">${esc(INS.meta.compare || '')}</span></div>
        <h2>${esc(d.headline)}</h2></div>
      <button class="modal-close" id="insClose" aria-label="인사이트 닫기">✕</button>
    </div>
    <div class="ins-scroll">
      ${tags ? `<div class="ins-tags">${tags}</div>` : ''}
      ${!isIssueKey(uni) && window.officialLinksHTML ? window.officialLinksHTML({ uni }) : ''}
      ${oneLineHtml}
      ${sections}
      ${verdict ? `<div class="ins-section"><h4>🎯 학생·학부모 관점 해석</h4><div class="ins-verdict">${verdict}</div></div>` : ''}
      <div class="ins-foot"><span class="muted">${esc(INS.meta.note || '')}</span></div>
    </div>`;
  $('#insClose').onclick = closeInsight;
}
$('#insightView').onclick = e => { if (e.target.id === 'insightView') closeInsight(); };
$('#insightBtn').onclick = () => openInsight();

/* ----- topbar / theme / search / mobile ----- */
let searchT;
const syncSearchClear = () => $('#searchClear').classList.toggle('hidden', !S.search.trim());
$('#search').oninput = e => { S.view = 'results'; S.search = e.target.value; syncSearchClear(); clearTimeout(searchT); searchT = setTimeout(() => renderAll(), 180); };
$('#searchClear').onclick = () => { clearTimeout(searchT); S.search = ''; $('#search').value = ''; syncSearchClear(); renderAll(); $('#search').focus(); };
$('#resetBtn').onclick = () => {
  clearTimeout(searchT); S.stdCut = ''; S.cutGrade = 9; S.examWhen = '';
  S.jhtypes.clear(); S.changes.clear(); S.region = ''; S.minLeast = ''; S.interview = ''; S.leastN = ''; S.leastSum = null; S.search = ''; $('#search').value = '';
  syncSearchClear(); renderFilters(); renderAll();
};
// 전체 초기화 — 계열 카테고리·입결 컷까지 되돌린다. goHome 과 같은 범위지만 사이드바를 닫거나
// 맨 위로 올리지 않는다(필터 상자가 검색창 아래에 있어 그 자리에서 결과를 바로 확인한다).
$('#resetAllBtn').onclick = () => {
  clearTimeout(searchT); S.cat = 'all';
  S.jhtypes.clear(); S.changes.clear(); S.region = ''; S.minLeast = ''; S.interview = '';
  S.leastN = ''; S.leastSum = null; S.examWhen = ''; S.stdCut = ''; S.cutGrade = 9.0;
  S.search = ''; $('#search').value = ''; S.page = 1;
  syncSearchClear(); renderCatList(); renderFilters(); renderAll(); track('reset_all');
};
/* 처음 화면으로 — 로고 클릭·검색 결과의 '처음 화면' 버튼이 함께 쓴다.
   상세 필터 해제(resetBtn)와 달리 **계열 카테고리와 입결 컷까지** 전부 되돌리고 맨 위로 올린다.
   검색 도중 길을 잃었을 때 한 번에 원점으로 오는 탈출구다. */
function goHome() {
  clearTimeout(searchT); S.view = 'results';
  S.cat = 'all'; S.jhtypes.clear(); S.changes.clear();
  S.region = ''; S.minLeast = ''; S.interview = ''; S.leastN = ''; S.leastSum = null;
  S.examWhen = ''; S.stdCut = ''; S.cutGrade = 9.0;
  S.search = ''; $('#search').value = ''; S.page = 1;
  syncSearchClear(); closeSidebar();
  renderCatList(); renderFilters(); renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => { if (window.scrollY > 4) window.scrollTo(0, 0); }, 350);   // smooth 미지원 환경 폴백
  track('go_home');
}
$('#homeBtn').onclick = goHome;
$('#universitySuggestions').innerHTML = UNIVERSITY_NAMES.map(u => `<option value="${esc(u)}"></option>`).join('');
['results', 'analysis'].forEach(view => {
  $('#' + view + 'ViewBtn').onclick = () => { S.view = view; renderView(); persistView(); };
});
function applyTheme(t) {
  document.documentElement.dataset.theme = t;   // 아이콘·로고는 CSS가 data-theme로 전환
  save('theme', t);
}
$('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeFavMenu(); closeModal(); closeCompareDrawer(); closeFavDrawer(); closeAdvisor(); closeInsight(); closeSidebar(); } });
/* 맞춤 추천 — 기본 노출로 전환(2026-08-08 사용자 승인). 자체 검증(역전 0건·정렬 결함 수정)과
   기준 혼재 처리(stage1 제외·배지), 인앱 피드백(GA 수집)을 갖췄고, 원서접수 한 달 전이
   이 기능이 가장 필요한 시점이다. BETA 배지는 유지 — 피드백 수집 중임을 알린다.
   ?beta=0 은 비상 오프 스위치(문제 발생 시 그 브라우저에서 숨김), ?beta=1 로 복구. */
(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('beta') === '0') { try { localStorage.setItem('ipsi_beta_off', '1'); } catch (e) {} }
  if (q.get('beta') === '1') { try { localStorage.removeItem('ipsi_beta_off'); } catch (e) {} }
  let off = false; try { off = localStorage.getItem('ipsi_beta_off') === '1'; } catch (e) {}
  if (off) return;
  const b = $('#advisorBtn'); if (!b) return;
  b.classList.remove('hidden');
  b.onclick = renderAdvisor;
})();

const scrim = el('div', 'scrim'); document.body.appendChild(scrim);
scrim.onclick = closeSidebar;
function openSidebar() { $('#sidebar').classList.add('open'); scrim.classList.add('show'); $('#menuToggle').setAttribute('aria-expanded', 'true'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); scrim.classList.remove('show'); $('#menuToggle').setAttribute('aria-expanded', 'false'); }
$('#menuToggle').onclick = () => $('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar();

/* ----- init ----- */
$('#sourceNote').innerHTML = `자료: ${esc(D.meta.source)}<br>전형 ${D.meta.nRows.toLocaleString()}건 · 대학 ${D.meta.nUni}곳`;
/* 수시 원서접수 일정 안내. 지원 시점이 코앞인데 대시보드 어디에도 접수일이 없었다.
   ⚠️ 날짜는 2027학년도 대입전형 기본사항(대교협) 기준으로 고정한다 — 명지대 2027 전형계획
   '2026. 9. 7.(월) ~ 11.(금) 중 3일 이상', 유원대 2027 요강 '2026. 09. 07.(월) ~ 09. 11.(금)'로 확인.
   접수 기간·마감 후로 문구가 자동으로 바뀌므로 시점이 지나도 어긋나지 않는다. */
function applySchedule() {
  const box = $('#applyBar'); if (!box) return;
  const S1 = new Date(2026, 8, 7), E1 = new Date(2026, 8, 11, 23, 59);   // 9/7 ~ 9/11
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const dday = Math.ceil((S1 - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / day);
  let txt, cls;
  if (now < S1) {
    txt = `<b>2027 수시 원서접수</b>까지 <b class="ab-d">D-${dday}</b> · 2026.9.7(월)~9.11(금) <span class="ab-sub">대학마다 이 기간 중 3일 이상 접수(KAIST 등 과기원은 자체 일정 — 9/1부터 시작하기도) — 대학별 일정은 각 입학처 확인</span>`;
    cls = 'soon';
  } else if (now <= E1) {
    txt = `<b class="ab-d">원서접수 진행 중</b> · 2026.9.7(월)~9.11(금) <span class="ab-sub">대학마다 마감일이 다릅니다 — 각 입학처 일정을 반드시 확인하세요</span>`;
    cls = 'now';
  } else {
    txt = `2027 수시 원서접수 마감(2026.9.11) <span class="ab-sub">이후 일정은 대학별고사·합격자 발표 — 각 입학처 공지를 확인하세요</span>`;
    cls = 'done';
  }
  // 조기마감 대학 전역 경고 — 대학을 검색·담아야만 보이면 훑어보는 학생은 함정을 모른 채 지나간다.
  // apply_dates.js 에서 동적으로 산출하므로 재수집하면 문구도 따라 바뀐다.
  try {
    if (now <= E1) {
      const early = Object.entries(APPLY)
        .filter(([u, a2v]) => new Date(a2v.to) < new Date(2026, 8, 11))
        .sort((x, y) => new Date(x[1].to) - new Date(y[1].to));
      if (early.length) {
        const names = early.slice(0, 3).map(([u]) => u.replace('학교', '')).join('·');
        const d1 = new Date(early[0][1].to), d2 = new Date(early[early.length - 1][1].to);
        txt += ` <span class="ab-sub">⚠️ <b class="ab-warn">${names} 등 ${early.length}교는 ${d1.getMonth() + 1}/${d1.getDate()}~${d2.getMonth() + 1}/${d2.getDate()} 조기마감</b> — 대학명을 검색하면 정확한 마감 시각이 보입니다</span>`;
      }
    }
  } catch (e) {}
  // 지원카드에 담긴 대학 중 가장 이른 마감 — 공통 안내보다 이 한 줄이 사고를 막는다
  try {
    const favUnis = [...new Set([...(S.fav.hope || []), ...(S.fav.reach || [])].map(i => ROWS[i] && ROWS[i].uni).filter(Boolean))];
    const deadlines = favUnis.map(u => ({ u, ap: applyInfo(u) })).filter(x => x.ap);
    if (deadlines.length) {
      deadlines.sort((a, b) => a.ap.toDate - b.ap.toDate);
      const first = deadlines[0];
      txt += ` <span class="ab-sub">내 지원카드에서 가장 이른 마감 — <b>${esc(first.u)} ${first.ap.to}</b>${first.ap.early ? ' <b class="ab-d">(공통 마감 9/11보다 이릅니다)</b>' : ''}</span>`;
    }
  } catch (e) {}
  box.className = 'apply-bar ' + cls;
  box.innerHTML = `<span class="ab-ico" aria-hidden="true">🗓️</span><span>${txt}</span>`;
}
applySchedule();

$('#footNote').innerHTML = `<b>이투스247학원</b> &nbsp; '올해 유불리 예상'과 '최저 변화'는 공개 데이터 기반 자동 분석 결과로 실제 입시 결과와 다를 수 있으니, 반드시 각 대학 모집요강을 확인하세요.`;
applyTheme(load('theme', 'light'));   // 기본 테마 = 라이트
// 공유 링크로 들어온 경우: 지원카드·비교함을 복원하고 해당 서랍을 열어 바로 보여준다.
const _program = new URLSearchParams(location.search).get('program');
restoreView();
const _restoredPage = S.page;
const _shared = applyShareURL();
updateCompareBtn(); updateFavBtn();
renderCatList(); renderFilters(); renderAll(); renderInsightBanner();
if (_restoredPage > 1) { S.page = _restoredPage; renderTable(); }
if (_program) { const i = indexOfCode(_program); if (i != null) setTimeout(() => openModal(i), 60); else toast('해당 전형을 찾을 수 없습니다. 대학·학과명으로 검색해주세요.'); }
if (_shared) setTimeout(() => { if (_shared.fav) openFav(); else if (_shared.cmp) openCompare(); }, 60);
})();
