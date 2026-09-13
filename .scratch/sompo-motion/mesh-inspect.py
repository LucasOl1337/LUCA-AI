import json,struct,numpy as np
from PIL import Image
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
for name,nom in [('tractor',(5.8,3.2,2.7)),('harvester',(9.2,4,7.6))]:
 b=open('public/models/sompo/generated-agri-'+name+'.glb','rb').read(); n=struct.unpack_from('<I',b,12)[0]; j=json.loads(b[20:20+n]); data=b[28+n:]
 def attr(i):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];d={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];s={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];return np.frombuffer(data,dtype=d,count=a['count']*s,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,s)
 p=attr(0); uv=attr(2);idx=attr(3).reshape(-1,3);p=np.stack([p[:,1],-p[:,2],-p[:,0]],axis=1) if name=='tractor' else np.stack([-p[:,0],-p[:,2],-p[:,1]],axis=1);lo=p.min(0);hi=p.max(0);scale=min(np.array(nom)/(hi-lo));p=(p-np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]))*scale
 im=np.asarray(Image.open('public/models/sompo/generated-agri-'+name+'-basecolor.jpg'))/255;u=uv[idx].mean(1);colors=im[np.clip((u[:,1]*im.shape[0]).astype(int),0,im.shape[0]-1),np.clip((u[:,0]*im.shape[1]).astype(int),0,im.shape[1]-1)]
 fig,axes=plt.subplots(2,1,figsize=(13,9));
 for ax,dims,depth in [(axes[0],[0,1],2),(axes[1],[0,2],1)]:
  order=np.argsort(p[idx,depth].mean(1));ax.add_collection(PolyCollection(p[idx[order]][:,:,dims],facecolors=colors[order],edgecolors='none'));ax.autoscale();ax.set_aspect('equal');ax.grid(alpha=.3);ax.set_xlabel('X: movimento à frente →');ax.set_ylabel('Y' if depth==2 else 'Z')
 fig.suptitle(name+' — geometria normalizada atual (m)');fig.tight_layout();fig.savefig('.scratch/sompo-motion/'+name+'-geometry.png',dpi=150)
 print(name,'bounds',p.min(0),p.max(0),'scale',scale)
 np.savez('.scratch/sompo-motion/'+name+'.npz',positions=p,indices=idx,uv=uv)
