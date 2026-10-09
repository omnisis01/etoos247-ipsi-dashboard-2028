# 외부 대조로 검증된 2026 경쟁률의 회귀 감시.
# 사용법: python3 qa_c26_verified.py [--list] [--save-baseline]
#
# 왜 필요한가 — qa_comp_ratio.py 의 산술 검사가 원리적으로 못 잡는 오류가 있다.
#  · 정수 경쟁률(7.0 등)은 지원자 추정 구간이 너무 넓어 판정 자체가 불가능하다.
#    (dec 계산이 rstrip('0') 이라 '7.0' 은 dec=0 이 되어 아예 건너뛴다.)
#  · **다른 전형의 값이 통째로 들어온 오류**는 산술이 그대로 성립해 통과한다.
#    실제로 진주교대 다문화 6.33 은 6.33×3=19 로 정수 지원자가 나와 검사를 통과했지만,
#    대학 공식 페이지에서는 그 값이 '국가보훈' 전형 값이었다(전형 한 칸 밀림).
#  이런 건 대행사 최종 경쟁률 페이지와의 **외부 대조**라야 잡힌다. 그런데 대조는 네트워크와
#  135개 페이지 수집이 필요해 매번 돌릴 수 없다. 그래서 **한 번 확인한 결과를 지문으로 굳혀 두고**,
#  엑셀이 갱신됐을 때 그 값이 바뀌면 여기서 잡는다.
#
# 지문 갱신은 tools/ratio_compare/ 로 재대조한 뒤 --save-baseline 이 아니라
# 그쪽 스크립트로 c26_verified.json 을 다시 만들어야 한다(수집이 선행돼야 하므로).
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
VERIFIED = os.path.join(HERE, 'c26_verified.json')


def main():
    verbose = '--list' in sys.argv
    if not os.path.exists(VERIFIED):
        print('c26_verified.json 없음 — 검증 지문이 아직 없다(건너뜀).')
        return
    ref = json.load(open(VERIFIED, encoding='utf-8'))
    v = ref['v']
    t = open(os.path.join(HERE, 'data.js'), encoding='utf-8').read()
    d = json.loads(t[len('window.IPSI = '):-1])
    sch, dic = d['schema'], d['dicts']
    # 2028판에서 2026 경쟁률은 둘째 슬롯(c25 필드)에 있다 — 필드명이 아니라 meta.years.ratio 로 찾는다
    ratio = d['meta'].get('years', {}).get('ratio', [2026, 2025, 2024])
    i = {k: sch.index(k) for k in ('uni', 'dept', 'jhtype', 'jhname', 'jagyeok')}
    i['c26'] = sch.index(['c26', 'c25', 'c24'][ratio.index(2026)])
    cur = {}
    for r in d['rows']:
        if r[i['c26']] is None:
            continue
        key = '|'.join(dic[k][r[i[k]]] if isinstance(r[i[k]], int) else r[i[k]]
                       for k in ('uni', 'dept', 'jhtype', 'jhname', 'jagyeok'))
        cur[hashlib.sha1(key.encode()).hexdigest()[:10]] = (r[i['c26']], key)

    changed, gone = [], []
    for h, want in v.items():
        if h not in cur:
            gone.append(h)
        elif abs(cur[h][0] - want) > 0.005:
            changed.append((h, want, cur[h][0], cur[h][1]))

    print(f"검증 지문 {len(v)}행({ref.get('asof','?')} 대조) · 현재 c26 {len(cur)}행")
    if gone:
        print(f"  · 사라진 행 {len(gone)}건 — 모집단위·전형명이 바뀌었거나 값이 비었다(정상일 수 있음)")
    if changed:
        print(f"\nFAIL  외부 대조로 확인된 값이 {len(changed)}건 바뀌었습니다:")
        for h, want, now, key in changed[:20]:
            u, dp, jt, jn = key.split('|')[:4]
            print(f"  ✗ {u} | {dp.replace(chr(10), ' ')[:18]} | {jt} {jn[:14]} : {want} → {now}")
        if len(changed) > 20:
            print(f"  … 외 {len(changed) - 20}건")
        print("  → 엑셀 갱신으로 정당히 바뀐 것이면 tools/ratio_compare/ 로 재대조해 지문을 다시 만드세요.")
        sys.exit(1)
    print("OK  검증된 값이 그대로입니다")


if __name__ == '__main__':
    main()
