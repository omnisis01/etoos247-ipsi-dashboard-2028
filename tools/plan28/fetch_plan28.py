# 2028 대학입학전형 시행계획 PDF 수집 — 메가스터디 CDN에서 대학별 PDF를 받아 레이아웃 텍스트로 푼다
"""
사용법
  python3 tools/plan28/fetch_plan28.py                 # target35.json 전부
  python3 tools/plan28/fetch_plan28.py 서울대학교 연세대학교
  python3 tools/plan28/fetch_plan28.py --force 서울대학교   # 이미 있어도 다시 받음

원천  https://cdn013.negagea.net/dgsmidc/omr/seoul/web/univ_info2026/<대학명>/<대학명>_2028학년도_대학입학전형계획.pdf
      (2026-07-01 업로드된 4월 대교협 심의본 — 우리 6/8 엑셀과 같은 세대. 변경 공지는 각 입학처에서 따로 본다.)
저장  ../입결 및 인사이트/2028_시행계획_PDF/<대학명>.pdf · .txt(pdftotext -layout)  — Drive 전용, git 밖(README 참조)
별칭  cdn_coverage.json 의 alias (강원대학교(강릉)→강원대학교 등). CDN 에 없는 대학은 그 폴더에 <대학명>.pdf 로 수동 저장하면 .txt 를 만든다.
기록  fetch_log.json — url · Last-Modified · 크기 · 쪽수 · 수집 시각. 파일이 바뀌었는지는 Last-Modified 로 안다.
"""
import json, os, sys, subprocess, urllib.parse, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(DASH, '..', '입결 및 인사이트', '2028_시행계획_PDF')
BASE = 'https://cdn013.negagea.net/dgsmidc/omr/seoul/web/univ_info2026/'
SUFFIX = '_2028학년도_대학입학전형계획.pdf'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36'}

def cdn_url(name):
    e = urllib.parse.quote(name)
    return f'{BASE}{e}/{e}{urllib.parse.quote(SUFFIX)}'

def to_text(pdf, txt):
    subprocess.run(['pdftotext', '-layout', pdf, txt], check=True)
    pages = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    return next((int(l.split()[-1]) for l in pages.splitlines() if l.startswith('Pages:')), None)

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    force = '--force' in sys.argv
    cov = json.load(open(os.path.join(HERE, 'cdn_coverage.json'), encoding='utf-8'))
    targets = args or json.load(open(os.path.join(HERE, 'target35.json'), encoding='utf-8'))['unis']
    os.makedirs(OUT, exist_ok=True)
    logp = os.path.join(HERE, 'fetch_log.json')
    log = json.load(open(logp, encoding='utf-8')) if os.path.exists(logp) else {}
    manual, done, fail = [], [], []
    for u in targets:
        pdf, txt = os.path.join(OUT, f'{u}.pdf'), os.path.join(OUT, f'{u}.txt')
        cdn = u if u in cov['have'] else cov['alias'].get(u)
        if cdn is None:
            if os.path.exists(pdf):                       # 수동 저장본
                pages = to_text(pdf, txt); log[u] = {'source': 'manual', 'pages': pages, 'fetched': str(datetime.date.today())}
                done.append(f'{u}(수동본 {pages}쪽)')
            else:
                manual.append(u)
            continue
        if os.path.exists(pdf) and not force:
            if not os.path.exists(txt): to_text(pdf, txt)
            done.append(f'{u}(있음)'); continue
        url = cdn_url(cdn)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                data = r.read(); lm = r.headers.get('Last-Modified', '')
            open(pdf, 'wb').write(data)
            pages = to_text(pdf, txt)
            log[u] = {'source': 'cdn', 'cdn_name': cdn, 'url': url, 'last_modified': lm, 'bytes': len(data),
                      'pages': pages, 'fetched': str(datetime.date.today())}
            done.append(f'{u}({pages}쪽' + (f', CDN명 {cdn}' if cdn != u else '') + ')')
        except Exception as e:
            fail.append(f'{u}: {e}')
    json.dump(log, open(logp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'[fetch_plan28] 수집·변환 {len(done)}교 → {os.path.relpath(OUT, DASH)}')
    for d in done: print('  ✓', d)
    if manual:
        print(f'  CDN 미보유 {len(manual)}교 — 입학처에서 받아 {os.path.relpath(OUT, DASH)}/<대학명>.pdf 로 저장 후 재실행:')
        for m in manual: print('    ·', m)
    for f in fail: print('  ✗', f)
    if fail: sys.exit(1)

if __name__ == '__main__':
    main()
