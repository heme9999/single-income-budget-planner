# Monthly Budget Planner for Single Income Household

Free, no-signup, client-side monthly budget planner for single-income households. All numbers stay in the browser (localStorage). No account, no tracking, no server.

## What it does

- Monthly take-home pay with pay-frequency conversion (weekly / bi-weekly / semi-monthly / monthly), including irregular pay (3-month average or base + variable)
- Editable expense rows (planned / actual / due day / paid) across 9 categories
- Sinking funds (annual costs spread monthly) and emergency-fund months-covered indicator
- "Left to assign" zero-based indicator and a selectable split guide (50/30/20 default)
- Per-month plans with copy-to-next-month, JSON backup/restore, CSV export, print (completed budget + blank worksheet)
- Household presets with example data: single adult, single parent, one-earner couple

## Stack

Static HTML/CSS/JS. No build step, no backend, no external requests. Deploy any static host (currently Cloudflare Pages).

## Local preview

```sh
python3 -m http.server --directory .
```

Then open http://localhost:8000/

## Note

This is a planning tool, not financial advice.

