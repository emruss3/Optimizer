import json,pickle,sys
from gen2 import *
U=json.load(open('usable.json')); E=[e for e in pickle.load(open('E2.pkl','rb')) if U[e['pid']]]
train(E,int(sys.argv[1]),'gen_pos.pt')
