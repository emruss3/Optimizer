import json,sys
print(json.load(open('/home/claude/review/jobs.json'))[int(sys.argv[1])][2])
