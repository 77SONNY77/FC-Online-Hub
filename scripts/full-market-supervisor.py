"""Bounded execution only. Does not edit cron or bypass the collector's safety policy."""
import datetime,json,os,subprocess,time,fcntl
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'.local/phase47s'
lock=open(out/'supervisor.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
kst=datetime.timezone(datetime.timedelta(hours=9));run=(out/'run-id.txt').read_text().strip()
profile=json.loads((out/'operating-profile.json').read_text());profile.pop('PRICE_FULL_STOP_AT',None)
started=time.time();end=started+24*3600;iterations=0

def legacy_running():
 rows=subprocess.check_output(['ps','-axo','command'],text=True).splitlines()
 return any('python' in s.lower() and ('-m scripts.crawl_prices' in s or '/crawl_prices.py' in s) for s in rows)

def window(now):
 # Observed local cron: every two hours HOT, daily 04:30 Full.
 # Buffer starts 5min early. Process inspection prevents resume while legacy is still running.
 midnight=now.replace(hour=0,minute=0,second=0,microsecond=0)
 spans=[]
 for day in [-1,0,1]:
  base=midnight+datetime.timedelta(days=day)
  for hour in range(0,24,2):
   t=base+datetime.timedelta(hours=hour);spans.append((t-datetime.timedelta(minutes=5),t+datetime.timedelta(minutes=45)))
  spans.append((base+datetime.timedelta(hours=4,minutes=25),base+datetime.timedelta(hours=5,minutes=30)))
 active=[b for a,b in spans if a<=now<b]
 if active:return max(active),None
 return None,min(a for a,b in spans if a>now)

def state(**extra):
 (out/'supervisor-status.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pid':os.getpid(),'runId':run,'iterations':iterations,**extra},indent=2))

while time.time()<end and iterations<24:
 now=datetime.datetime.now(kst);pause,deadline=window(now)
 if pause or legacy_running():
  state(status='WAITING_FOR_LEGACY',eligibleAfter=pause.isoformat() if pause else None);time.sleep(30);continue
 iterations+=1;env=os.environ.copy();env.update(profile);env['PRICE_FULL_STOP_AT']=deadline.isoformat()
 state(status='RUNNING',stopAt=deadline.isoformat())
 with open(out/'coordinator.log','a') as log:
  p=subprocess.Popen([str(root/'node_modules/.bin/tsx'),'src/jobs/full-coordinator.ts','--resume',run,'--batches','100','--batch-size','50'],cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
  (out/'process.json').write_text(json.dumps({'pid':p.pid,'supervisorPid':os.getpid(),'runId':run,'stopAt':deadline.isoformat()},indent=2))
  code=p.wait()
 result=json.loads((out/'result.json').read_text()) if (out/'result.json').exists() else {}
 reason=result.get('stopReason','WORKER_FAILED')
 state(status='WORKER_STOPPED',exitCode=code,reason=reason)
 if reason=='SOURCE_PAUSED' and datetime.datetime.now(kst)>=deadline and code==0:continue
 break
else:state(status='SUPERVISOR_LIMIT')
