# 2026 추합(충원합격) 산술 정합성 진단기 — 추합자는 '지원자 − 모집인원'을 넘을 수 없다.
# 사용법: python3 qa_chungwon.py [--list] [--save-baseline]
#
# 근거: 최초합격자 수 = 모집인원이고, 충원합격은 그 바깥의 지원자 중에서만 나온다.
#       따라서 chung26 ≤ (지원자 − 모집인원). 지원자는 경쟁률 × 2026 모집인원으로 추정한다.
#
# ⚠️ 오탐 방지 장치 두 가지.
#   ① 경쟁률은 반올림된 값이라 지원자 추정에 상한 여유를 준다(소수 d자리 → +0.5×10^-d).
#   ② 그 위에 tol=1명을 더 얹는다. 모집인원 사후조정·정원 이월 같은 1명 단위 흔들림을 흡수한다.
#      (이 여유가 없으면 원광대·동신대처럼 딱 1명 초과하는 반올림 잔여가 전부 의심으로 뜬다.)
# 경쟁률·추합 중 어느 쪽이 틀렸는지는 이 검사로 가릴 수 없다. '의심'까지가 이 스크립트의 역할이다.
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOL = 1.0


def load_e26():
    """2026 모집인원 스냅샷 + build_data.py의 요강 확정 교정(_E26_OVERRIDES)을 겹쳐 읽는다."""
    snap = json.load(open(os.path.join(HERE, 'enroll26.json'), encoding='utf-8'))['enroll26']
    bt = open(os.path.join(HERE, 'build_data.py'), encoding='utf-8').read()
    blk = re.search(r'_E26_OVERRIDES = \{(.*?)\n\}', bt, re.S)
    ov = {}
    if blk:
        for m in re.finditer(r"\('([^']+)', '([^']+)', '([^']+)', '([^']+)'\): (\d+)", blk.group(1)):
            ov[tuple(m.group(i) for i in (1, 2, 3, 4))] = int(m.group(5))
    return snap, ov


def main():
    verbose = '--list' in sys.argv
    t = open(os.path.join(HERE, 'data.js'), encoding='utf-8').read()
    d = json.loads(t[len('window.IPSI = '):-1])
    sch, rows, dic = d['schema'], d['rows'], d['dicts']
    # 2026 추합은 2026 경쟁률과 짝이다. 2028판에서 2026 경쟁률은 둘째 슬롯(c25 필드) — 연도로 찾는다
    ratio = d['meta'].get('years', {}).get('ratio', [2026, 2025, 2024])
    i = {k: sch.index(k) for k in ('uni', 'dept', 'jhtype', 'jhname', 'jagyeok', 'chung26')}
    i['c26'] = sch.index(['c26', 'c25', 'c24'][ratio.index(2026)])
    snap, ov = load_e26()

    hits, applicable = [], 0
    for r in rows:
        uni, dept, jht, jhn, jag = (dic[k][r[i[k]]] if isinstance(r[i[k]], int) else r[i[k]]
                                    for k in ('uni', 'dept', 'jhtype', 'jhname', 'jagyeok'))
        c26 = r[i['c26']]
        try:
            ch = float(str(r[i['chung26']]).strip())
        except ValueError:
            continue
        if c26 is None:
            continue
        e26 = ov.get((uni, dept, jht, jhn), snap.get('|'.join([uni, dept, jht, jhn, jag])))
        if not e26 or e26 <= 0:
            continue
        applicable += 1
        dec = len(str(c26).split('.')[1]) if '.' in str(c26) else 0
        app_hi = e26 * (c26 + 0.5 * 10 ** -dec)      # 경쟁률 반올림 상한
        cap = max(0.0, app_hi - e26)                  # 추합 가능 최대치
        if ch > cap + TOL:
            hits.append(('|'.join([uni, dept, jht, jhn, jag]), c26, e26, ch, cap))

    print(f"판정가능 {applicable}행 · 의심 {len(hits)}행 ({len(hits)/max(applicable,1)*100:.1f}%)")
    if verbose:
        for key, c26, e26, ch, cap in sorted(hits):
            u, dp, jt, jn = key.split('|')[:4]
            print(f"  {u} | {dp[:16]} | {jt} {jn[:14]} | 2026모집 {e26} 경쟁률 {c26} → 추합 {int(ch)} (한도 {cap:.0f})")

    cur = sorted(k for k, *_ in hits)
    base_path = os.path.join(HERE, 'qa_chungwon_baseline.json')
    if '--save-baseline' in sys.argv:
        json.dump(cur, open(base_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(f"기준선 저장 {len(cur)}건 → qa_chungwon_baseline.json")
        return
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
            print("  → 추합·경쟁률·2026 모집인원 중 무엇이 어긋났는지 확인할 것.")
            sys.exit(1)
        print(f"OK  신규 의심 없음 (기준선 {len(base)}건 유지)")
    else:
        print("기준선 없음 — --save-baseline 으로 생성하면 이후 증가분만 감지한다.")


if __name__ == '__main__':
    main()
