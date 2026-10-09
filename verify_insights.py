# insights.js의 모집인원 숫자를 마스터 엑셀과 대조하는 하네스.
# 유래: 에이전트가 권역별로 쪼개진 행 하나를 전형 총원으로 착각한 오류 6건이 실제로 발생했고,
#       초기 검증기가 "어느 한 행이라도 그 숫자면 통과"라 이를 못 걸렀다. 그래서 '합계 비교'를 강제한다.
# 사용법: python3 verify_insights.py            (불일치 있으면 exit 1)
#        python3 verify_insights.py --list     (스킵 사유까지 전부 출력)
import json, re, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '입결 및 인사이트', '2028학년도 수시지원의 모든 것_전형계획기준_v1.xlsx')   # 2028판: adapt_2028.py 산출
INS = os.path.join(HERE, 'insights.js')

# 자동 대조가 불가능해 의도적으로 건너뛰는 라벨(사유 명시).
#  - 정시·총계: 엑셀(수시)에 없음
#  - 'ㄴ' 접두: 상위 행의 하위 항목이라 단독으로 스코프 불가
SKIP_PAT = re.compile(r'정시|나군|가군|다군|수시 전체|의대 정원|총 모집|의학과 총|^ㄴ\s')

GYE = [
    ('치의예',      lambda d: '치의' in d),
    ('한의예',      lambda d: '한의' in d and '한약' not in d),
    ('한의학',      lambda d: '한의' in d),
    ('수의예',      lambda d: '수의' in d),
    # '의학과'를 substring으로 보면 '스프츠의학과'까지 잡혀 합계가 부풀었다 → 학과명 자체를 정확히 매칭
    ('의예',        lambda d: bool(re.fullmatch(r'(의예과|의학과|의학과\(의예과\))(\(.+\))?', d))),
    ('약학부',      lambda d: '약학' in d),
    ('첨단약과학',  lambda d: '약과학' in d),
    ('약학',        lambda d: '약학' in d),
    ('한약학과',    lambda d: '한약' in d),
    ('한약',        lambda d: '한약' in d),
    ('바이오제약',  lambda d: '제약' in d),
]
JHT = [(r'\(교과\)|학생부교과|\s교과\b|교과$', '학생부교과'),
       (r'\(종합\)|학생부종합|\s종합\b|종합$', '학생부종합'),
       (r'논술', '논술'), (r'실기', '실기/실적')]

def nz(t): return re.sub(r'[\s()·,/\-]|전형$', '', t or '')

# (A) 2.5라운드 모집인원 교정 — data_corrections.json을 build_data.py와 공유한다.
# 인사이트 숫자는 교정 후 값을 쓰므로, 대조 기준인 엑셀도 동일하게 교정해야 일치한다.
_CORR = json.load(open(os.path.join(HERE, 'data_corrections.json'), encoding='utf-8'))

def load_excel():
    import openpyxl
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    def s(v): return '' if v is None else str(v).strip()
    def num(v):
        try: return int(float(str(v)))
        except: return 0
    out = []
    for r in wb['전체'].iter_rows(min_row=4, values_only=True):
        if not s(r[2]): continue
        # 학과명 '(외)' 제거 — build_data.py와 동일 정규화(교정 키 매칭용)
        out.append({'uni': s(r[2]), 'dept': s(r[4]).replace('(외)', '').strip(),
                    'jht': s(r[5]), 'jhn': s(r[6]), 'e': num(r[8])})
    # 교정 적용: 값 수정 / 유령 행 제거 / 누락 행 추가
    ec = {(c['uni'], c['dept'], c['jht'], c['jhn']): (c['old'], c['new']) for c in _CORR['enroll']}
    # 같은 키에 행이 둘인 경우가 있어 선택 'e'(모집인원)로 특정한다 — build_data.py와 동일 규칙.
    drop = {}
    for c in _CORR['drop']:
        if c.get('dedupe'): continue
        drop.setdefault((c['uni'], c['dept'], c['jht'], c['jhn']), set()).add(c.get('e'))
    # 완전 중복 행 제거 — build_data.py와 동일하게 첫 행만 남긴다.
    dedupe = {(c['uni'], c['dept'], c['jht'], c['jhn']) for c in _CORR['drop'] if c.get('dedupe')}
    seen_dup = set()
    kept = []
    for x in out:
        k = (x['uni'], x['dept'], x['jht'], x['jhn'])
        if k in drop and (None in drop[k] or x['e'] in drop[k]): continue
        if k in dedupe:
            if k in seen_dup: continue
            seen_dup.add(k)
        if k in ec and x['e'] == ec[k][0]: x['e'] = ec[k][1]
        kept.append(x)
    for a in _CORR['add']:
        kept.append({'uni': a['uni'], 'dept': a['dept'], 'jht': a['jht'], 'jhn': a['jhn'], 'e': a['e']})
    return kept

def resolve(pool, lbl):
    """라벨 → (전형명, 합계, 스코프행수) 해석. 실패 시 (None, 사유, 0).
       'to'(V7.24 엑셀)와 'from'(2026 ver8.2 스냅샷) 검증이 이 한 함수를 공유한다 —
       매칭 로직이 두 벌이면 서로 어긋나는 순간 검증 자체를 못 믿는다."""
    scope = pool
    gk = next((k for k, f in GYE if lbl.startswith(k)), None)
    if gk:
        f = next(f for k, f in GYE if k == gk)
        scope = [x for x in scope if f(x['dept'])]
    for pat, val in JHT:
        if re.search(pat, lbl):
            scope = [x for x in scope if x['jht'] == val]; break
    mgye = re.search(r'\((자연|인문)\)', lbl)
    if mgye: scope = [x for x in scope if mgye.group(1) in x['dept']]
    core = lbl[len(gk):] if gk else lbl
    core = re.sub(r'^ㄴ\s*', '', core)
    depts = {x['dept'] for x in scope}
    dhit = [d for d in depts if d and len(d) >= 3 and nz(d) in nz(core)]
    unresolved = None
    if not dhit:
        for kw in ('자유전공', '무전공', '경영대학', '과학기술대학', '글로벌융합대학', '인문사회', '자연공학', '유아교육'):
            if kw in core:
                cand = [x for x in scope if kw in x['dept']] or [x for x in scope if '자유전공' in x['dept']]
                if cand: scope = cand; core = core.replace(kw, '')
                else: unresolved = kw
                break
    elif len(dhit) >= 1:
        d0 = max(dhit, key=len)
        scope = [x for x in scope if x['dept'] == d0]
        core = re.sub(re.escape(d0), '', core)
    core = nz(re.sub(r'\s(교과|종합|논술)\b', '', re.sub(r'\((교과|종합|논술|실기|자연|인문)\)|—', '', core)))
    if unresolved: return None, f'학과 수식어 "{unresolved}" 미해결 — 스코프 불명', 0
    if not core or not scope: return None, '스코프/전형명 추출 불가', 0
    names = {}
    for x in scope: names[x['jhn']] = names.get(x['jhn'], 0) + x['e']
    hits = [k for k in names if nz(k) == core] or \
           [k for k in names if core and (core in nz(k) or nz(k) in core) and abs(len(nz(k)) - len(core)) <= 6]
    if len(hits) != 1: return None, f'전형명 유일매칭 실패(후보 {len(hits)})', 0
    return hits[0], names[hits[0]], len(scope)


def load_enroll26():
    """ver8.2 스냅샷 + build_data의 _E26_OVERRIDES(요강 확정 교정)를 겹쳐 2026 인원 행을 만든다."""
    snap = json.load(open(os.path.join(HERE, 'enroll27.json'), encoding='utf-8'))['enroll27']   # 2028판: from 축 = 2027
    bt = open(os.path.join(HERE, 'build_data.py'), encoding='utf-8').read()
    blk = re.search(r'_E26_OVERRIDES = \{(.*?)\n\}', bt, re.S)
    ov = {}
    if blk:
        for m in re.finditer(r"\('([^']+)', '([^']+)', '([^']+)', '([^']+)'\): (\d+)", blk.group(1)):
            ov[tuple(m.group(i) for i in (1, 2, 3, 4))] = int(m.group(5))
    out = []
    for k, v in snap.items():
        ps = k.split('|')
        if len(ps) < 4: continue
        e = ov.get(tuple(ps[:4]), v)
        out.append({'uni': ps[0], 'dept': ps[1].replace('(외)', '').strip(), 'jht': ps[2], 'jhn': ps[3], 'e': e})
    return out


def load_insights():
    p = subprocess.run(['node', '-e', f'global.window={{}};require({json.dumps(INS)});process.stdout.write(JSON.stringify(window.IPSI_INSIGHTS))'],
                       capture_output=True, text=True)
    if p.returncode != 0:
        print('ERROR: insights.js 로드 실패\n', p.stderr); sys.exit(2)
    return json.loads(p.stdout)

def main():
    verbose = '--list' in sys.argv
    # 원천 엑셀이 없으면(리포만 클론한 환경) 실패가 아니라 건너뛴다.
    # 탐지는 os.path.exists로 한다 — macOS는 파일명을 NFD로 저장해 glob(NFC 리터럴)은 못 찾지만
    # open/exists는 파일시스템이 정규화해 주므로 정상 동작한다.
    if not os.path.exists(SRC):
        print(f'SKIP  원천 엑셀 없음({os.path.basename(SRC)}) — 인사이트 대조 건너뜀')
        sys.exit(0)
    rows, ins = load_excel(), load_insights()
    mism, okc, skips = [], 0, []
    rows26 = load_enroll26()
    pool26_by_uni = {}
    for x in rows26: pool26_by_uni.setdefault(x['uni'], []).append(x)
    mism26, okc26, skips26 = [], 0, []
    # 0) 행 내부 정합성: from + 증감(note ▲/▼) = to, dir 방향 일치.
    #    실제 사고: 인하대 면접형 from이 면접+서류 합(1,186)으로 적혀 note가 깨졌고,
    #    인하대 지역균형 ▲를 ▼로 적는 수기 실수도 있었다. 산수는 기계가 검사한다.
    inconsist = []
    for u in ins['order']:
        for sec in ins['unis'][u].get('sections', []):
            for row in sec.get('rows', []) or []:
                f, t, n = str(row.get('from', '')), str(row.get('to', '')), str(row.get('note', ''))
                mf, mt = re.match(r'^([\d,]+)명', f), re.match(r'^([\d,]+)명', t)
                mn = re.match(r'^([▲▼])(\d+)', n)
                if not (mf and mt and mn): continue
                a, b = int(mf.group(1).replace(',', '')), int(mt.group(1).replace(',', ''))
                d = (1 if mn.group(1) == '▲' else -1) * int(mn.group(2))
                dir_ok = (d > 0 and row.get('dir') == 'up') or (d < 0 and row.get('dir') == 'down') or (d == 0 and row.get('dir') == 'same')
                if a + d != b or not dir_ok:
                    inconsist.append(f"[{u}] {row.get('label')}: {f}→{t} [{n}] dir={row.get('dir')} (from+증감={a+d})")
    if inconsist:
        print(f'FAIL  행 내부 정합성 위반 {len(inconsist)}건 (from+증감≠to 또는 dir 불일치)')
        for x in inconsist: print('  ' + x)
        sys.exit(1)
    for u in ins['order']:
        pool = [x for x in rows if x['uni'] == u]
        if not pool:
            skips.append((u, '-', '엑셀에 대학 없음')); continue
        for sec in ins['unis'][u].get('sections', []):
            for row in sec.get('rows', []) or []:
                lbl = row.get('label', ''); to = str(row.get('to', '')).strip()
                m = re.match(r'^([\d,]+)명', to)
                if not m: continue
                if SKIP_PAT.search(lbl): skips.append((u, lbl, '정시/총계 등 엑셀 범위 밖')); continue
                want = int(m.group(1).replace(',', ''))
                jhn, got, nrow = resolve(pool, lbl)
                if jhn is None: skips.append((u, lbl, got)); continue
                if got == want: okc += 1
                else: mism.append((u, lbl, jhn, want, got, nrow))
                # ── 'from'(2026) 검증 — 같은 resolve()로 ver8.2 스냅샷과 대조.
                #    2027(to)만 보면 반쪽이다. from이 틀리면 증감(▲▼) 서사 전체가 흔들린다.
                mf = re.match(r'^([\d,]+)명', str(row.get('from', '')).strip())
                if mf and pool26_by_uni.get(u):
                    want26 = int(mf.group(1).replace(',', ''))
                    jhn26, got26, nrow26 = resolve(pool26_by_uni[u], lbl)
                    # 신설(from=0) 처리 — 2026 풀에 그 전형이 없어야 정상인데, resolve()의
                    # 부분일치가 이름이 비슷한 기존 전형을 잡아 오탐을 낸다(중앙대 논술(창의형)이
                    # '논술전형' 484명에 붙었다). 0명 주장은 정확일치 전형이 없으면 '확인'으로 친다.
                    if want26 == 0:
                        exact = jhn26 is not None and nz(jhn26) == nz(lbl)
                        if jhn26 is None or not exact: okc26 += 1
                        else: mism26.append((u, lbl, jhn26, want26, got26, nrow26))
                    elif jhn26 is None: skips26.append((u, lbl, got26))
                    elif got26 == want26: okc26 += 1
                    else: mism26.append((u, lbl, jhn26, want26, got26, nrow26))
    if mism:
        print(f'FAIL  인사이트 모집인원 불일치 {len(mism)}건 (일치 {okc} · 스킵 {len(skips)})')
        for u, lbl, k, w, g, nrow in sorted(mism, key=lambda x: -abs(x[3] - x[4])):
            print(f'  [{u}] {lbl}: 인사이트 {w}명 / 엑셀 {g}명 ({w-g:+d})  ←"{k}" {nrow}행 합계')
    else:
        print(f'OK  인사이트 모집인원 {okc}건 엑셀과 일치 · 스킵 {len(skips)}건')
    if mism26:
        print(f'FAIL  인사이트 2026(from) 불일치 {len(mism26)}건 (일치 {okc26} · 스킵 {len(skips26)})')
        for u, lbl, k, w, g, nrow in sorted(mism26, key=lambda x: -abs(x[3] - x[4])):
            print(f'  [{u}] {lbl}: 인사이트 {w}명 / 스냅샷 {g}명 ({w-g:+d})  ←"{k}" {nrow}행 합계')
        sys.exit(1)
    else:
        print(f'OK  인사이트 2026(from) {okc26}건 스냅샷과 일치 · 스킵 {len(skips26)}건')
    if verbose:
        print('\n--- 스킵 목록 ---')
        for u, l, why in skips: print(f'  [{u}] {l} — {why}')
    sys.exit(1 if mism else 0)

if __name__ == '__main__':
    main()
