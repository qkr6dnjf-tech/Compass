"""Render saved experiment results, without training or selecting any settings."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
r = json.loads((HERE/'results.json').read_text(encoding='utf-8'))
plt.rcParams.update({'font.family':'Malgun Gothic','axes.unicode_minus':False,'font.size':10})
by_name = {v['model']:v for v in r['results']}
ml_names = ['RF','SVR','kNN','ANN']
baseline = r['preselected_baseline']
selected = sorted(ml_names+[baseline],key=lambda n:by_name[n]['MAE_pp'])
fig, ax = plt.subplots(1,2,figsize=(13,5),layout='constrained')
colors = {name:color for name,color in zip(ml_names,['#26719c','#db7a27','#578c55','#8c61b5'])}
colors[baseline] = '#66717a'
ax[0].barh(selected,[by_name[n]['MAE_pp'] for n in selected],color=[colors[n] for n in selected])
ax[0].invert_yaxis()
for i,n in enumerate(selected):
    ax[0].text(by_name[n]['MAE_pp']+.0005,i,f"{by_name[n]['MAE_pp']:.5f}",va='center')
ax[0].set_xlim(0,max(by_name[n]['MAE_pp'] for n in selected)*1.23)
ax[0].set_xlabel('15개 가격순위 평균 절대오차 (%p, 낮을수록 좋음)')
ax[0].set_title(f"2026년 공고 {r['holdout_count']}건 · 설정 선택에 미사용")
for n in ml_names+[baseline]:
    ax[1].plot(range(1,16),by_name[n]['rank_MAE_pp'],label=n,color=colors[n],marker='o',markersize=3)
ax[1].set_xlabel('가격순위 (1위가 가장 높은 예비가격)')
ax[1].set_ylabel('평균 절대오차 (%p)')
ax[1].set_xticks(range(1,16))
ax[1].set_ylim(bottom=0)
ax[1].grid(alpha=.2)
ax[1].legend()
ax[1].set_title('가격순위별 오차')
fig.savefig(HERE/'model-comparison.png',dpi=180)
plt.close(fig)

lines = [
'# 가격순 1~15위 사정률 예측 모델 비교', '',
f"자료: 검산된 ±3% 공고 {r['source_count']:,}건, {r['source_first']} ~ {r['source_last']}.",
f"최종 평가: {r['holdout_from']} ~ {r['holdout_to']}, {r['holdout_count']}건 × 15위 = {r['holdout_count']*15:,}개 값.", '',
'## 실험 설계', '',
'- 예측 대상은 가격 내림차순 1~15위 사정률이다. 원본 추첨번호나 선정될 네 순위를 예측한 성적이 아니다.',
'- 2024년 하반기, 2025년 상반기, 2025년 하반기의 세 순차 검증 구간에서 설정을 고른다.',
'- 모델마다 32개 설정 × 3구간 = 96회 학습, 네 모델 총 384회 튜닝 학습. 2026년 결과로 설정을 다시 고르지 않는다.',
'- 학습 공고 수 30·60·200개·전체를 각각 8개 설정씩 비교한다. 무작위 탐색이며 모든 조합의 전수 탐색은 아니다.',
'- 모델 가중치는 각 반년 검증 구간 시작 전에 고정한다. 최종 평가 가중치는 2026년 시작 전에 고정한다.',
'- 과거 통계 입력과 평균·중앙값 기준은 공고마다 당시 이용 가능한 과거 결과로 갱신한다. 이미 지나간 2026년 결과도 7일이 지난 후에는 이후 예측의 통계 입력으로 쓰지만, 최종 평가의 모델 가중치를 재학습하거나 설정을 고르는 데 쓰지 않는다.',
'- 최초 공개시각·실제 투찰 마감시각의 검증이 없으므로, 개찰시각을 예측 기준으로 하고 개찰 후 7일이 지난 과거 자료를 사용할 수 있다고 가정한 연구용 검증이다.',
f"- 입력 {r['feature_count']}개: 기초금액 로그, 연·월, 지역, 공사명 키워드, 과거 30·60·200개 사정률의 순위별 평균·중앙값·표준편차 등. 해당 공고의 실제 사정률·선정여부·추첨횟수는 입력하지 않는다.",
'- 입력·출력 정규화는 각 학습 구간에서만 적합한다. RF는 입력 정규화가 없고 나머지 세 모델은 입력 표준화를 한다. 출력은 모두 순위별 표준화를 적용한다.',
'- 예측값은 97~103%로 제한하고 등위 회귀로 가격순위의 내림차순 제약을 적용한다. 같은 처리를 모든 모델에 적용한다.',
'- 오차 단위 %p는 사정률 자체의 차이다. 소수점 다섯 자리 표시는 그만큼 정확하다는 뜻이 아니다.', '',
'## 최종 평가 결과', '',
'|모델|검증 MAE (%p)|2026 MAE (%p)|2026 RMSE (%p)|학습 공고 수|',
'|---|---:|---:|---:|---:|']
for row in r['results']:
    name = row['model']
    val = row.get('validation_MAE_pp')
    lines.append(f"|{name}|{val:.5f}|{row['MAE_pp']:.5f}|{row['RMSE_pp']:.5f}|{row['window'] or '전체'}|" if val is not None else
        f"|{name}|—|{row['MAE_pp']:.5f}|{row['RMSE_pp']:.5f}|{row['window'] or '전체'}|")
lines += ['',f"검증에서 미리 선택한 ML 모델: **{r['preselected_ML']}**. 검증에서 미리 선택한 통계 기준: **{baseline}**.",
    f"두 방법의 2026 MAE 차이(ML−통계 기준): {r['paired_comparison']['difference_MAE_pp']:.6f}%p. 월 단위 묶음 부트스트랩 95% 구간: {r['paired_comparison']['month_block_bootstrap_95pct']}. 음수이면 ML의 오차가 작다. 이 구간은 월별 묶음을 재추출한 결과이며 미래 성능의 보증이 아니다.", '',
    '최종 탐색은 384회 학습이며, 최초 ANN 96회와 합쳐 튜닝 학습은 총 480회 수행했다. 일부 탈락 ANN 설정은 5,000회 한도에서도 수렴 경고가 남았다. 이 비교는 탐색한 범위의 결과이다.', '', 'ANN의 800회 반복 한도에서 수렴 경고가 발생해, 같은 32개 설정을 최대 5,000회로 다시 비교했다. 설정 선택은 이전과 같은 2026년 이전 검증 구간에서만 수행했다. 최초 결과는 initial-800-iterations에 별도 보존했다.', '', '## 모델별 선택된 설정', '']
for name in ml_names:
    best=r['best_configurations'][name]
    lines += [f"### {name}", '',f"학습 공고 수: {best['window'] or '전체'}", '',
        '```json',json.dumps(best['params'],ensure_ascii=False,indent=2),'```','']
lines += ['ANN 공통 설정: Adam, 최대 5,000회 반복, 무작위 조기 종료 분리 없음, tol=1e-5, n_iter_no_change=40. 은닉층 2·3개와 노드 수를 탐색했으며 출력 노드는 15개다.', '',
    '## 파일과 재현', '',
    '이번 실험은 15개 가격순위 사정률의 예측을 비교한다. 사이트의 평균·중앙값 예측과 별도로 실행한 실험이며, RF·SVR·kNN·ANN 추론은 아직 웹 화면에 연결하지 않았다.', '',
    '- `results.json`: 원본 데이터 해시, 환경 버전, 구간, 선택된 설정, 모든 요약 지표.',
    '- `hyperparameter-trials.csv`: 128개 설정 및 세 검증 구간별 오차.',
    '- `holdout-predictions.csv`: 모델별·공고별·가격순위별 실제값, 예측값, 오차.',
    '- `per-rank-comparison.csv`: 각 가격순위의 오차.',
    '- `model-*-pre2026.joblib`: 2026년 이전 자료로 적합한 평가용 모델. 최신 전체 자료로 재학습한 배포 모델이 아니다.',
    '- `model-comparison.png`: 전체 오차와 가격순위별 오차.', '',
    '```powershell', 'python experiment.py --jobs 4', 'python report.py', '```', '',
    '기존 `tuning-*.json` 파일이 있으면 저장된 탐색 결과를 재사용한다. 데이터나 탐색 코드를 바꾸면 결과 파일을 별도 폴더로 옮긴 뒤 다시 실행해야 한다.', '',
    'RF: 트리 150·300개, 깊이 무제한·3·6·10, 최소 리프 표본 1·5·15·30, 특성 비율 0.35·0.7·1.0.',
    'SVR: RBF, C=0.03·0.1·0.3·1·3·10, epsilon=0.02·0.1·0.3·0.5, gamma=scale·0.001·0.01·0.1. 사정률 15개를 각각 별도 SVR로 학습한다.',
    'kNN: 이웃 3·5·10·15·25·30개, 균등·거리 가중, 맨해튼·유클리드 거리.',
    'ANN: 은닉층 (16,16)·(32,32)·(64,32)·(64,64)·(128,64)·(16,16,16)·(32,32,16)·(64,32,16)·(64,64,32)·(128,64,32), ReLU·tanh, alpha=0.0001·0.01·0.1·1·10, 학습률 0.0003·0.001·0.003.', '',
    '[scikit-learn: 시계열 순차 분할](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit) · [무작위 설정 탐색](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.RandomizedSearchCV)', '']
(HERE/'README.md').write_text('\n'.join(lines),encoding='utf-8')
print('Saved README.md and model-comparison.png')
