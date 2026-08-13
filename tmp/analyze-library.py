import glob,json,os,re
root=r'C:\Users\Danie\AppData\Local\com.opengamelauncher.desktop\EBWebView\Default\Local Storage\leveldb'
files=glob.glob(root+'/*'); best=[]
for p in files:
 try:b=open(p,'rb').read()
 except:continue
 # Search each occurrence and parse the UTF-16LE payload. Last records can be in .ldb files.
 for m in re.finditer(b'launcher_library_snapshot',b):
  text=b[m.end():].decode('utf-16le','ignore'); a=text.find('['); z=text.rfind(']')
  if a<0 or z<=a: continue
  s=''.join(c if ord(c)>=32 or c in '\n\r\t' else ' ' for c in text[a:z+1])
  # Parse balanced game objects. The snapshot may contain binary tail corruption.
  objs=[]; depth=0; ins=False; esc=False; start=None
  for j,c in enumerate(s):
   if ins:
    if esc: esc=False
    elif c=='\\': esc=True
    elif c=='"': ins=False
   elif c=='"': ins=True
   elif c=='{':
    if depth==0:start=j
    depth+=1
   elif c=='}':
    depth-=1
    if depth==0:
     try:objs.append(json.loads(s[start:j+1]))
     except:pass
  if len(objs)>len(best): best=objs
print('games',len(best))
from collections import defaultdict
missing=defaultdict(list); counts=defaultdict(int)
for g in best:
 source=g.get('launcher') or 'unknown'; counts[source]+=1
 # Library rows can fall back from icon -> logo -> cover, so no usable image means all absent.
 if not any(g.get(k) for k in ('coverUrl','logoUrl','iconUrl')): missing[source].append(g.get('title','?'))
print('counts',dict(counts)); print('missing total',sum(map(len,missing.values())))
for source,names in missing.items():
 print('\n'+source, len(names)); print('\n'.join(' - '+n for n in names))
