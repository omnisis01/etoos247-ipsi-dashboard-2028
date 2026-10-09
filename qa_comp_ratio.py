# 2026 경쟁률 산술 정합성 진단기 — 경쟁률 × 2026 모집인원 = 지원자(정수) 여야 한다.
# 사용법: python3 qa_comp_ratio.py [--list]
#
# ⚠️ 이 검사는 과거에 '전체 승격'을 시도했다가 정답 표본에서 오탐 12%가 나와 중단된 이력이 있다
#    (원인: 행마다 다른 반올림/절사 규약, 소수 자릿수 편차 — context-notes 참조).
#    그래서 두 가지 안전장치를 둔다.
#     ① 적용 범위 한정: 경쟁률이 소수 d자리면 지원자 추정 구간 폭은 e26×10^-d 다.
#        이 폭이 1 이상이면 어떤 정수든 들어가므로 검사가 무의미 → 아예 판정하지 않는다.
#     ② 규약 불문: 반올림(round)과 절사(truncate) 두 해석 중 하나라도 정수를 허용하면 통과.
#    → 남는 플래그만 '의심'으로 보고한다. 하드 실패로 승격하려면 오탐률을 먼저 측정할 것.
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def load_data():
    t = open(os.path.join(HERE, 'data.js'), encoding='utf-8').read()
    return json.loads(t[len('window.IPSI = '):-1])

def has_integer(lo, hi):
    """구간 [lo, hi] 안에 정수가 있나."""
    import math
    return math.floor(hi) >= math.ceil(lo)

def main():
    verbose = '--list' in sys.argv
    d = load_data()
    sch, rows = d['schema'], d['rows']
    i = {k: sch.index(k) for k in ('uni', 'dept', 'jhtype', 'jhname', 'jagyeok', 'enroll', 'c26')}
    dic = d['dicts']
    snap = json.load(open(os.path.join(HERE, 'enroll27.json'), encoding='utf-8'))['enroll27']   # 2028판: c 슬롯0=2027 경쟁률 ↔ 2027 인원
    # build_data.py가 2026 요강으로 확정한 인원 교정(_E26_OVERRIDES)을 여기서도 반영한다.
    # 원본 enroll26.json은 사용자 제공 스냅샷이라 손대지 않고, 교정만 겹쳐 읽는다.
    # 공유하지 않으면 이미 규명·교정한 행이 계속 '의심'으로 남아 래칫이 무뎌진다.
    import re as _re
    _bt = open(os.path.join(HERE, 'build_data.py'), encoding='utf-8').read()
    _blk = _re.search(r'_E26_OVERRIDES = \{(.*?)\n\}', _bt, _re.S)
    _ov = {}
    if _blk:
        for _m in _re.finditer(r"\('([^']+)', '([^']+)', '([^']+)', '([^']+)'\): (\d+)", _blk.group(1)):
            _ov[tuple(_m.group(i) for i in (1, 2, 3, 4))] = int(_m.group(5))
    if _ov:
        for _k in list(snap):
            _p = _k.split('|')
            if len(_p) >= 4 and tuple(_p[:4]) in _ov:
                snap[_k] = _ov[tuple(_p[:4])]
        print(f"  (2026 인원 교정 {len(_ov)}건 반영)")

    applicable = suspect = 0
    hits = []
    for r in rows:
        c26 = r[i['c26']]
        if c26 in (None, 0): continue
        key = '|'.join((dic['uni'][r[i['uni']]], dic['dept'][r[i['dept']]], r[i['jhtype']],
                        dic['jhname'][r[i['jhname']]], dic['jagyeok'][r[i['jagyeok']]]))
        e26 = snap.get(key)
        if not e26: continue                      # 2026 스냅샷에 없으면 판정 불가(개명·신설 등)

        s = repr(float(c26))
        dec = len(s.split('.')[1].rstrip('0')) if '.' in s else 0
        if dec == 0: continue                      # 정수 경쟁률은 구간폭이 너무 넓다
        halfw = 0.5 * (10 ** -dec)
        if e26 * (10 ** -dec) >= 1: continue       # ① 구간폭 ≥ 1 → 검사 무의미

        applicable += 1
        # ② 반올림 해석: applicants/e26 ∈ [c26-halfw, c26+halfw]
        ok = has_integer(e26 * (c26 - halfw), e26 * (c26 + halfw))
        # ② 절사 해석: applicants/e26 ∈ [c26, c26 + 10^-dec)
        if not ok:
            ok = has_integer(e26 * c26, e26 * (c26 + (10 ** -dec)) - 1e-9)
        if not ok:
            suspect += 1
            hits.append((key, c26, e26, dec))

    # ---- 래칫: 현재 의심 목록을 기준선으로 고정하고, 새로 늘어난 것만 실패로 본다.
    #      기존 37건은 개별 조사 대상(전년대비 마크가 틀릴 수 있는 행)이라 빌드를 막지 않는다.
    base_path = os.path.join(HERE, 'qa_comp_baseline.json')
    cur = sorted(k for k, *_ in hits)
    if '--save-baseline' in sys.argv:
        json.dump(cur, open(base_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(f"기준선 저장: {len(cur)}건 → {os.path.basename(base_path)}")
        return 0, applicable

    print(f"판정가능 {applicable}행 · 의심 {suspect}행"
          + (f" ({suspect/applicable*100:.1f}%)" if applicable else ""))
    if verbose:
        for key, c26, e26, dec in hits:
            u, dp, jt, jn = key.split('|')[:4]
            print(f"  {u} | {dp[:16]} | {jt} {jn[:14]} | 경쟁률 {c26}(소수{dec}) × 2026모집 {e26}")

    if os.path.exists(base_path):
        base = set(json.load(open(base_path, encoding='utf-8')))
        new = [k for k in cur if k not in base]
        gone = [k for k in base if k not in set(cur)]
        if gone:
            print(f"해소 {len(gone)}건 — 기준선 갱신 권장(--save-baseline)")
        if new:
            print(f"\nFAIL  신규 의심 {len(new)}건 (기준선 {len(base)}건 대비 증가):")
            for k in new[:15]:
                u, dp, jt, jn = k.split('|')[:4]
                print(f"  ✗ {u} | {dp[:16]} | {jt} {jn[:14]}")
            print("  → 2026 스냅샷(enroll26.json)·경쟁률·동명이단위 중 무엇이 어긋났는지 확인할 것.")
            sys.exit(1)
        print(f"OK  신규 의심 없음 (기준선 {len(base)}건 유지)")
    else:
        print("기준선 없음 — --save-baseline 으로 생성하면 이후 증가분만 감지한다.")
    return suspect, applicable

if __name__ == '__main__':
    main()
