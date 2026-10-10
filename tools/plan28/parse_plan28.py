# 시행계획 PDF 레이아웃 텍스트에서 수시 모집단위×전형 모집인원 표를 뽑는다 — 열은 가로 위치(x)로 배정, 사양은 specs.json
"""
사용법
  python3 tools/plan28/parse_plan28.py --header 서울대학교        # 표 머리 부분을 자 눈금과 함께 출력 → specs.json 에 x 범위를 적는다
  python3 tools/plan28/parse_plan28.py 서울대학교                 # specs.json 사양으로 추출 → plan28_parsed/<대학>.json

왜 x 위치인가 — 대학마다 열 순서·개수가 다르고(연세대는 전형 고정 순서, 고려대는 단과대·계열 열이 앞, 성균관대는 열이 띄엄띄엄
비어 있음) 숫자 개수로 열을 맞추면 빈 칸이 있는 행에서 어긋난다. pdftotext -layout 은 글자 위치를 보존하므로 헤더 열의 x 범위에
숫자의 x 를 대면 빈 칸이 있어도 맞는다.

specs.json 의 한 대학 사양
  {"서울대학교": {
     "start": "2028학년도 모집단위와 모집인원",      # 표 시작을 찾는 정규식(첫 매치)
     "end":   "^\\s*합계\\s",                       # 표 끝(이 줄 포함) — 없으면 start 뒤 400줄
     "cols":  {"지역균형": [28, 36], "일반": [38, 48], "기회균형": [50, 62], "정시": [64, 74], "합계": [76, 86]},
     "susi":  ["지역균형", "일반", "기회균형"],    # 수시로 합산할 열
     "skip":  "^(소계|합계|계)$",                  # 단위명으로 보지 않을 것
     "name_min_x": 0, "name_max_x": 27             # 단위명이 놓이는 x 범위(단과대 라벨 열을 거르는 용도)
  }}
출력 JSON: {"uni", "rows": [{"dept", "line", "cols": {열: 숫자|null}, "susi": 수시합}], "notes": [...]}
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.abspath(os.path.join(HERE, '..', '..'))
TXT = os.path.join(DASH, '..', '입결 및 인사이트', '2028_시행계획_PDF')
OUTD = os.path.join(HERE, 'parsed')
NUM = re.compile(r'(?<![\d,.])(\d{1,3}(?:,\d{3})*|\d+)(?![\d,])|·|-')   # 숫자 또는 빈칸 기호
KOR = re.compile(r'[가-힣A-Za-z·&\-()\[\]/]+')

def lines_of(uni):
    p = os.path.join(TXT, f'{uni}.txt')
    if not os.path.exists(p): sys.exit(f'[중단] {p} 없음 — fetch_plan28.py 먼저')
    return open(p, encoding='utf-8').read().split('\n')

def disp_x(s, i):
    """문자열 s 의 i 번째 문자가 놓이는 표시 폭(한글 2칸) — 헤더와 숫자의 x 를 같은 자로 잰다"""
    return sum(2 if ord(c) > 0x2E7F else 1 for c in s[:i])

def header_mode(uni, n=40):
    L = lines_of(uni); specs = load_specs()
    sp = specs.get(uni, {}); start = sp.get('start', '모집단위')
    i = next((k for k, l in enumerate(L) if re.search(start, l)), 0)
    ruler = ''.join(str(d % 10) for d in range(0, 130))
    tens = ''.join((str(d // 10) if d % 10 == 0 else ' ') for d in range(0, 130))
    print(f'  x:  {tens}\n  x:  {ruler}')
    for l in L[i:i + n]:
        # 표시 폭 기준으로 정렬해서 보여 준다(한글 2칸)
        out, w = [], 0
        for c in l:
            cw = 2 if ord(c) > 0x2E7F else 1
            out.append(c); w += cw
        print(f'{"":5}' + l.rstrip()[:130])
    print('\n  ※ 한글은 2칸 폭으로 센다. 숫자가 놓인 x 범위를 cols 에 적을 것(여유 ±2).')

def load_specs():
    p = os.path.join(HERE, 'specs.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}

def parse(uni):
    # 사양은 specs/<대학>.json 이 있으면 그것, 없으면 specs.json 의 항목 — 대학별 파일은 여러 작업자가 동시에 써도 충돌하지 않는다
    _pf = os.path.join(HERE, 'specs', f'{uni}.json')
    sp = json.load(open(_pf, encoding='utf-8')) if os.path.exists(_pf) else load_specs().get(uni)
    if not sp: sys.exit(f'[중단] specs/{uni}.json 도 specs.json 항목도 없다 — --header 로 보고 적을 것')
    L = lines_of(uni)
    s = next((k for k, l in enumerate(L) if re.search(sp['start'], l)), None)
    if s is None: sys.exit(f'[중단] start 패턴 미발견: {sp["start"]}')
    endre = re.compile(sp['end']) if sp.get('end') else None
    skip = re.compile(sp.get('skip', '^(소계|합계|계)$'))
    # cols 값이 숫자면 '열 중심 x'(가장 가까운 열로 배정, 최대 거리 max_dist), 두 수면 [시작,끝] 범위.
    # 실측(서울대): 숫자가 오른쪽 정렬이라 토큰 시작 x 가 자릿수에 따라 ±4 흔들린다 — 범위로는 겹치고 중심으로는 전부 맞는다.
    cols = {k: (v if isinstance(v, (int, float)) else tuple(v)) for k, v in sp['cols'].items()}
    maxd = sp.get('max_dist', 6)
    def col_of(x):
        best, bd = None, 10 ** 9
        for c, v in cols.items():
            if isinstance(v, tuple):
                if v[0] <= x <= v[1]: return c
            else:
                d = abs(x - v)
                if d < bd: best, bd = c, d
        return best if bd <= maxd else None
    nmin, nmax = sp.get('name_min_x', 0), sp.get('name_max_x', 30)
    rows, subs, notes, pending = [], [], [], None
    # 헤더 블록은 'after' 패턴(마지막 헤더 줄)을 지난 뒤부터 데이터로 본다 — 헤더 낱말('균형')과 각주 번호('9)')가 행으로 잡혔다
    afterre = re.compile(sp['after']) if sp.get('after') else None
    started = afterre is None
    block = []                                                         # 소계 검산용 — 직전 소계 이후의 단위 행
    for k in range(s + 1, min(len(L), s + sp.get('max_lines', 600))):
        l = re.sub(r'\(\d[^)]*\)+', ' ', L[k])        # '183(48))' 같은 숫자 괄호 주석 제거 — 이름의 괄호(의학과(의예과))는 남긴다
        l = re.sub(r'(?<=[가-힣A-Za-z)])\d\)', '  ', l)  # '광역1)'·'특별전형9)' 같은 괄호 없는 각주 번호 — 숫자로 읽히면 열이 한 칸 민다
        if not started:
            if afterre.search(l): started = True
            continue
        if endre and endre.search(l) and k > s + 3:
            notes.append(f'end at line {k + 1}')
        # 단위명 = 첫 숫자 앞의 글자 토큰들(단과대 라벨 열 x<name_min_x 는 제외). 숫자 = 마지막 이름 토큰 뒤의 전부.
        # ⚠️ 숫자를 x 로 거르면 안 된다 — 소계 줄은 들여쓰기가 달라 첫 숫자(59)가 name_max_x 안에 와서 버려졌다(2026-10-10 실측).
        # ⚠️ 이름 안의 '·'(물리·천문학부)를 빈칸 기호로 읽으면 이름이 앞에서 끊긴다 — 글자 토큰 안에 든 NUM 매치는 숫자가 아니다
        spans = [(m.start(), m.end()) for m in KOR.finditer(l) if re.search(r'[가-힣A-Za-z]', m.group(0))]   # 홀로 선 '·'는 빈칸 기호
        inside = lambda i: any(a <= i < b for a, b in spans)
        first_num = next((m.start() for m in NUM.finditer(l) if not inside(m.start())), len(l))
        names = [(m.start(), m.group(0)) for m in KOR.finditer(l)
                 if m.start() < first_num and disp_x(l, m.start()) >= nmin and re.search(r'[가-힣A-Za-z]', m.group(0))]
        name_end = max((b for a, b in spans if a < first_num), default=0)
        nums = [(disp_x(l, m.start()), m.group(0)) for m in NUM.finditer(l) if m.start() >= name_end]
        name = ' '.join(t for _, t in names).strip()
        name = re.sub(r'\s*\d\)\s*$|[·\-\s]+$', '', name)              # 각주 번호·꼬리 구두점
        is_sub = bool(skip.search(name)) if name else False
        if name and not nums:
            pending = None if is_sub else name                         # 다음 줄에 숫자가 오는 2줄 단위명
            continue
        if not nums: continue
        if not name and pending: name = pending
        pending = None
        if not name: continue
        vals = {}
        if sp.get('order'):
            # 위치 모드 — 쪽마다 열 x 가 밀리는 표(서울대: 첫 쪽 지역균형 31~36, 공대 쪽 26~29)는 x 로 배정하면 어긋난다.
            # 모든 행에 열 개수만큼 토큰(숫자 또는 ·)이 있으면 행 안의 순서로 배정한다. 토큰 수가 사양과 다르면 기록만 하고 건너뛴다.
            order = sp['order']; toks = [v for _, v in nums]
            # 허용 토큰 수 [최소, 최대] — 정원외 열이 일부만 찍힌 행(체육교육과 7개·음악학과 6개)은 앞 열만 쓰면 되므로 받는다.
            lo, hi = sp.get('order_range', [len(sp['susi']), len(order)])
            if len(toks) < lo:
                notes.append(f'L{k + 1} {name}: 토큰 {len(toks)}개(<{lo}) — 건너뜀'); continue
            if len(toks) > hi: notes.append(f'L{k + 1} {name}: 토큰 {len(toks)}개(>{hi}) — 앞 {len(order)}개만 사용')
            for c, v in zip(order, toks): vals[c] = None if v in ('·', '-') else int(v.replace(',', ''))
        else:
            for x, v in nums:
                col = col_of(x)
                if col is None: continue
                vals[col] = None if v in ('·', '-') else int(v.replace(',', ''))
        if not any(v is not None for v in vals.values()): continue
        susi = sum(vals.get(c) or 0 for c in sp['susi'])
        if is_sub:
            # 소계 행 — 블록 검산: 직전 소계 이후 단위 행의 수시 합이 소계와 같아야 한다.
            # 표 끝의 합계 행은 블록이 아니라 **전체 행 합**과 검산한다(소계 없이 끝나는 단과대가 있다).
            is_end = bool(endre and endre.search(l))
            pool = rows if is_end else block
            got = sum(r['susi'] for r in pool)
            # 소계 없는 단과대(간호·경영 등 1단위)가 앞에 끼면 블록이 길어진다 — 뒤에서부터 맞는 접미 블록을 찾는다
            lead = 0
            while not is_end and got != susi and lead < len(pool) - 1:
                got -= pool[lead]['susi']; lead += 1
            pool = pool[lead:]
            subs.append({'label': name, 'line': k + 1, 'susi': susi, 'block_sum': got, 'n': len(pool),
                         'ok': got == susi, 'skipped_lead': lead, 'depts': [r['dept'] for r in pool]})
            block = []
            if is_end: break
            continue
        row = {'dept': name, 'line': k + 1, 'cols': vals, 'susi': susi}
        rows.append(row); block.append(row)
    os.makedirs(OUTD, exist_ok=True)
    out = {'uni': uni, 'rows': rows, 'subtotals': subs, 'notes': notes, 'spec': sp}
    json.dump(out, open(os.path.join(OUTD, f'{uni}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    tot = sum(r['susi'] for r in rows)
    bad = [b for b in subs if not b['ok']]
    print(f'[parse_plan28] {uni}: {len(rows)}행 · 수시 합 {tot:,} · 소계 검산 {len(subs) - len(bad)}/{len(subs)} 블록 일치 · {" · ".join(notes)}')
    for b in bad:
        print(f'   ✗ L{b["line"]} {b["label"]} {b["susi"]} ≠ 블록 합 {b["block_sum"]} ({b["n"]}단위): {", ".join(b["depts"][:8])}')
    for r in rows[:4]: print(f'   {r["dept"][:16]:18s} {r["cols"]}  수시 {r["susi"]}')
    return out

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if a[0] == '--header': header_mode(a[1], int(a[2]) if len(a) > 2 else 40)
    elif a[0] == '--xs':
        # 헤더·데이터 행의 토큰별 표시 x 를 찍는다 — 눈으로 자를 세지 않고 cols 범위를 읽어 적기 위한 모드
        uni = a[1]; n = int(a[2]) if len(a) > 2 else 24
        L = lines_of(uni); sp = load_specs().get(uni, {}); start = sp.get('start', '모집단위')
        i = (int(a[3]) - 1) if len(a) > 3 else next((k for k, l in enumerate(L) if re.search(start, l)), 0)   # 4번째 인자 = 시작 줄 번호
        for k, l in enumerate(L[i:i + n], i + 1):
            toks = [(disp_x(l, m.start()), m.group(0)) for m in re.finditer(r'\S+', l)]
            if toks: print(f'  L{k}: ' + '  '.join(f'{x}:{t}' for x, t in toks)[:150])
    else:
        for u in a: parse(u)
