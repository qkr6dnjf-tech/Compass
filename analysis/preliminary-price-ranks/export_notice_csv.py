"""Export one group of 15 price ranks per official notice from observations.csv."""
import csv
from decimal import Decimal, ROUND_HALF_UP
from itertools import groupby
from pathlib import Path

def export(folder):
    folder = Path(folder)
    with (folder / 'observations.csv').open(encoding='utf-8-sig', newline='') as source:
        rows = sorted(csv.DictReader(source), key=lambda r: (r['opened_kst'], r['notice'], int(r['price_rank'])))
    target = folder / 'notice-rates.csv'
    quantum = Decimal('0.00001')
    def display(x):
        return format(x.quantize(quantum, rounding=ROUND_HALF_UP), 'f')
    output = []
    unique = set()
    for notice, group in groupby(rows, key=lambda r: r['notice']):
        group = list(group)
        if notice in unique or [int(r['price_rank']) for r in group] != list(range(1,16)):
            raise ValueError('Incomplete or duplicate notice: ' + notice)
        unique.add(notice)
        base = Decimal(group[0]['base_won'])
        prev = None
        for row in group:
            if base <= 0 or Decimal(row['base_won']) != base:
                raise ValueError('Invalid base price: ' + notice)
            current = Decimal(row['price_won']) / base * 100
            if not 97 <= current <= 103 or (prev is not None and prev < current):
                raise ValueError('Invalid price order or range: ' + notice)
            output.append([notice, format(base.normalize(),'f'),row['price_rank'],display(current),'' if prev is None else display(prev-current)])
            prev = current
    with target.open('w',encoding='utf-8-sig',newline='') as dest:
        writer = csv.writer(dest)
        writer.writerow(['공고번호','기초금액(원)','번호','사정률(%)','편차(%p)'])
        writer.writerows(output)
    return len(unique), len(output)

if __name__=='__main__':
    print(export(Path(__file__).resolve().parent))
