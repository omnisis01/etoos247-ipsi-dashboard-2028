// 필드별 마커 주입 렌더 검증 — 각 필드가 실제로 화면에 나오는지 실행으로 증명한다
// 사용법: node probe_fields.js            # 전 필드
//         node probe_fields.js note dept  # 지정 필드만
//
// verify_render.js 를 필드마다 자식 프로세스로 돌린다(필드를 한꺼번에 마커로 바꾸면
// uni·dept 변조가 TOP_UNIS 매칭을 깨서 다른 필드 검증까지 오염되기 때문).
const { execFileSync } = require('child_process');
const path = require('path');
const HERE = __dirname;

// 화면을 여는 액션까지 태워야 모달·인사이트·비교함·지원카드 렌더가 잡힌다
const DRIVER = `
const H = require('${path.join(HERE, 'verify_render.js').replace(/\\/g, '\\\\')}');
const ev = () => ({ target: { closest: () => null, dataset: {} }, preventDefault(){}, stopPropagation(){}, key: 'Enter' });
const fire = k => { const f = H.HANDLERS.get(k); if (!f) return;
  try { f(ev()); } catch (e) {} };
// 1) 상단 버튼 — 인사이트·비교함·지원카드·맞춤추천 오버레이를 연다
['insightBtn:click','compareBtn:click','favBtn:click','advisorBtn:click',
 'hlFilter:click','chartMetric:click','sortSeg:click'].forEach(fire);
// 2) 표의 행·카드에 걸린 핸들러 — 이걸 호출해야 상세 모달이 열리고
//    거기서만 보이는 필드(전형방법·유의사항·환산점수·추합·고사일 등)가 렌더된다.
for (const el of H.PROBES.slice()) {
  for (const h of [el._onclick, el._onkeydown]) {
    if (typeof h === 'function') { try { h(ev()); } catch (e) {} }
  }
}
const MARK = globalThis.__PROBE_NUM || '◈PROBE◈';
const ALL = H.RENDERED.map(r => r.html).join('\\n');
process.stdout.write(JSON.stringify({
  boot: !H.bootError, err: H.bootError ? H.bootError.message : '',
  hit: ALL.includes(MARK), size: ALL.length, mark: MARK,
  where: [...new Set(H.RENDERED.filter(r => r.html.includes(MARK)).map(r => r.id || '(익명)'))].slice(0, 6),
}));
`;

const DATA_FIELDS = ['region', 'sigun', 'uni', 'gye', 'dept', 'jhtype', 'jhname', 'jagyeok', 'enroll',
  'prev', 'dkind', 'dn', 'change', 'choejeo', 'hasChoejeo', 'chKind', 'c26', 'c25', 'c24',
  'g26', 'g25', 'g24', 'v26', 'v25', 'v24', 'chung26', 'chung25', 'chung24', 'method', 'note',
  'date', 'gradeRatio', 'subjects', 'careerSubj', 'std26', 'stdK26', 'std24', 'dupApply', 'docs'];
const INS_FIELDS = ['ins.tier', 'ins.headline', 'ins.tags', 'ins.oneLine', 'ins.caption',
  'ins.bullets', 'ins.icon', 'ins.title', 'ins.text', 'ins.label', 'ins.from', 'ins.to', 'ins.note'];

const want = process.argv.slice(2);
const FIELDS = want.length ? want : [...DATA_FIELDS, ...INS_FIELDS];

// 필드별로 '그 값이 채워진 행'을 찾아 둔다 — 모달을 그 행으로 열어야 필드가 렌더된다
globalThis.window = {};
require('./data.js');
const D = globalThis.window.IPSI;
function rowFor(field) {
  const di = D.schema.indexOf(field);
  if (di < 0) return '0';
  // std26/std25/std24 만 dicts.std 를 공유한다. stdK26(버킷 코드)·prev(마크)는 사전형이 아니다.
  const dict = D.dicts[field] || (/^std2\d$/.test(field) ? D.dicts.std : null);
  // std24 는 세 해의 기준이 **서로 달라야** 화면(⚠ 연도별 기준 상이)에 나온다 — 그 조건을 만족하는 행으로 연다.
  // 실측(2026-10-09, 2028판): 첫 행이 3년 동일이라 경고가 안 떠 미도달로 오판했다(상이 행은 505개 있었다).
  if (field === 'std24') {
    const i26 = D.schema.indexOf('std26'), i25 = D.schema.indexOf('std25');
    const nz = t => String(t || '').replace(/\s/g, '');
    for (let i = 0; i < D.rows.length; i++) {
      const a = [D.rows[i][i26], D.rows[i][i25], D.rows[i][di]].map(v => nz(D.dicts.std[v])).filter(Boolean);
      if (new Set(a).size > 1) return String(i);
    }
  }
  for (let i = 0; i < D.rows.length; i++) {
    const v = D.rows[i][di];
    if (v == null || v === '') continue;
    if (dict && !String(dict[v] || '').trim()) continue;   // 사전형은 실제 문자열이 있어야 한다
    return String(i);
  }
  return null;   // 이 데이터엔 값이 한 행도 없다 — 화면 도달을 검사할 수 없다
}

const rows = [];
const skipped = [];
for (const f of FIELDS) {
  let out;
  const probeRow = f.startsWith('ins.') ? '0' : rowFor(f);
  if (probeRow === null) {       // 2028판: 고사일(미정)·복수지원(원천 없음)처럼 수집된 값이 0행이면 검사 대상이 아니다
    skipped.push(f); console.log(`${f.padEnd(14)} · 값 없음(0행) → 건너뜀`); continue;
  }
  try {
    out = JSON.parse(execFileSync('node', ['-e', DRIVER], {
      cwd: HERE, env: { ...process.env, PROBE: f, PROBE_ROW: probeRow }, encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024, timeout: 60000,
    }));
  } catch (e) {
    out = { boot: false, err: String(e.message).slice(0, 80), hit: false, where: [] };
  }
  rows.push({ f, ...out });
  const mark = !out.boot ? '⚠ 부팅실패' : out.hit ? '✓ 화면 도달' : '✗ 화면 미도달';
  console.log(`${f.padEnd(14)} ${mark.padEnd(14)} ${out.where && out.where.length ? out.where.join(' ') : (out.err || '')}`);
}

// 코드값 필드 — 원본 값(cut70·up·0/1)이 화면에 그대로 나오면 오히려 버그다.
// 화면에는 변환된 라벨로 나가므로, 마커가 안 잡히는 게 정상이다. 대신 라벨 존재를 따로 본다.
const CODE_FIELDS = {
  gye: ['인문', '자연', '예체능'],
  dkind: ['증원', '감원', '신설'],
  hasChoejeo: ['없음', '최저'],
  stdK26: ['평균', '컷', '최저'],
  // ⚠️ std24 는 마커 주입으로 검증할 수 없다 — std26/std25/std24 가 **같은 dict를 공유**해서
  //    주입하면 세 연도가 전부 같은 값이 되고, "기준이 서로 다를 때만" 뜨는 경고가 사라진다.
  //    즉 마커 미검출은 도달 실패가 아니라 주입 방식의 한계다(실측으로 도달 확인함).
  //    대신 그 경고 문구가 화면에 있는지로 확인한다.
  // ⚠️ 문구를 바꾸면 여기도 함께 바꾼다 — 실제로 2026-09-08 워딩 개선 때 이 검사가 잡아냈다.
  std24: ['발표 기준이 해마다 달라'],
  // prev(전년대비 마크)는 모달에서 dkind·dn 으로 변환된 d.txt 로 그려지고, 원문은 지원카드(인쇄)·비교함에서만
  // — 둘 다 담긴 행이 있어야 렌더된다(빈 세션의 프로브에선 비어 있다). 2027 에선 첫 행의 미지 마크('신살')가
  // 원문 그대로 흘러나와 우연히 통과했을 뿐이다(2026-10-09, 2028판 실측). 변환 라벨로 도달을 본다.
  prev: ['▲', '▼', '신설', '분리'],
};

const missing = rows.filter(r => r.boot && !r.hit && !(r.f in CODE_FIELDS));
const codeRows = rows.filter(r => r.f in CODE_FIELDS);

if (codeRows.length) {
  // 변환 라벨이 실제 렌더 결과에 있는지 한 번의 렌더로 확인한다
  const labelCheck = JSON.parse(execFileSync('node', ['-e', DRIVER + `
`], { cwd: HERE, env: { ...process.env, PROBE: '' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const dump = execFileSync('node', ['-e', `
const H = require('${path.join(HERE, 'verify_render.js').replace(/\\/g, '\\\\')}');
const ev = () => ({ target: { closest: () => null, dataset: {} }, preventDefault(){}, stopPropagation(){}, key:'Enter' });
const fire = k => { const f = H.HANDLERS.get(k); if (f) { try { f(ev()); } catch (e) {} } };
['insightBtn:click','compareBtn:click','favBtn:click','advisorBtn:click'].forEach(fire);
for (const el of H.PROBES.slice()) for (const h of [el._onclick, el._onkeydown]) if (typeof h === 'function') { try { h(ev()); } catch (e) {} }
process.stdout.write(H.RENDERED.map(r => r.html).join('\\n').replace(/<[^>]*>/g, ' '));
`], { cwd: HERE, env: { ...process.env, PROBE: '', PROBE_ROW: rowFor('std24') || '0' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // ↑ std24 의 라벨(연도별 기준 상이)은 기준이 서로 다른 행의 모달에서만 나온다 — 그 행으로 연다
  console.log();
  console.log('=== 코드값 필드 — 변환 라벨로 화면에 나오는지 ===');
  for (const r of codeRows) {
    const found = CODE_FIELDS[r.f].filter(w => dump.includes(w));
    const ok = found.length > 0;
    if (!ok) missing.push(r);
    console.log(`  ${ok ? '✓' : '✗'} ${r.f.padEnd(12)} 라벨 ${found.join(' ') || '없음'}`);
  }
}

console.log();
const reached = rows.filter(r => r.hit).length + codeRows.filter(r => !missing.includes(r)).length;
console.log(`값 그대로 도달 ${rows.filter(r => r.hit).length} · 코드값(라벨 변환) ${codeRows.length} · 미도달 ${missing.length} · 부팅실패 ${rows.filter(r => !r.boot).length} · 값 없음 건너뜀 ${skipped.length}${skipped.length ? ' (' + skipped.join(', ') + ')' : ''}`);
if (missing.length) {
  console.log('미도달 필드 — 수집했으나 사용자 화면에 나오지 않는다:');
  for (const m of missing) console.log('  ✗', m.f);
} else {
  console.log('OK  검사한 모든 필드가 화면에 도달한다(코드값은 변환 라벨로).');
}
process.exit(missing.length ? 1 : 0);
