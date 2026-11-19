import sys
from PIL import Image
out=sys.argv[1]; files=sys.argv[2:]
ims=[Image.open(f) for f in files]
w,h=ims[0].size
c=Image.new('RGB',(w//2*len(ims),h//2),'white')
for i,im in enumerate(ims): c.paste(im.resize((w//2,h//2)),(i*w//2,0))
c.save(out)
