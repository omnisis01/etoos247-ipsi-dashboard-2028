# 시행계획 PDF에서 뽑은 모집인원(parsed/<대학>.json)을 우리 2028 data.js 와 (모집단위×전형) 단위로 대조한다
"""
사용법  python3 tools/plan28/diff_plan28.py 서울대학교
입력    parsed/<대학>.json (parse_plan28.py) · ../../data.js · specs.json 의 jh_map (우리 전형명 → PDF 열 이름)
출력    diff/<대학>.json + 콘솔 요약. 판정은 사람이 한다 — 이 스크립트는 교정을 쓰지 않는다.

대조 단위는 (정규화한 모집단위명, PDF 열). 우리 쪽은 같은 모집단위·같은 열로 가는 행들의 인원을 더한다
(권역 분할 전형은 여러 행 → 한 열). PDF 열에 없는 우리 전형(jh_map 에 없음)은 '열 미매핑'으로 따로 센다.
단위명 정규화: 공백·중점·괄호 내용 제거, '학과/학부/전공' 접미 차이 무시(서울대 '물리·천문학부 물리학전공' ↔ 우리 '물리천문학부(물리학전공)').
"""
import json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.abspath(os.path.join(HERE, '..', '..'))
OUTD = os.path.join(HERE, 'diff')

def nz(t):
    t = re.sub(r'\(.*?\)|\[.*?\]', '', t or '')
    t = re.sub(r'[\s·ㆍ\-–/&,.]', '', t)
    return re.sub(r'(학과|학부|전공|계열|과)$', '', t)

def main(uni):
    parsed = json.load(open(os.path.join(HERE, 'parsed', f'{uni}.json'), encoding='utf-8'))
    # 사양은 specs/<대학>.json 이 있으면 그것, 없으면 specs.json 의 항목(대학별 파일은 여러 작업자가 동시에 써도 충돌하지 않는다)
    _pf = os.path.join(HERE, 'specs', f'{uni}.json')
    sp = json.load(open(_pf, encoding='utf-8')) if os.path.exists(_pf) else json.load(open(os.path.join(HERE, 'specs.json'), encoding='utf-8'))[uni]
    jh_map, susi_cols = sp.get('jh_map', {}), sp['susi']
    t = open(os.path.join(DASH, 'data.js'), encoding='utf-8').read()
    d = json.loads(t[len('window.IPSI = '):-1]); sch, dc = d['schema'], d['dicts']
    ix = {k: sch.index(k) for k in ('uni', 'dept', 'jhname', 'jhtype', 'enroll')}

    # 우리 쪽 — (단위, 열) 합계. 전형명 매핑은 정확 일치 → 괄호 제거 일치 → 접두 일치 순
    ours, unmapped, our_depts = collections.Counter(), collections.Counter(), {}
    def col_for(jh):
        if jh in jh_map: return jh_map[jh]
        b = re.sub(r'\(.*?\)', '', jh)
        if b in jh_map: return jh_map[b]
        return next((c for k, c in jh_map.items() if b.startswith(re.sub(r'\(.*?\)', '', k))), None)
    for r in d['rows']:
        if dc['uni'][r[ix['uni']]] != uni: continue
        dept, jh, e = dc['dept'][r[ix['dept']]], dc['jhname'][r[ix['jhname']]], int(r[ix['enroll']] or 0)
        k = nz(dept); our_depts.setdefault(k, dept)
        c = col_for(jh)
        if c is None: unmapped[jh] += e; continue
        ours[(k, c)] += e

    # 우리 '학부-전공' 표기의 전공 부분만으로도 PDF 단위를 받는다(PDF 는 학부 아래 '천문학전공'처럼 전공만 적는다)
    alias = {}
    for k, dept in our_depts.items():
        if '-' in dept:
            suf = nz(dept.split('-', 1)[1])
            if suf and suf not in our_depts: alias.setdefault(suf, k)
    # PDF 쪽
    pdf, pdf_depts = collections.Counter(), {}
    for row in parsed['rows']:
        k = nz(row['dept']); k = k if k in our_depts else alias.get(k, k); pdf_depts.setdefault(k, row['dept'])
        for c in susi_cols:
            v = row['cols'].get(c)
            if v: pdf[(k, c)] += v

    keys = set(pdf) | set(ours)
    only_pdf = sorted((k, c, pdf[(k, c)]) for k, c in keys if (k, c) in pdf and (k, c) not in ours)
    only_ours = sorted((k, c, ours[(k, c)]) for k, c in keys if (k, c) in ours and (k, c) not in pdf)
    differ = sorted((k, c, pdf[(k, c)], ours[(k, c)]) for k, c in keys if (k, c) in pdf and (k, c) in ours and pdf[(k, c)] != ours[(k, c)])
    same = sum(1 for k, c in keys if (k, c) in pdf and (k, c) in ours and pdf[(k, c)] == ours[(k, c)])
    dept_only_pdf = sorted(set(k for k, _ in pdf) - set(k for k, _ in ours))
    dept_only_ours = sorted(set(k for k, _ in ours) - set(k for k, _ in pdf))
    out = {'uni': uni, 'pdf_total': sum(pdf.values()), 'ours_total': sum(ours.values()) + sum(unmapped.values()),
           'ours_mapped_total': sum(ours.values()), 'same': same,
           'differ': [{'dept': pdf_depts.get(k) or our_depts.get(k), 'col': c, 'pdf': a, 'ours': b} for k, c, a, b in differ],
           'only_pdf': [{'dept': pdf_depts[k], 'col': c, 'pdf': v, 'dept_missing': k in dept_only_pdf} for k, c, v in only_pdf],
           'only_ours': [{'dept': our_depts[k], 'col': c, 'ours': v, 'dept_missing': k in dept_only_ours} for k, c, v in only_ours],
           'unmapped_jh': dict(unmapped)}
    os.makedirs(OUTD, exist_ok=True)
    json.dump(out, open(os.path.join(OUTD, f'{uni}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"[diff_plan28] {uni}: PDF 수시 {out['pdf_total']:,} vs 우리 {out['ours_total']:,}(매핑 {out['ours_mapped_total']:,})"
          f" · 일치 {same} · 인원 상이 {len(differ)} · PDF에만 {len(only_pdf)} · 우리에만 {len(only_ours)} · 열 미매핑 전형 {len(unmapped)}")
    for x in out['differ'][:12]: print(f"   ≠ {x['dept'][:18]:20s} {x['col']:6s} PDF {x['pdf']:>4} / 우리 {x['ours']:>4}")
    for x in out['only_pdf'][:12]: print(f"   +PDF {x['dept'][:18]:20s} {x['col']:6s} {x['pdf']:>4}" + ('  ← 단위 자체가 우리에 없음' if x['dept_missing'] else ''))
    for x in out['only_ours'][:8]: print(f"   +우리 {x['dept'][:18]:20s} {x['col']:6s} {x['ours']:>4}" + ('  ← 단위 자체가 PDF에 없음' if x['dept_missing'] else ''))
    for jh, e in list(unmapped.items())[:6]: print(f"   ? 열 미매핑 전형 {jh} {e}명 — specs.jh_map 에 추가할 것")
    return out

if __name__ == '__main__':
    for u in sys.argv[1:]: main(u)
