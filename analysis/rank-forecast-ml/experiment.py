"""Reproducible, time-ordered 15-price-rank regression experiment.

Run: python experiment.py --jobs 4
The 2026 holdout is never used by hyperparameter search.
"""
import os
for key in ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS']:
    os.environ[key] = '1'
import argparse
import hashlib
import json
import platform
import time
import warnings
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import sklearn
from joblib import Parallel, delayed, dump
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.exceptions import ConvergenceWarning
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import ParameterSampler
from sklearn.multioutput import MultiOutputRegressor
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR
from threadpoolctl import threadpool_limits

SEED = 20261114
HERE = Path(__file__).resolve().parent
FOLDS = [('2024-07-01', '2025-01-01'), ('2025-01-01', '2025-07-01'), ('2025-07-01', '2026-01-01')]
WINDOWS = [30, 60, 200, None]

def safe_predictions(pred):
    """Same physical constraints for every method; isotonic projection preserves rank identity."""
    pred = np.clip(np.asarray(pred), 97., 103.)
    iso = IsotonicRegression(increasing=False, y_min=97., y_max=103.)
    return np.stack([iso.fit_transform(np.arange(15), row) for row in pred])

def load_data(path):
    source = json.loads(path.read_text(encoding='utf-8'))
    records = sorted(source, key=lambda r: (r['opened'], r['id']))
    assert len({r['id'] for r in records}) == len(records)
    assert all(len(r['prices']) == 15 and r['base'] > 0 for r in records)
    rates = np.array([[p[0] * 100 / r['base'] for p in r['prices']] for r in records])
    assert np.isfinite(rates).all() and rates.min() >= 97 and rates.max() <= 103
    assert (np.diff(rates, axis=1) <= 0).all()
    dates = pd.to_datetime([r['opened'] for r in records]).to_numpy()
    features, labels, meta, histories = [], [], [], []
    names = ['log10_base', 'year', 'month_sin', 'month_cos', 'region_jeonju', 'region_gunsan', 'region_iksan']
    names += ['title_plant', 'title_maintenance', 'title_forest', 'title_park', 'title_school']
    names += ['log1p_history_count']
    for w in [30, 60, 200]:
        names += [f'past_{w}_{stat}_rank_{rank}' for stat in ['mean', 'median', 'std'] for rank in range(1, 16)]
    for i, r in enumerate(records):
        cutoff = dates[i] - np.timedelta64(7, 'D')
        available = int(np.searchsorted(dates, cutoff, side='left'))
        if available < 60:
            continue
        past = rates[:available]
        date = pd.Timestamp(dates[i])
        region, title = r['region'], r['title']
        row = [np.log10(r['base']), date.year, np.sin(2*np.pi*date.month/12), np.cos(2*np.pi*date.month/12)]
        row += [float(token in region) for token in ['전주', '군산', '익산']]
        row += [float(any(token in title for token in tokens)) for tokens in [
            ['식재', '식물', '수목'], ['유지', '관리', '정비'], ['숲', '산림', '가로수'], ['공원', '녹지'], ['학교', '초등', '중학', '고등']]]
        row += [np.log1p(available)]
        for w in [30, 60, 200]:
            block = past[-w:]
            row += np.mean(block, axis=0).tolist() + np.median(block, axis=0).tolist() + np.std(block, axis=0).tolist()
        assert available <= i and (dates[:available] < cutoff).all()
        features.append(row)
        labels.append(rates[i])
        histories.append(past)
        meta.append({'id': r['id'], 'opened': r['opened'], 'past_count': available})
    x, y = np.array(features), np.array(labels)
    assert x.shape[1] == len(names) and np.isfinite(x).all()
    return records, x, y, pd.DataFrame(meta), histories, names

def model_for(name, params):
    if name == 'RF':
        est = RandomForestRegressor(random_state=SEED, n_jobs=1, **params)
    elif name == 'SVR':
        est = make_pipeline(StandardScaler(), MultiOutputRegressor(SVR(cache_size=128, **params), n_jobs=1))
    elif name == 'kNN':
        est = make_pipeline(StandardScaler(), KNeighborsRegressor(n_jobs=1, **params))
    elif name == 'ANN':
        est = make_pipeline(StandardScaler(), MLPRegressor(random_state=SEED, solver='adam',
            max_iter=5000, early_stopping=False, tol=1e-5, n_iter_no_change=40, batch_size='auto', **params))
    return TransformedTargetRegressor(regressor=est, transformer=StandardScaler())

def fit_predict(name, params, window, x, y, train, valid):
    train = train[-window:] if window else train
    est = model_for(name, params)
    started = time.perf_counter()
    with warnings.catch_warnings(record=True) as caught, threadpool_limits(limits=1):
        warnings.simplefilter('always', ConvergenceWarning)
        est.fit(x[train], y[train])
        pred = safe_predictions(est.predict(x[valid]))
    iterations_reached = int(name == 'ANN' and est.regressor_.steps[-1][1].n_iter_ >= est.regressor_.steps[-1][1].max_iter)
    return pred, est, time.perf_counter()-started, iterations_reached

def folds_for(meta):
    dates = pd.to_datetime(meta.opened)
    folds = []
    for first, last in FOLDS:
        # Freeze fitted weights for each validation block, with a seven-day embargo.
        train = np.flatnonzero(dates < pd.Timestamp(first)-pd.Timedelta(days=7))
        valid = np.flatnonzero((dates >= first) & (dates < last))
        assert len(train) and len(valid) and dates.iloc[train].max() < dates.iloc[valid].min()-pd.Timedelta(days=7)
        folds.append((train, valid))
    return folds

SPACES = {
 'RF': {'n_estimators': [150, 300], 'max_depth': [None, 3, 6, 10],
        'min_samples_leaf': [1, 5, 15, 30], 'max_features': [0.35, 0.7, 1.0]},
 'SVR': {'C': [0.03, 0.1, 0.3, 1., 3., 10.], 'epsilon': [0.02, 0.1, 0.3, 0.5],
         'gamma': ['scale', 0.001, 0.01, 0.1], 'kernel': ['rbf']},
 'kNN': {'n_neighbors': [3, 5, 10, 15, 25, 30], 'weights': ['uniform', 'distance'], 'p': [1, 2]},
 'ANN': {'hidden_layer_sizes': [(16,16), (32,32), (64,32), (64,64), (128,64),
         (16,16,16), (32,32,16), (64,32,16), (64,64,32), (128,64,32)],
         'activation': ['relu', 'tanh'], 'alpha': [0.0001, 0.01, 0.1, 1., 10.],
         'learning_rate_init': [0.0003, 0.001, 0.003]},
}

def trial(name, number, params, window, x, y, folds):
    errors, counts, elapsed, converged_warnings = [], [], 0., 0
    for train, valid in folds:
        pred, _, seconds, warns = fit_predict(name, params, window, x, y, train, valid)
        errors.append(float(mean_absolute_error(y[valid], pred)))
        counts.append(len(valid))
        elapsed += seconds
        converged_warnings += warns
    print(f'Completed {name} trial {number}: MAE={np.average(errors, weights=counts):.7f}, seconds={elapsed:.1f}, warnings={converged_warnings}',flush=True)
    return {'model': name, 'trial': number, 'window': window, 'params': params,
            'validation_MAE_pp': float(np.average(errors, weights=counts)),
            'fold_MAE_pp': errors, 'seconds': elapsed, 'convergence_warnings': converged_warnings}

def metrics(y, pred):
    residual = np.abs(y-pred)
    return {'MAE_pp': float(residual.mean()), 'RMSE_pp': float(np.sqrt(mean_squared_error(y,pred))),
            'rank_MAE_pp': residual.mean(axis=0).tolist(),
            'within_0_01_pp': float((residual <= .01).mean()),
            'within_0_05_pp': float((residual <= .05).mean())}

def bootstrap_difference(y, first, second, meta, repeats=3000):
    """Paired month-block bootstrap: difference first MAE minus second MAE."""
    err = np.abs(y-first).mean(axis=1)-np.abs(y-second).mean(axis=1)
    months = pd.to_datetime(meta.opened).dt.strftime('%Y-%m').to_numpy()
    groups = [np.flatnonzero(months == month) for month in sorted(set(months))]
    rng = np.random.default_rng(SEED)
    dist = [np.mean(np.concatenate([err[groups[j]] for j in rng.integers(0,len(groups),len(groups))])) for _ in range(repeats)]
    return {'difference_MAE_pp': float(err.mean()), 'month_block_bootstrap_95pct': np.quantile(dist,[.025,.975]).tolist(),
            'resamples': repeats, 'months': len(groups)}

def main():
    parser = argparse.ArgumentParser()
    default_data = HERE/'../../data/rank-history.json'
    if not default_data.exists():
        default_data = HERE/'../../bid-compass/data/rank-history.json'
    parser.add_argument('--data', type=Path, default=default_data)
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    args.data = args.data.resolve()
    started = time.perf_counter()
    records, x, y, meta, histories, names = load_data(args.data)
    folds = folds_for(meta)
    hold = np.flatnonzero(pd.to_datetime(meta.opened) >= '2026-01-01')
    train = np.flatnonzero(pd.to_datetime(meta.opened) < pd.Timestamp('2026-01-01')-pd.Timedelta(days=7))
    assert set(hold).isdisjoint(np.concatenate([v for _, v in folds]))
    print(json.dumps({'source_count':len(records), 'usable':len(y), 'features':x.shape[1],
        'holdout':len(hold), 'train':len(train), 'folds':[{'train':len(t),'valid':len(v)} for t,v in folds]}), flush=True)
    trials = []
    best = {}
    for name, space in SPACES.items():
        tasks = []
        for w_idx, window in enumerate(WINDOWS):
            samples = list(ParameterSampler(space, n_iter=8, random_state=SEED+w_idx))
            for p in samples:
                tasks.append((len(tasks)+1, p, window))
        print(f'Search {name}: {len(tasks)} configurations x {len(folds)} time folds', flush=True)
        cache = HERE / f'tuning-{name}.json'
        if cache.exists():
            rows = json.loads(cache.read_text())
        else:
            rows = Parallel(n_jobs=args.jobs, prefer='threads', max_nbytes=None)(
                delayed(trial)(name, n, p, w, x, y, folds) for n,p,w in tasks)
            cache.write_text(json.dumps(rows,indent=2),encoding='utf-8')
        winner = min(rows, key=lambda r: r['validation_MAE_pp'])
        trials += rows
        best[name] = winner
        print(json.dumps({'best':winner},ensure_ascii=True), flush=True)
    # All choices above are made before evaluating ANY 2026 targets.
    (HERE/'selected-configurations.json').write_text(json.dumps(best,indent=2),encoding='utf-8')
    val_baselines = []
    for stat in ['mean', 'median']:
        for window in WINDOWS:
            errors = []
            for _, valid in folds:
                pred = np.stack([getattr(np,stat)(histories[i][-window:] if window else histories[i], axis=0) for i in valid])
                errors += np.abs(y[valid]-pred).mean(axis=1).tolist()
            val_baselines.append({'stat':stat,'window':window,'validation_MAE_pp':float(np.mean(errors))})
    baseline_choice = min(val_baselines,key=lambda r:r['validation_MAE_pp'])
    predictions, results = {}, []
    for name, config in best.items():
        print(f'Final untouched holdout {name}', flush=True)
        pred, est, seconds, warns = fit_predict(name, config['params'], config['window'],x,y,train,hold)
        predictions[name] = pred
        results.append({'model':name,**metrics(y[hold],pred),'fit_seconds':seconds,'convergence_warnings':warns,
                        'validation_MAE_pp':config['validation_MAE_pp'],'window':config['window'],'params':config['params']})
        dump(est,HERE/f'model-{name}-pre2026.joblib',compress=3)
    for stat in ['mean','median']:
        for window in WINDOWS:
            name = f'{stat}_{window or "all"}'
            pred = np.stack([getattr(np,stat)(histories[i][-window:] if window else histories[i],axis=0) for i in hold])
            predictions[name] = safe_predictions(pred)
            results.append({'model':name,**metrics(y[hold],pred),'window':window})
    chosen_ml = min(best,key=lambda n:best[n]['validation_MAE_pp'])
    chosen_base = f'{baseline_choice["stat"]}_{baseline_choice["window"] or "all"}'
    rows = []
    for name, pred in predictions.items():
        for pos,i in enumerate(hold):
            for rank in range(15):
                rows.append({'model':name, 'notice_id':meta.iloc[i]['id'], 'opened':meta.iloc[i]['opened'],
                    'rank':rank+1, 'actual_rate_percent':y[i,rank], 'predicted_rate_percent':pred[pos,rank],
                    'absolute_error_pp':abs(y[i,rank]-pred[pos,rank])})
    pd.DataFrame(rows).to_csv(HERE/'holdout-predictions.csv',index=False,encoding='utf-8-sig',float_format='%.8f')
    pd.DataFrame([{k:v for k,v in r.items() if k not in ['rank_MAE_pp','params']} for r in results]).to_csv(
        HERE/'model-comparison.csv',index=False,encoding='utf-8-sig')
    pd.DataFrame([{'model':r['model'],'rank':i+1,'MAE_pp':value} for r in results for i,value in enumerate(r['rank_MAE_pp'])]).to_csv(
        HERE/'per-rank-comparison.csv',index=False,encoding='utf-8-sig')
    pd.DataFrame([{**{k:v for k,v in r.items() if k not in ['params','fold_MAE_pp']},'params':json.dumps(r['params']),
        **{f'fold_{i+1}_MAE_pp':v for i,v in enumerate(r['fold_MAE_pp'])}} for r in trials]).to_csv(HERE/'hyperparameter-trials.csv',index=False)
    report = {'created_at':datetime.now().isoformat(), 'data_path':str(args.data),
        'data_sha256':hashlib.sha256(args.data.read_bytes()).hexdigest(),
        'source_count':len(records),'source_first':records[0]['opened'],'source_last':records[-1]['opened'],
        'usable_count':len(y),'feature_count':len(names),'feature_names':names,
        'holdout_count':len(hold),'holdout_from':meta.iloc[hold[0]]['opened'],'holdout_to':meta.iloc[hold[-1]]['opened'],
        'train_count':len(train),'validation_blocks':FOLDS,'candidates_per_model':32,'folds_per_candidate':len(folds),
        'assumption':'Opening timestamp used as forecast reference; history available strictly after 7 days. Research assumption, not verified real-time deadline backtest.',
        'protocol':'Weights frozen for each six-month validation block and entire 2026 holdout. Historical input summaries and baselines updated sequentially after the 7-day embargo; no holdout labels used to fit weights or select hyperparameters.',
        'target':'15 descending PRICE ranks, not original lottery numbers; no selection-count or selected-flag features.',
        'constraints':'All predictions clipped to [97,103] and projected to nonincreasing ranks by isotonic regression.',
        'versions':{'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__,'sklearn':sklearn.__version__},
        'seed':SEED,'ANN_max_iter':5000,
        'convergence_retry':'ANN search repeated with identical 32 configurations and 3 pre2026 folds, increasing max_iter 800 to 5000 after convergence warnings. Initial results retained separately; no settings chosen from 2026 scores.',
        'best_configurations':best,'baseline_validation':val_baselines,
        'preselected_ML':chosen_ml,'preselected_baseline':chosen_base,
        'paired_comparison':bootstrap_difference(y[hold],predictions[chosen_ml],predictions[chosen_base],meta.iloc[hold]),
        'results':sorted(results,key=lambda r:r['MAE_pp']), 'total_seconds':time.perf_counter()-started}
    (HERE/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'results':[{k:v for k,v in r.items() if k!='rank_MAE_pp'} for r in report['results']],
        'preselected':chosen_ml,'baseline':chosen_base,'paired':report['paired_comparison'],'seconds':report['total_seconds']},ensure_ascii=True),flush=True)

if __name__ == '__main__':
    main()
