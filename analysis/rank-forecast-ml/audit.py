"""Check saved predictions against original source amounts and summary metrics."""
import json
import hashlib
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

HERE=Path(__file__).resolve().parent
r=json.loads((HERE/'results.json').read_text(encoding='utf-8'))
source=Path(r['data_path'])
if not source.exists():
    source=HERE/'../../data/rank-history.json'
assert hashlib.sha256(source.read_bytes()).hexdigest()==r['data_sha256']
records=json.loads(source.read_text(encoding='utf-8'))
actual={row['id']:np.array([p[0]*100/row['base'] for p in row['prices']]) for row in records}
frame=pd.read_csv(HERE/'holdout-predictions.csv',encoding='utf-8-sig')
checks={}
assert len(frame)==r['holdout_count']*15*len(r['results'])
for result in r['results']:
    name=result['model']
    rows=frame[frame.model==name].copy()
    assert rows.notice_id.nunique()==r['holdout_count']
    assert (pd.to_datetime(rows.opened)>=pd.Timestamp('2026-01-01')).all()
    assert rows.groupby('notice_id')['rank'].apply(lambda v:sorted(v)==list(range(1,16))).all()
    exact=np.array([actual[row.notice_id][row.rank-1] for row in rows.itertuples()])
    assert np.max(np.abs(rows.actual_rate_percent.to_numpy()-exact))<5.1e-9
    predicted=rows.predicted_rate_percent.to_numpy()
    assert np.isfinite(predicted).all() and predicted.min()>=97 and predicted.max()<=103
    assert rows.groupby('notice_id').apply(lambda v:(np.diff(v.sort_values('rank').predicted_rate_percent)<=0).all(),include_groups=False).all()
    mae=float(np.mean(abs(predicted-exact)))
    assert abs(mae-result['MAE_pp'])<6e-9
    checks[name]={'source_amounts_reproduced':True,'all_15_ranks':True,'bounds_and_order':True,'MAE_recomputed':mae}
for name in ['RF','SVR','kNN','ANN']:
    trials=json.loads((HERE/f'tuning-{name}.json').read_text())
    assert len(trials)==32
    assert all(sum(row['window']==w for row in trials)==8 for w in [30,60,200,None])
    assert all(len(row['fold_MAE_pp'])==3 for row in trials)
    if name=='ANN':
        assert {len(row['params']['hidden_layer_sizes']) for row in trials}=={2,3}
        saved=joblib.load(HERE/'model-ANN-pre2026.joblib')
        network=saved.regressor_.steps[-1][1]
        checks['ANN']['saved_weight_shapes']=[list(w.shape) for w in network.coefs_]
        checks['ANN']['iterations']=network.n_iter_
        checks['ANN']['training_loss']=float(network.loss_)
report={'checks':checks,'prediction_rows':len(frame),'notice_count':r['holdout_count'],'data_sha256':r['data_sha256']}
(HERE/'audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
