# build_data.py가 만든 data.js의 불변식을 검증하고, 이전 버전과의 변경점을 진단하는 하네스
# 사용법:
#   python3 verify_data.py                 # 불변식 검증 (통과=조용히, 실패=시끄럽게, 위반 시 exit 1)
#   python3 verify_data.py --diff OLD.js    # OLD.js 대비 행 단위 변경 리포트 (엑셀 갱신 시)
"""
하네스 원칙 적용:
- Silent success, verbose failure: 통과하면 한 줄, 실패하면 위반 항목을 전부 출력하고 exit 1.
- Ratchet: 실제로 겪은 실패만 규칙으로 넣는다(입결 등급 범위·연도 프레임·행수 급변).
- 재사용 스킬: 매 갱신마다 즉석 diff를 다시 짜지 말고 --diff로 재사용.
"""
import json, re, os, sys, re

HERE = os.path.dirname(__file__)

def load(path):
    t = open(path, encoding='utf-8').read()
    prefix = 'window.IPSI = '
    if not t.startswith(prefix):
        raise SystemExit(f'FAIL: {path} 가 "{prefix}"로 시작하지 않음')
    return json.loads(t[len(prefix):-1])  # 끝의 ';' 제거

# ---------------------------------------------------------------- 불변식 검증
def col(sch, name):
    return sch.index(name)

# 완전중복 허용 목록 (대학, 학과, 전형유형, 전형명) — 같은 키로 두 줄이 정상인 경우.
# (A)4라운드에서 15건 전수 판정 완료. 11건은 실오류로 밝혀져 data_corrections.json으로 옮겼고,
# 아래 4건만 요강상 정말 두 줄이 맞다. 판정 근거를 각 줄에 남긴다 —
# 근거 없는 항목을 여기 추가하면 진짜 중복이 영원히 숨는다.
# 이 목록에 없는 새 중복이 생기면 검증 실패 → 엑셀 갱신 시 회귀를 즉시 잡는다.
DUP_OK = {
    # 요강 논술전형 총계 337+5=342 = 대시보드 342. 15+15 분리 모집.
    ('부산대학교', '자유전공학부', '논술', '논술전형'),
    # 요강 p29 총괄표 '퇴계혁신칼리지(광역) 인문 48 / 자연 25'. 계열 분리라 두 줄이 맞다.
    ('단국대학교', '퇴계혁신칼리지(광역)', '논술', '논술우수자전형'),
    # 동명이단위. 요강 p11 실용음악학부 피아노 6 + 음악학부 피아노 2 → 학과명만 같고 별개 모집단위.
    ('서경대학교', '피아노', '실기/실적', '실기우수자전형'),
    # 요강 p7에 이름이 거의 같은 두 전형이 따로 있다 — 학교생활우수자(교과70+면접30) 8,
    # 학교생활우수자(항공운항서비스, 교과50+면접50) 21. 인원은 정확하나 원천 엑셀이 전형명을
    # 하나로 뭉개 실었다. 값은 맞으므로 중복이 아니며, 전형명 구분은 별도 과제로 남긴다.
    ('중부대학교', '항공운항서비스학전공', '학생부교과', '학교생활우수자전형'),
}

# 정원 외 채용조건형 반도체 계약학과 마스터 리스트 — 원본 엑셀 표기 누락과 무관하게 강제.
# 여기 등재된 학과는 반드시 semiconductor_contract 카테고리에 잡혀야 한다.
SEMI_CONTRACT_MASTER = [
    ('고려대학교', '반도체공학과'),
    ('연세대학교', '시스템반도체공학과'),
    ('성균관대학교', '반도체시스템공학과'),
    ('서강대학교', '시스템반도체공학과'),
    ('한양대학교', '반도체공학과'),
    ('KAIST', '반도체공학과'),
    ('UNIST', '반도체공학과'),
]

def verify(d):
    fails = []
    sch = d['schema']; rows = d['rows']

    # 1) 메타 정합성
    # ⚠️ 모든 행의 길이가 SCHEMA 와 같아야 한다.
    # 실측(2026-08-29): SCHEMA 를 38→41 로 늘렸는데 data_corrections 'add' 로 만드는 30행만
    # 38필드로 남아 그 행들에서 복수지원 제한·필요서류·std24 가 통째로 사라졌다.
    # 엑셀 행과 교정 행은 생성 경로가 달라, 한쪽만 고치면 조용히 어긋난다.
    _wrong = [i for i, r in enumerate(rows) if len(r) != len(sch)]
    if _wrong:
        _by = {}
        for i in _wrong:
            _by.setdefault(len(rows[i]), []).append(i)
        fails.append(f"행 길이가 SCHEMA({len(sch)})와 다른 행 {len(_wrong)}개 — 길이별 "
                     f"{ {k: len(v) for k, v in _by.items()} } · 예시 행 {_wrong[:5]}. "
                     f"교정 'add' 경로가 SCHEMA 확장을 못 따라갔는지 확인하라(build_data.py _ADDED_ROWS)")

    # ⚠️ 최저가 살아 있는데 '폐지'로 라벨링되면 안 된다.
    # 실측(2026-08-29): '한국사 반영 폐지'·'수학 지정 폐지' 같은 **하위 조건** 폐지 139행
    # (모집 1,285명)이 '최저 폐지'로 표시됐다. 한국외대 경영 논술은 2합4 가 살아 있는데도
    # '최저 폐지 → 지원 증가'로 렌더됐다 — 최저를 못 맞추는 학생이 수시 한 칸을 버리게 된다.
    _ick, _ihc = col(sch, 'chKind'), col(sch, 'hasChoejeo')
    if _ick is not None and _ihc is not None:
        _zombie = [r for r in rows if r[_ick] == '폐지' and r[_ihc] == 1]
        if _zombie:
            _iu, _idp = col(sch, 'uni'), col(sch, 'dept')
            _ex = ', '.join(f"{d['dicts']['uni'][r[_iu]]} {d['dicts']['dept'][r[_idp]][:10]}"
                            for r in _zombie[:3])
            fails.append(f"최저 '폐지'인데 최저값이 남아 있는 행 {len(_zombie)}개 — "
                         f"하위 조건(한국사·지정·필수) 폐지를 최저 폐지로 오분류했을 가능성. 예: {_ex}")

    # ⚠️ 고사일이 적혀 있는데 날짜 토큰이 하나도 안 잡히면 '수능 전/후' 판정이 통째로 빠진다.
    # 실측(2026-08-29): '10..5(월)'·'10.,7(수)' 처럼 구분자가 깨진 5종 7행이 examWhen=null 이었고,
    # 그중 수능 전 실기 4행(이화여대 한국음악 43명 등)에 **수시 납치 경고가 뜨지 않았다.**
    # 기존 요일 대조 검사는 정규식이 매칭된 뒤에야 동작해 이 계열을 통째로 건너뛴다.
    _idt = col(sch, 'date')
    if _idt is not None:
        _dre = re.compile(r'(\d{1,2})\.\s*(\d{1,2})')
        _nodate = {d['dicts']['date'][r[_idt]] for r in rows
                   if (d['dicts']['date'][r[_idt]] or '').strip()
                   and not _dre.search(d['dicts']['date'][r[_idt]])
                   and '요강' not in d['dicts']['date'][r[_idt]]}
        if _nodate:
            fails.append(f"고사일에 날짜 토큰이 없는 표기 {len(_nodate)}종 — 수능 전/후 판정이 빠진다: "
                         f"{sorted(_nodate)[:5]}")

    if d['meta'].get('nRows') != len(rows):
        fails.append(f"meta.nRows({d['meta'].get('nRows')}) != 실제 행수({len(rows)})")
    if d['meta'].get('nUni') != len(d['dicts']['uni']):
        fails.append(f"meta.nUni != 실제 대학수({len(d['dicts']['uni'])})")

    # 2) 연도 프레임(확정): 올해=2028 (2026-10-09 전환)
    if d['meta'].get('years', {}).get('cur') != 2028:
        fails.append(f"meta.years.cur != 2028 (현재 {d['meta'].get('years',{}).get('cur')})")

    # 3) 입결 등급 불변식 — 1.0~9.0 범위 밖이면 무데이터(None)여야 한다.
    #    (등급 숫자가 작을수록 '높음/우수'. 환산점수 오입력이 등급칸에 새는 것을 차단.)
    ig = [col(sch, c) for c in ('g26', 'g25', 'g24')]
    bad_grade = 0
    for r in rows:
        for i in ig:
            v = r[i]
            if v is not None and not (1.0 <= v <= 9.0):
                bad_grade += 1
    if bad_grade:
        fails.append(f"입결 등급 범위(1.0~9.0) 위반 {bad_grade}건 — vgrade() 확인 필요")

    # 4) 핵심 카테고리 카운트 > 0 (분류 로직이 통째로 깨졌는지 감지)
    cats = {c['key']: c['count'] for c in d['cats']}
    for k in ('medical', 'engineering', 'nursing_health', 'business', 'natural'):
        if cats.get(k, 0) <= 0:
            fails.append(f"핵심 카테고리 '{k}' 카운트가 0 — 분류 로직 점검")

    # 5) 출처 라벨 존재
    if not d['meta'].get('source'):
        fails.append("meta.source 비어 있음")

    # 5.4) 필수 SCHEMA 필드가 전부 있어야 한다 — 앱 렌더/필터가 의존.
    required_fields = ['uni', 'dept', 'jhtype', 'jhname', 'enroll', 'g26', 'g25', 'g24',
                       'c26', 'c25', 'c24', 'cats', 'std26', 'stdK26']
    for f in required_fields:
        if f not in sch:
            fails.append(f"필수 SCHEMA 필드 누락: '{f}' — build_data.py SCHEMA 확인")

    # 5.4) 수능최저 변화 방향(chKind) — 'N합M' 변화는 합만 비교하면 N이 바뀔 때 오판한다.
    #      실제 사례: 홍익대 '3합8→2합5'를 강화로 오분류(72전형). 충족 가능 집합 포함관계로 재검증.
    from itertools import product as _prod
    _dc = {}
    def _dir(n1, m1, n2, m2):
        k = (n1, m1, n2, m2)
        if k in _dc: return _dc[k]
        o, n = set(), set()
        for g in _prod(range(1, 10), repeat=4):
            t = tuple(sorted(g))
            if sum(t[:n1]) <= m1: o.add(t)
            if sum(t[:n2]) <= m2: n.add(t)
        _dc[k] = '변경' if o == n else ('완화' if o < n else ('강화' if n < o else '변경'))
        return _dc[k]
    i_change, i_ck = sch.index('change'), sch.index('chKind')
    dic_change = d['dicts']['change']
    bad_dir = []
    for r in d['rows']:
        ch = dic_change[r[i_change]] if r[i_change] is not None and r[i_change] < len(dic_change) else ''
        m = re.search(r'(\d)합(\d+)→(\d)합(\d+)', (ch or '').replace(' ', ''))
        if not m: continue
        want = _dir(int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)))
        got = r[i_ck] or ''
        if got and got != want and got not in ('신설', '폐지'):
            bad_dir.append(f"{m.group(0)}: chKind='{got}' 이나 엄밀판정='{want}'")
    if bad_dir:
        from collections import Counter
        c = Counter(bad_dir)
        fails.append(f"수능최저 변화 방향 오분류 {sum(c.values())}건 — build_data.py의 least_direction() 확인: " + '; '.join(f'{k}({v}건)' for k, v in c.most_common(4)))

    # 5.45) 입결 추세 비교의 전제 — 연도별 '입결 기준'(col21=2026, col26=2025)이 다르면
    #       등급 차이는 지표 변경일 뿐이라 추세로 읽으면 안 된다. app.js가 막으려면 std25가 필요하다.
    if 'std25' not in sch:
        fails.append("schema에 'std25' 없음 — 입결 기준 연도 비교 불가(app.js yoyGrade의 basisMismatch 차단이 무력화됨)")

    # 5.5) 입결 컷 필터용 필드 존재 및 stdK26 값 유효성
    for f in ('std26', 'stdK26'):
        if f not in sch:
            fails.append(f"schema에 '{f}' 없음 — build_data.py 확인")
    if 'stdK26' in sch:
        iK = col(sch, 'stdK26')
        # 버킷은 build_data.py의 std_kind()와 app.js의 CUT_LABELS 셋이 함께 움직인다.
        # 하나만 늘리면 여기서 걸린다 — 실제로 cut50/stage1 분리 때 492건으로 잡혔다.
        allowed = {'', 'avg', 'cut50', 'cut70', 'cut80', 'cut90', 'lowest', 'stage1'}
        bad_k = sum(1 for r in rows if r[iK] not in allowed)
        if bad_k:
            fails.append(f"stdK26에 정의되지 않은 값 {bad_k}건 — std_kind() 확인")

    # 6) 학과명에 '(외)' 잔존 금지 — 정원 외 채용조건형은 카테고리·배지로 노출한다.
    idp = col(sch, 'dept')
    stale = sorted({d['dicts']['dept'][r[idp]] for r in rows if '(외)' in d['dicts']['dept'][r[idp]]})
    if stale:
        fails.append(f"학과명에 '(외)' 잔존 {len(stale)}종: {stale} — build_data.py 정규화 확인")

    # 7) SEMI_CONTRACT_MASTER의 학과는 반드시 semiconductor_contract 카테고리에 잡혀야 함.
    iu = col(sch, 'uni'); ic = col(sch, 'cats')
    matched = {(d['dicts']['uni'][r[iu]], d['dicts']['dept'][r[idp]])
               for r in rows if 'semiconductor_contract' in r[ic]}
    # 2028판은 76교 — 화이트리스트의 대학이 데이터에 없으면(KAIST·UNIST 등) 매칭 대상이 아니다
    _unis = set(d['dicts']['uni'])
    missing = [(u, dp) for u, dp in SEMI_CONTRACT_MASTER if u in _unis and (u, dp) not in matched]
    if missing:
        fails.append(f"정원 외 채용조건형 매칭 누락 {len(missing)}건: {missing} — SEMI_CONTRACT_WHITELIST 확인")

    # 8) 완전중복 행 — (대학|학과|전형유형|전형명|지원자격)이 같은 행이 둘 이상.
    #    유래: 한양대 경제금융(8·17 개편 잔재)·대구가톨릭 유아교육(9·9 완전복제)이 실제로 있었고,
    #    둘 다 요강 대비 초과 집계였다. 엑셀이 갱신될 때마다 자동으로 걸리게 상시 검사로 둔다.
    #    ※ 정상 분할(인문/자연 등 같은 키로 두 줄인 경우)은 요강 총계로 확인한 뒤 화이트리스트에 넣는다.
    ijt = col(sch, 'jhtype'); ijn = col(sch, 'jhname'); ijg = col(sch, 'jagyeok')
    dup = {}
    for r in rows:
        k = (d['dicts']['uni'][r[iu]], d['dicts']['dept'][r[idp]], r[ijt],
             d['dicts']['jhname'][r[ijn]], d['dicts']['jagyeok'][r[ijg]])
        dup.setdefault(k, 0)
        dup[k] += 1
    dups = sorted(k for k, n in dup.items() if n > 1 and k[:4] not in DUP_OK)
    if dups:
        fails.append(f"완전중복 행 {len(dups)}종 — 요강 총계로 확인 후 실중복이면 data_corrections.json "
                     f"dedupe, 정상 분할이면 DUP_OK 등록: {[f'{a}|{b[:12]}|{c}|{e}' for a, b, c, e in (x[:4] for x in dups)][:8]}")

    # 9) 신설 전형은 과거 실적을 가질 수 없다.
    #    유래: 원천 엑셀 94행이 같은 학과 다른 전형의 값을 물려받았다. 아주대 의학과
    #    지역의사선발전형(2027 신설·권역당 1명)에 같은 학과 ACE전형의 경쟁률 27.1→34.2가 붙어
    #    '경쟁률 상승 = 불리' 판정까지 났다. 전년 실적은 학과가 아니라 학과×전형에 귀속된다.
    #    build_data.py가 비우므로 여기서는 그 작업이 실제로 됐는지만 확인한다.
    idk = col(sch, 'dkind'); ic26 = col(sch, 'c26'); ig26 = col(sch, 'g26')
    ich = [col(sch, k) for k in ('chung26', 'chung25', 'chung24')]
    ic = [col(sch, k) for k in ('c26', 'c25', 'c24')]
    ig = [col(sch, k) for k in ('g26', 'g25', 'g24')]
    leak = [r for r in rows if r[idk] == 'new' and (
        any(r[i] is not None for i in ic) or any(r[i] is not None for i in ig)
        or any(r[i] for i in ich))]
    if leak:
        fails.append(f"신설 전형에 과거 실적 잔존 {len(leak)}행 — build_data.py의 신설 실적 제거가 "
                     f"동작하지 않았다: {[(d['dicts']['uni'][r[iu]], d['dicts']['dept'][r[idp]][:10]) for r in leak][:6]}")

    # 10) 학과 단위로 복사된 경쟁률 탐지.
    #     같은 학과의 서로 다른 전형 3개 이상이 '소수점이 있는' 동일 경쟁률을 공유하면
    #     우연이 아니다(소수 1자리 이상은 분모가 제각각이라 3중 일치 확률이 사실상 0).
    #     정수값 일치는 소규모 전형에서 흔하므로 제외한다.
    from collections import defaultdict
    by_dept = defaultdict(lambda: defaultdict(set))
    for r in rows:
        v = r[ic26]
        if v is None or float(v) == int(float(v)):
            continue
        key = (d['dicts']['uni'][r[iu]], d['dicts']['dept'][r[idp]])
        by_dept[key][v].add((r[ijt], d['dicts']['jhname'][r[ijn]]))
    shared = [(k, v, len(s)) for k, m in by_dept.items() for v, s in m.items() if len(s) >= 3]
    if shared:
        fails.append(f"학과 단위 경쟁률 복사 의심 {len(shared)}건 — 한 학과의 전형 3개 이상이 같은 "
                     f"소수 경쟁률을 공유한다: {[(a, b[:10], v, n) for (a, b), v, n in shared][:5]}")

    # 11) 대학별고사 일자의 요일 검산 — 작년(2026학년도) 일정 잔존 탐지.
    #     '11.22(토)'처럼 날짜와 요일이 함께 적히는데, 2026년 달력으로 요일이 어긋나면
    #     대개 2025년 달력 기준이다(실제로 13종·112행이 전부 2025 요일과 일치했다).
    #     이 값으로 '수능 전/후'를 판정하면 틀리므로 app.js가 판정을 보류하고,
    #     여기서는 그 규모가 늘지 않는지만 감시한다(래칫).
    import datetime as _dt
    _DOW = ['월', '화', '수', '목', '금', '토', '일']   # datetime.weekday() 기준
    idt = col(sch, 'date')
    dic_date = d['dicts']['date']
    stale = set()
    for r in rows:
        v = r[idt]
        s_ = dic_date[v] if (v is not None and v < len(dic_date)) else ''
        for m in re.finditer(r'(\d{1,2})\.\s*(\d{1,2})\s*\(([^)]{1,3})\)', s_ or ''):
            mo, dy, dow = int(m.group(1)), int(m.group(2)), m.group(3).strip()
            try:
                real = _DOW[_dt.date(2026, mo, dy).weekday()]
            except ValueError:
                stale.add(s_); break
            if dow not in _DOW or real != dow:
                stale.add(s_); break
    STALE_DATE_MAX = 0      # 16종 전부 요강 원문 대조로 교정 완료(data_corrections.json 'date'). 늘어나면 새 회귀다.
    if len(stale) > STALE_DATE_MAX:
        fails.append(f"고사 일자 요일 불일치 {len(stale)}종 (허용 {STALE_DATE_MAX}) — "
                     f"작년 일정이 새로 섞였을 수 있다: {sorted(stale)[:6]}")

    return fails, {
        'rows': len(rows), 'uni': len(d['dicts']['uni']),
        'source': d['meta'].get('source', ''),
    }

# ---------------------------------------------------------------- 변경점 진단(--diff)
def key(row, d, sch):
    iu, idp, ijt, ijn, ija = (col(sch, x) for x in ('uni', 'dept', 'jhtype', 'jhname', 'jagyeok'))
    return (d['dicts']['uni'][row[iu]], d['dicts']['dept'][row[idp]], row[ijt],
            d['dicts']['jhname'][row[ijn]], d['dicts']['jagyeok'][row[ija]])

STR_FIELDS = {'change', 'choejeo', 'method', 'note'}
DIFF_FIELDS = ['enroll', 'prev', 'change', 'choejeo', 'hasChoejeo', 'chKind',
               'c26', 'c25', 'c24', 'g26', 'g25', 'g24', 'v26', 'v25', 'v24', 'method', 'note']

def resolve(row, f, d, sch):
    v = row[col(sch, f)]
    if f in STR_FIELDS and isinstance(v, int):
        return d['dicts'][f][v]
    return v

def diff(old, new):
    sch = old['schema']
    om, nm = {}, {}
    for r in old['rows']: om.setdefault(key(r, old, sch), []).append(r)
    for r in new['rows']: nm.setdefault(key(r, new, sch), []).append(r)
    changed = 0
    for k, orows in om.items():
        nrows = nm.get(k)
        if not nrows:
            continue
        o, n = orows[0], nrows[0]
        rd = [(f, resolve(o, f, old, sch), resolve(n, f, new, sch))
              for f in DIFF_FIELDS
              if resolve(o, f, old, sch) != resolve(n, f, new, sch)]
        if rd:
            changed += 1
            print(f"--- {k[0]} | {k[1]} | {k[3]}")
            for f, ov, nv in rd:
                print(f"    {f}: {ov!r} -> {nv!r}")
    added = [k for k in nm if k not in om]
    removed = [k for k in om if k not in nm]
    print(f"\n변경 {changed}행 · 신규 {len(added)}행 · 삭제 {len(removed)}행")

# ---------------------------------------------------------------- main
def main():
    data_js = os.path.join(HERE, 'data.js')
    if len(sys.argv) >= 3 and sys.argv[1] == '--diff':
        diff(load(sys.argv[2]), load(data_js))
        return
    fails, info = verify(load(data_js))
    if fails:
        print(f"검증 실패 ({len(fails)}건):")
        for m in fails:
            print(f"  ✗ {m}")
        sys.exit(1)
    print(f"OK  rows={info['rows']} uni={info['uni']}  {info['source']}")

if __name__ == '__main__':
    main()
