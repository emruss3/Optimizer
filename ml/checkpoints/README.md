# Model checkpoints kept with the code

These are the trained files behind the results in `strategy/overnight-log-2026-11-11-part3.md` (Project docs). They were trained in a temporary
workspace while the Modal service was disabled, and would otherwise have been lost with it. Once Modal is back they belong on the Modal Volume,
and this folder can go.

| Folder | Run | Trained | Result through the engine (code-clean lots, layouts fitted to the code) |
|---|---|---|---|
| `t1/` | Streets as paths, the engine's reading of site access as context; 825 steps | 2026-11-12, 25 minutes on two CPU cores | Development sites: 1,090 against 960 for the engine alone. Held-out sites: 3,401 against 3,188; added to the live search it gives 3,701 against 3,616 |
| `t3/` | The same with the streets-only loss and standard site views; 2,500 steps | 2026-11-12, 26 minutes on two CPU cores | Development sites: 1,047. Held-out not run |

Load with `layout_model.load_model(path)`. Each file carries its own settings.
