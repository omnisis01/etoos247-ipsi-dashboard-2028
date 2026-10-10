# 2028 인사이트 자동 생성 — data.js(2028)·snap27.json(2027)에서 대학별 변화 '사실'만 뽑아 insights.js 를 만든다
"""
2027 인사이트 169항목은 에이전트가 쓴 산문이었다. 2028판은 전형계획 기준이라 요강(2027년 5월경) 때 값이
또 바뀌므로, 사용자 결정(2026-10-09)으로 **데이터에서 자동 생성**한다 — 산문 없이 사실만.

생성 규칙 (app.js 가 읽는 키만 채운다: headline·tags·oneLine·sections·verdict·tier)
- rows 는 verify_insights.py 가 해석할 수 있는 라벨만 쓴다 — 전형유형별(학생부교과/학생부종합/논술/실기/실적)
  2027→2028 합계. '수시 전체' 행은 검증기의 SKIP_PAT 에 걸려 건너뛰므로 독자용으로만 둔다.
- 검증기가 해석 못 하는 사실(최저 변화·신설·분리)은 bullets 로 적는다.
- 판정(verdict)은 ipsi-verdict-legend 규칙 — 증원·최저 강화 = 유리(good), 감원·최저 완화/폐지 = 불리(bad),
  신설·분리 다수 = 변동(warn), 전형계획 기준·2027 입결 미공개 = info.
- tier 는 2027 insights.js 에서 보존한 ins_tier27.json 을 쓴다(레일 묶음용).
- 직렬화는 build_ins.py / merge_ins.py 가 파싱하는 형식(order 한 줄, unis 대학당 한 줄, 꼬리 '  },\\n};').

사용법: python3 build_ins_2028.py   → insights.js 덮어씀. 이어서 python3 verify_insights.py 로 숫자를 대조할 것.
"""
import json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
INS = os.path.join(HERE, 'insights.js')

def load_data():
    t = open(os.path.join(HERE, 'data.js'), encoding='utf-8').read()
    d = json.loads(t[len('window.IPSI = '):-1])
    sch, dc = d['schema'], d['dicts']
    ix = {k: sch.index(k) for k in ('uni', 'dept', 'jhtype', 'jhname', 'enroll', 'dn', 'dkind', 'chKind', 'change', 'choejeo')}
    rows = []
    for r in d['rows']:
        rows.append({
            'uni': dc['uni'][r[ix['uni']]], 'dept': dc['dept'][r[ix['dept']]], 'jht': r[ix['jhtype']],
            'jhn': dc['jhname'][r[ix['jhname']]], 'e': int(r[ix['enroll']] or 0), 'dn': int(r[ix['dn']] or 0),   # 실수(796.0)→정수
            'dkind': r[ix['dkind']] or 'none', 'ck': r[ix['chKind']] or '', 'change': dc['change'][r[ix['change']]] or '',
            'cj': dc['choejeo'][r[ix['choejeo']]] or '',
        })
    return d['meta'], rows

JHT_ORDER = ['학생부교과', '학생부종합', '논술', '실기/실적', '특기자']
GYE_KEYS = ('치의예', '한의예', '한의학', '수의예', '의예', '약학', '첨단약과학', '한약', '바이오제약')   # verify_insights.GYE 의 접두
JHT_SHORT = {'학생부교과': '교과', '학생부종합': '종합', '논술': '논술', '실기/실적': '실기', '특기자': '특기자'}
mark = lambda d: '-' if d == 0 else (f'▲{d}' if d > 0 else f'▼{-d}')
fmt = lambda n: f'{n:,}명'

def build_uni(u, rows, snap_rows, tier):
    R = [x for x in rows if x['uni'] == u]
    t28 = collections.Counter(); t27 = collections.Counter()
    for x in R: t28[x['jht']] += x['e']
    for k, v in snap_rows.items():
        p = k.split('|')
        if p[0] == u and v.get('enroll') is not None: t27[p[2]] += v['enroll']
    tot28, tot27 = sum(t28.values()), sum(t27.values())
    # 2027 전형별 단위 수·총원 — '전수 수록 전형'(2027 단위 수 == 2028 비교 가능 단위 수)에만 from 을 적는다.
    # 2028 원천은 35개 주요대학만 거의 전수이고 지거국·기타 40교는 의치약한수만 실려 있어(수록률 5~9%, 2026-10-09 실측),
    # 전형 총원끼리 비교하면 '▼1,991' 같은 거짓이 난다(동의대 일반고교과 2027 2,000명 vs 2028 9명).
    nzv = lambda t: re.sub(r'[\s()·,/\-]|전형$', '', t or '')   # verify_insights.nz 와 동일
    u27 = collections.defaultdict(lambda: [0, 0])
    for k, v in snap_rows.items():
        p = k.split('|')
        if p[0] != u: continue
        p[1], p[3] = ren27(u, p[1], p[3])                   # 2027 이름을 2028 이름으로(rename28) — 어댑터와 같은 사전
        if v.get('enroll') is not None: u27[nzv(p[3])][0] += 1; u27[nzv(p[3])][1] += v['enroll']
    rows27 = sum(c for c, _ in u27.values()); cover = len(R) / rows27 if rows27 else 1.0
    partial = cover < 0.8
    d_tot = tot28 - tot27
    new = [x for x in R if x['dkind'] == 'new']; split = [x for x in R if x['dkind'] == 'split']
    ch = [x for x in R if x['ck'] in ('신설', '폐지', '강화', '완화', '변경')]
    n_ck = collections.Counter(x['ck'] for x in ch)

    # ── 모집인원 변화 — 전형명 단위 rows (verify_insights.resolve 가 해석하는 단위) ──
    # from 은 각 행의 e−dn(어댑터가 확정한 2027 값)의 합. 비교 불가 행(changed/new/split)이 섞이면 from 을 비우고
    # '2027 대응 미확정'으로 적어 거짓 from 을 만들지 않는다(검증기는 to 축만 대조하고 from 축은 스킵).
    prow = []
    byj = collections.defaultdict(list)
    for x in R: byj[(x['jht'], x['jhn'])].append(x)
    for (jt, jn), xs in sorted(byj.items(), key=lambda kv: (JHT_ORDER.index(kv[0][0]) if kv[0][0] in JHT_ORDER else 9, -sum(x['e'] for x in kv[1]))):
        b = sum(x['e'] for x in xs)
        cmp_ = [x for x in xs if x['dkind'] in ('up', 'down', 'none')]
        n27, e27 = u27.get(nzv(jn), (0, 0))
        # 검증기 resolve() 는 라벨이 계열 키워드(의예·약학·한의예…)로 시작하면 그 계열로 범위를 좁힌다 —
        # '의예약학전형'이 '의예'+'약학전형'으로 쪼개져 23≠29 가 났다. 그런 전형명은 '(교과) ' 접두로 쓴다.
        lbl = f'({JHT_SHORT.get(jt, jt)}) {jn}' if any(jn.startswith(k) for k in GYE_KEYS) else f'{jn}({JHT_SHORT.get(jt, jt)})'
        # 2027 그 전형의 단위가 **전부** 2028 에 1:1 로 있으면(cmp_ == n27) 신설·전형변경 행이 섞여도 전형 총원 비교는 참이다
        # (2028 총원엔 신설분이 들어가야 맞다). 2027 단위가 하나라도 빠지면(개명 미등록·누락) from 을 비운다.
        if n27 and len(cmp_) == n27:                        # 전수 수록 전형 — 2027 전형 총원과 비교 가능
            a = e27; d = b - a
            prow.append({'label': lbl, 'from': fmt(a), 'to': fmt(b), 'dir': 'up' if d > 0 else 'down' if d < 0 else 'same', 'note': mark(d)})
        else:
            if n27:
                note = f'2027 {n27}개 단위 {e27:,}명 중 2028 전형계획에 실린 {len(xs)}개 단위' + (f'(비교 가능 {len(cmp_)})' if cmp_ and len(cmp_) < len(xs) else '')
            else:
                kinds = collections.Counter(x['dkind'] for x in xs if x['dkind'] not in ('up', 'down', 'none'))
                why = ' · '.join(f"{ {'new': '신설', 'split': '분리', 'changed': '전형 변경'}.get(k, k)} {n}행" for k, n in kinds.most_common()) or '2027 동명 전형 없음'
                note = f'2027 대응 미확정({why})'
            prow.append({'label': lbl, 'from': '', 'to': fmt(b), 'dir': 'flat', 'note': note})
    if partial:
        prow.append({'label': '수시 전체', 'from': '', 'to': fmt(tot28), 'dir': 'flat',
                     'note': f'2028 전형계획에 실린 {len(R)}개 단위 합계 — 2027 {rows27}개 단위 {tot27:,}명과 비교 불가(일부 수록)'})
    else:
        prow.append({'label': '수시 전체', 'from': fmt(tot27), 'to': fmt(tot28),
                     'dir': 'up' if d_tot > 0 else 'down' if d_tot < 0 else 'same', 'note': mark(d_tot)})
    sub = ' · '.join(f"{JHT_SHORT.get(jt, jt)} {t27.get(jt, 0):,}→{t28.get(jt, 0):,}" for jt in JHT_ORDER if t27.get(jt) or t28.get(jt))
    sections = [{'title': '모집인원 변화 (전형별)', 'icon': '👥', 'rows': prow,
                 'caption': (f'⚠ 이 대학은 2028 전형계획 원천에 일부 모집단위({len(R)}개, 의치약한수 등)만 실려 있다 — 대학 전체 증감은 알 수 없다. ' if partial else f'전형유형별 합계 2027→2028: {sub}. ')
                            + '2028은 전형계획(2026-06 공시), 2027은 최종 요강 기준 — 요강 발표(2027년 5월경) 시 2028 값이 바뀔 수 있다. 정원 내·외 포함. '
                              'from 이 비어 있는 전형은 2027 단위 전부가 2028에 실리지 않아 총원 비교를 하지 않은 것이다.'}]

    # ── 수능최저 변화 (bullets) ──
    if ch:
        bl = []
        for x in sorted(ch, key=lambda x: (JHT_ORDER.index(x['jht']) if x['jht'] in JHT_ORDER else 9, x['dept'])):
            txt = x['change'] if x['ck'] in ('신설', '폐지') else x['change'].replace('최저: ', '')
            bl.append(f"{x['dept']} {x['jhn']}({JHT_SHORT.get(x['jht'], x['jht'])}): {x['ck']} — {txt}")
        head = ' · '.join(f'{k} {n}' for k, n in n_ck.most_common())
        sections.append({'title': f'수능최저 변화 ({head})', 'icon': '📝',
                         'bullets': bl[:14] + ([f'외 {len(bl) - 14}건 — 전형 목록에서 "최저 변화" 필터로 확인'] if len(bl) > 14 else [])})

    # ── 신설·분리 (bullets) ──
    bl = []
    if new or split:
        byd = collections.defaultdict(list)
        for x in new: byd[x['dept']].append(f"{x['jhn']} {x['e']}명")
        for dpt, lst in list(byd.items())[:10]:
            bl.append(f'신설 모집단위 {dpt} — ' + ', '.join(lst))
        if len(byd) > 10: bl.append(f'외 신설 {len(byd) - 10}개 단위')
        sd = sorted({x['dept'] for x in split})
        if sd: bl.append('2027 통합 단위에서 분리: ' + ', '.join(sd[:10]) + (f' 외 {len(sd) - 10}' if len(sd) > 10 else ''))
    bare = lambda t: re.sub(r'전형$', '', re.sub(r'\(.*?\)', '', re.sub(r'\s', '', t or '')))
    j27 = {bare(ren27(u, '', k.split('|')[3])[1]) for k in snap_rows if k.split('|')[0] == u}; j28 = {bare(x['jhn']) for x in R}
    gone = sorted(j27 - j28)
    if gone:
        if not (new or split): bl = []
        bl.append('2027 전형 중 2028 전형계획에 같은 이름이 없는 것(개편·개명·폐지 가능, 요강에서 확인): ' + ', '.join(gone[:8]) + (f' 외 {len(gone) - 8}' if len(gone) > 8 else ''))
    rn = REN.get(u, {})
    if rn.get('jhname'): bl.append('전형명 변경(2027→2028, 시행계획 기준): ' + ', '.join(f'{o} → {n}' for o, n in rn['jhname'].items()))
    if rn.get('dept'): bl.append('모집단위명 변경(2027→2028): ' + ', '.join(f'{o} → {n}' for o, n in rn['dept'].items()))
    if new or split or gone or rn.get('jhname') or rn.get('dept'):
        sections.append({'title': '신설·분리·개편', 'icon': '✨', 'bullets': bl,
                         'caption': '신설·분리 단위는 전년 입결이 없다 — 첫해 변동성이 크다.'})

    # ── 지원 참고 ──
    sections.append({'title': '지원 참고', 'icon': '🧭', 'bullets': [
        '이 항목은 대시보드 데이터에서 자동 생성한 사실 요약이다. 해석이 필요한 대목은 각 전형의 상세 카드와 유불리 판정을 함께 볼 것.',
        '입결·추합은 2026 vs 2025, 경쟁률은 2027 vs 2026 실적이다. 2027 입결은 공개(2027년 4~5월) 후 반영된다.',
        '전형계획 단계의 전형명·모집단위는 요강에서 개편될 수 있다 — "전형 변경"으로 표시된 전형은 2027 대응 전형을 확정하지 못한 것이다.',
    ]})

    # ── 헤드라인·태그·한 줄 ──
    nn, ns = len({x['dept'] for x in new}), len({x['dept'] for x in split})
    headline = (f'2028 전형계획 일부 수록 — {len(R)}개 단위 {tot28:,}명(의치약한수 등)' if partial else f'2028 수시 {tot28:,}명 ({mark(d_tot)} vs 2027)') \
               + (f' · 신설 {nn}단위' if nn else '') + (f' · 분리 {ns}단위' if ns else '') + (f' · 최저 변화 {len(ch)}건' if ch else '')
    tags = ['전형계획 기준'] + (['일부 수록'] if partial else [f'모집 {mark(d_tot)}']) + ([f'신설 {nn}'] if nn else []) + ([f'분리 {ns}'] if ns else []) \
         + [f'최저 {k} {n}' for k, n in n_ck.most_common(2)]
    big = max(((jt, t28.get(jt, 0) - t27.get(jt, 0)) for jt in JHT_ORDER if t28.get(jt) or t27.get(jt)), key=lambda p: abs(p[1]), default=None)
    s_big = f' 전형유형 중에서는 {big[0]}이 {mark(big[1])}명으로 변화가 가장 크다.' if big and big[1] else ''
    s_ck = (' 수능최저는 ' + ' · '.join(f'{k} {n}건' for k, n in n_ck.most_common()) + '.') if ch else ' 수능최저 변화는 없다.'
    oneLine = (f'{u}는 2028 전형계획 원천에 {len(R)}개 모집단위(의치약한수 등) {tot28:,}명만 실려 있어 대학 전체 증감은 비교하지 않는다.' if partial
               else f'{u}는 2028학년도 수시 {tot28:,}명을 모집한다 — 2027 대비 {mark(d_tot)}명.' + s_big) + s_ck

    # ── 판정 ──
    v = []
    ups = [(jt, t28[jt] - t27.get(jt, 0)) for jt in JHT_ORDER if t28.get(jt) and t28[jt] - t27.get(jt, 0) >= max(10, 0.1 * t27.get(jt, 1))]
    downs = [(jt, t27.get(jt, 0) - t28.get(jt, 0)) for jt in JHT_ORDER if t27.get(jt) and t27[jt] - t28.get(jt, 0) >= max(10, 0.1 * t27[jt])]
    if not partial:   # 부분 수록 대학은 전형유형 합계 증감이 수록 범위 차이일 뿐이라 판정하지 않는다
        for jt, d in ups: v.append({'type': 'good', 'text': f'{jt} {d}명 증원 — 모집이 늘면 합격선이 다소 낮아질 수 있다(유리 요인).'})
        for jt, d in downs: v.append({'type': 'bad', 'text': f'{jt} {d}명 감원 — 합격선 상승 가능(불리 요인).'})
    if n_ck.get('강화') or n_ck.get('신설'):
        v.append({'type': 'good', 'text': f"수능최저 강화·신설 {n_ck.get('강화', 0) + n_ck.get('신설', 0)}건 — 지원이 위축돼 내신 합격선이 내려갈 수 있다(최저 충족이 전제)."})
    if n_ck.get('완화') or n_ck.get('폐지'):
        v.append({'type': 'bad', 'text': f"수능최저 완화·폐지 {n_ck.get('완화', 0) + n_ck.get('폐지', 0)}건 — 지원이 몰려 경쟁이 세질 수 있다."})
    if nn + ns >= 5:
        v.append({'type': 'warn', 'text': f'신설·분리 {nn + ns}개 단위 — 전년 입결이 없어 첫해 변동성이 크다(기회이자 위험).'})
    if partial: v.append({'type': 'warn', 'text': f'2028 전형계획 원천에 이 대학은 {len(R)}개 단위만 실려 있다(2027 {rows27}개). 나머지 전형은 요강판에서 보강된다 — 여기 없다고 폐지된 것이 아니다.'})
    v.append({'type': 'info', 'text': '전형계획 기준 수치다. 요강(2027년 5월경) 확정 시 모집인원·최저가 바뀔 수 있고, 2027 입결은 2027년 4~5월 공개 후 반영된다.'})

    out = {'headline': headline, 'tags': tags, 'oneLine': oneLine, 'sections': sections, 'verdict': v}
    if tier: out['tier'] = tier
    return out, tot28

# rename28.json — 2027 이름 → 2028 이름(레이어 C). 어댑터가 2027 스냅을 색인할 때 쓰는 사전과 같은 파일이다.
_RENP = os.path.join(HERE, 'tools', 'plan28', 'rename28.json')
REN = {u: m for u, m in (json.load(open(_RENP, encoding='utf-8')) if os.path.exists(_RENP) else {}).items() if not u.startswith('_')}
def ren27(u, d, jn):
    m = REN.get(u, {}); return m.get('dept', {}).get(d, d), m.get('jhname', {}).get(jn, jn)


def main():
    meta, rows = load_data()
    snap = json.load(open(os.path.join(HERE, 'snap27.json'), encoding='utf-8'))['rows']
    tier = json.load(open(os.path.join(HERE, 'ins_tier27.json'), encoding='utf-8'))['tier']
    unis = sorted({x['uni'] for x in rows})
    built = {u: build_uni(u, rows, snap, tier.get(u)) for u in unis}
    # 순서 — 2027 tier 보유 대학을 tier 순으로 앞에, 나머지는 2028 모집인원 내림차순
    TIER_ORDER = ['SKY', '서성한', '중경외시', '건동홍', '거점국립', '메디컬', '특집', '이슈']
    def key(u):
        t = tier.get(u); return (TIER_ORDER.index(t) if t in TIER_ORDER else 99, -built[u][1], u)
    order = sorted(unis, key=key)
    m = {'compare': '2028학년도 vs 2027학년도', 'fromYear': 2027, 'toYear': 2028,
         'note': '본 대시보드(2028학년도 수시, 전형계획 기준) 데이터에서 자동 생성한 대학별 변화 요약입니다. 모집인원은 대시보드 원자료와 '
                 '동일 기준(2028 전형계획 vs 2027 최종 요강)이며, 입결·추합은 2026 vs 2025, 경쟁률은 2027 vs 2026 실적입니다. '
                 '확정 모집요강(2027년 5월경) 발표 후 다시 생성합니다.'}
    head = ('/* 2028 vs 2027학년도 수시 변화 인사이트 — build_ins_2028.py 가 data.js·snap27.json 에서 자동 생성 (2026-10-09)\n'
            '   산문 없음 · 사실만. 숫자는 verify_insights.py 가 원천과 대조한다. 수기 편집 대신 생성기를 고칠 것.\n'
            '   2027판(169항목 산문)은 ipsi-dashboard-2027 저장소. */\n')
    lines = [head, 'window.IPSI_INSIGHTS = {',
             '  meta: ' + json.dumps(m, ensure_ascii=False) + ',',
             '  order: ' + json.dumps(order, ensure_ascii=False) + ',',
             '  unis: {']
    for u in order:
        lines.append('    ' + json.dumps(u, ensure_ascii=False) + ': ' + json.dumps(built[u][0], ensure_ascii=False) + ',')
    lines += ['  },', '};', '']
    open(INS, 'w', encoding='utf-8').write('\n'.join(lines))
    n_tier = sum(1 for u in order if tier.get(u))
    print(f'[build_ins_2028] {len(order)}교 · tier 보존 {n_tier}교 · 섹션 {sum(len(built[u][0]["sections"]) for u in order)} · '
          f'rows {sum(len(s.get("rows", [])) for u in order for s in built[u][0]["sections"])} → insights.js')

if __name__ == '__main__':
    main()
