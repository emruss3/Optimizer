import json,sys
b=int(sys.argv[1]); s=sys.argv[2]  # string of 0/1/? per index
order=json.load(open(f'thumbs/b{b}.json'))
assert len(s)==len(order),(len(s),len(order))
L=json.load(open('vlabels.json')) if __import__('os').path.exists('vlabels.json') else {}
for fid,c in zip(order,s):
    if c in '01': L[str(fid)]=int(c)
json.dump(L,open('vlabels.json','w')); print(len(L), sum(L.values()))
