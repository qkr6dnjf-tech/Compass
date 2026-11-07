"""Render the shared-axis PNG and PDF from observations.csv. Requires pandas and matplotlib."""
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as md
from matplotlib import font_manager

out=Path(__file__).resolve().parent
fonts={font.name for font in font_manager.fontManager.ttflist}
plt.rcParams['font.family']=next((name for name in ['Malgun Gothic','Noto Sans CJK KR','AppleGothic'] if name in fonts),'sans-serif')
plt.rcParams['axes.unicode_minus']=False
df=pd.read_csv(out/'observations.csv',parse_dates=['opened_kst'])
stats=df.groupby('price_rank').rate_pct.agg(median='median')
period=f'{df.opened_kst.min():%Y.%m.%d} ~ {df.opened_kst.max():%Y.%m.%d}'
fig,axes=plt.subplots(5,3,figsize=(17.5,13.7),sharex=True,sharey=True)
for k,ax in enumerate(axes.flat,1):
 q=df[df.price_rank==k];ax.scatter(q.opened_kst,q.rate_pct,color='#12644e',alpha=.48,s=10,linewidths=0)
 ax.axhline(100,color='#a4aaa5',lw=.7);ax.grid(axis='y',color='#dfe5df',lw=.65);ax.set_axisbelow(True)
 ax.set_ylim(97,103);ax.set_yticks(np.arange(97,104));ax.set_ylabel('사정률 (%)');ax.tick_params(axis='y',labelleft=True,labelsize=9);ax.tick_params(axis='x',labelbottom=True,labelsize=8)
 loc=md.AutoDateLocator(minticks=3,maxticks=5);ax.xaxis.set_major_locator(loc);ax.xaxis.set_major_formatter(md.ConciseDateFormatter(loc))
 ax.set_title(f'{k}번    중앙값 {stats.loc[k,"median"]:.3f}%',loc='left',fontsize=11)
 ax.spines['top'].set_visible(False);ax.spines['right'].set_visible(False)
fig.suptitle('가격순 1~15번 예비가격 사정률',x=.065,y=.98,ha='left',fontsize=22,fontweight='bold')
fig.text(.065,.94,f'전북·전주·군산·익산 조경공사   |   명시 범위 ±3%   |   {df.notice.nunique():,}건   |   {period}',fontsize=12)
fig.text(.065,.916,'모든 패널 세로축 97~103%, 눈금 간격 1%p   ·   점 하나 = 공고 한 건   ·   가로축 = 실제 개찰일',fontsize=10)
fig.subplots_adjust(top=.88,bottom=.07,left=.065,right=.99,hspace=.64,wspace=.21);fig.savefig(out/'rank-history.png',dpi=145);fig.savefig(out/'rank-history.pdf');plt.close(fig)
