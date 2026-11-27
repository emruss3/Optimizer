# Generative layout model (offline)

`gen2.py` is a small transformer that writes a whole residential site plan as tokens:
drive centrelines, then buildings (type, position, size, angle, units), then parking fields,
conditioned on the site boundary (with edge classes), site size, product family and target units.
`eval2.py` samples plans on development sites, runs the same checks on the generated and the
civil plans, and compares design measures against a nearest-plan lookup.

First run (2026-11-13, 102 training plans, 46 development sites): the model loses to the lookup
(error 0.90 against 0.56) and hits the unit target on 8 of 46 sites. Not for production.
Training data is exported from Supabase at run time and is not stored here.
