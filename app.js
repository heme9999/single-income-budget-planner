/* Single Income Budget Planner — client-side only.
   No network requests. All data stays in localStorage.
   Pure math helpers are exported when loaded under Node (for testing). */
(function () {
  'use strict';

  /* ---------------- Pure helpers ---------------- */

  function num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function freqToMonthly(amount, freq) {
    var a = num(amount);
    switch (freq) {
      case 'weekly': return a * 52 / 12;
      case 'biweekly': return a * 26 / 12;
      case 'semimonthly': return a * 2;
      case 'monthly': default: return a;
    }
  }

  function fmt(n) {
    var v = Math.round(n * 100) / 100;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid() {
    return 'r' + Math.random().toString(36).slice(2, 9);
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  /* ---------------- Constants ---------------- */

  var CATEGORIES = [
    { id: 'housing', name: 'Housing' },
    { id: 'utilities', name: 'Utilities' },
    { id: 'food', name: 'Food' },
    { id: 'transport', name: 'Transport' },
    { id: 'childcare', name: 'Childcare' },
    { id: 'debt', name: 'Debt payments' },
    { id: 'insurance', name: 'Insurance' },
    { id: 'savings', name: 'Savings' },
    { id: 'personal', name: 'Personal' }
  ];

  /* Essentials = the spending an emergency fund has to cover. */
  var ESSENTIAL_IDS = ['housing', 'utilities', 'food', 'transport', 'childcare', 'debt', 'insurance'];
  var NEEDS_IDS = ['housing', 'utilities', 'food', 'transport', 'childcare', 'insurance', 'debt'];

  var GUIDES = {
    '50/30/20': { label: '50/30/20', needs: 50, wants: 30, savings: 20,
      note: 'A widely used rule of thumb: about 50% of take-home pay for needs, 30% for wants, 20% for savings and extra debt payments.' },
    '60/20/20': { label: '60/20/20 — high fixed costs', needs: 60, wants: 20, savings: 20,
      note: 'For households where rent and bills take a bigger share of one paycheck.' },
    'austerity': { label: 'Austerity — 70/15/15', needs: 70, wants: 15, savings: 15,
      note: 'A tighter split for a lean stretch. Useful for a few months, not as a permanent plan.' },
    'custom': { label: 'Custom', needs: 50, wants: 30, savings: 20,
      note: 'Set your own split. The three numbers should add to 100.' }
  };

  var FREQS = [
    { v: 'weekly', label: 'Weekly' },
    { v: 'biweekly', label: 'Every 2 weeks' },
    { v: 'semimonthly', label: 'Twice a month' },
    { v: 'monthly', label: 'Monthly' }
  ];

  /* ---------------- Plans & presets ---------------- */

  function blankPlan() {
    var e = {};
    CATEGORIES.forEach(function (c) { e[c.id] = []; });
    return {
      income: [],
      irregular: { mode: 'average', average: 0, base: 0, variable: 0 },
      expenses: e,
      sinking: [],
      emergencySavings: 0,
      guide: '50/30/20',
      customGuide: { needs: 50, wants: 30, savings: 20 }
    };
  }

  function row(name, planned, actual, due, paid) {
    return { id: uid(), name: name, planned: planned, actual: actual || 0, due: due || '', paid: !!paid };
  }

  var PRESETS = {
    'single-adult': {
      label: 'Single adult',
      plan: (function () {
        var p = blankPlan();
        p.income = [{ id: uid(), name: 'Paycheck', amount: 3800, freq: 'monthly' }];
        p.expenses.housing = [row('Rent', 1400, 0, 1)];
        p.expenses.utilities = [row('Electric + internet', 180, 0, 15)];
        p.expenses.food = [row('Groceries', 350, 0, '')];
        p.expenses.transport = [row('Bus pass + gas', 280, 0, '')];
        p.expenses.debt = [row('Credit card', 200, 0, 20)];
        p.expenses.insurance = [row('Renter + health', 150, 0, 10)];
        p.expenses.savings = [row('Emergency fund', 300, 0, 1)];
        p.expenses.personal = [row('Fun money', 240, 0, '')];
        p.sinking = [{ id: uid(), name: 'Car insurance (annual)', amount: 1200, freq: 'annual' }];
        p.emergencySavings = 2500;
        return p;
      })()
    },
    'single-parent': {
      label: 'Single parent',
      plan: (function () {
        var p = blankPlan();
        p.income = [{ id: uid(), name: 'Paycheck', amount: 4200, freq: 'monthly' }];
        p.expenses.housing = [row('Rent', 1600, 0, 1)];
        p.expenses.utilities = [row('Electric + internet + phone', 220, 0, 15)];
        p.expenses.food = [row('Groceries', 550, 0, '')];
        p.expenses.transport = [row('Gas + car upkeep', 320, 0, '')];
        p.expenses.childcare = [row('After-school care', 800, 0, 5)];
        p.expenses.debt = [row('Credit card', 150, 0, 20)];
        p.expenses.insurance = [row('Health + car', 180, 0, 10)];
        p.expenses.savings = [row('Emergency fund', 200, 0, 1)];
        p.expenses.personal = [row('Fun money', 150, 0, '')];
        p.sinking = [
          { id: uid(), name: 'Car insurance (annual)', amount: 1200, freq: 'annual' },
          { id: uid(), name: 'Kids\u2019 clothes + school (annual)', amount: 600, freq: 'annual' }
        ];
        p.emergencySavings = 3000;
        return p;
      })()
    },
    'one-earner-couple': {
      label: 'One-earner couple',
      plan: (function () {
        var p = blankPlan();
        p.income = [{ id: uid(), name: 'Paycheck', amount: 6500, freq: 'monthly' }];
        p.expenses.housing = [row('Mortgage', 2000, 0, 1)];
        p.expenses.utilities = [row('Electric, water + internet', 300, 0, 15)];
        p.expenses.food = [row('Groceries', 700, 0, '')];
        p.expenses.transport = [row('Two cars: gas + upkeep', 450, 0, '')];
        p.expenses.debt = [row('Car loan', 350, 0, 12)];
        p.expenses.insurance = [row('Home + car + health', 250, 0, 10)];
        p.expenses.savings = [row('Emergency fund', 800, 0, 1)];
        p.expenses.personal = [row('Fun money (both)', 400, 0, '')];
        p.sinking = [
          { id: uid(), name: 'Home insurance (annual)', amount: 1800, freq: 'annual' },
          { id: uid(), name: 'Holidays (annual)', amount: 1200, freq: 'annual' }
        ];
        p.emergencySavings = 6000;
        return p;
      })()
    },
    'freelancer-single': {
      label: 'Single adult, irregular pay',
      plan: (function () {
        var p = blankPlan();
        p.income = [];
        p.irregular = { mode: 'base-variable', average: 0, base: 2200, variable: 800 };
        p.expenses.housing = [row('Rent', 1400, 0, 1)];
        p.expenses.utilities = [row('Electric + internet', 180, 0, 15)];
        p.expenses.food = [row('Groceries', 350, 0, '')];
        p.expenses.transport = [row('Gas + car upkeep', 280, 0, '')];
        p.expenses.debt = [row('Credit card', 200, 0, 20)];
        p.expenses.insurance = [row('Renter + health', 150, 0, 10)];
        p.expenses.savings = [row('Emergency fund', 300, 0, 1)];
        p.expenses.personal = [row('Fun money', 240, 0, '')];
        p.sinking = [{ id: uid(), name: 'Car insurance (annual)', amount: 1200, freq: 'annual' }];
        p.emergencySavings = 2500;
        return p;
      })()
    }
  };

  /* ---------------- Math ---------------- */

  function computePlan(plan) {
    var income = 0;
    plan.income.forEach(function (r) { income += freqToMonthly(r.amount, r.freq); });
    if (plan.irregular.mode === 'base-variable') {
      income += num(plan.irregular.base) + num(plan.irregular.variable);
    } else {
      income += num(plan.irregular.average);
    }

    var byCat = {};
    var plannedTotal = 0, actualTotal = 0;
    CATEGORIES.forEach(function (c) {
      var p = 0, a = 0;
      (plan.expenses[c.id] || []).forEach(function (r) { p += num(r.planned); a += num(r.actual); });
      byCat[c.id] = { planned: p, actual: a };
      plannedTotal += p;
      actualTotal += a;
    });

    var sinkingMonthly = 0;
    plan.sinking.forEach(function (s) {
      var amt = num(s.amount);
      sinkingMonthly += s.freq === 'twice-yearly' ? amt * 2 / 12 : amt / 12;
    });

    var leftToAssign = income - plannedTotal - sinkingMonthly;

    var essential = 0;
    ESSENTIAL_IDS.forEach(function (id) { essential += byCat[id].planned; });
    var monthsCovered = essential > 0 ? num(plan.emergencySavings) / essential : 0;

    var needs = 0;
    NEEDS_IDS.forEach(function (id) { needs += byCat[id].planned; });
    var buckets = {
      needs: needs,
      wants: byCat.personal.planned,
      savings: byCat.savings.planned + sinkingMonthly
    };

    return {
      income: income, byCat: byCat, plannedTotal: plannedTotal, actualTotal: actualTotal,
      sinkingMonthly: sinkingMonthly, leftToAssign: leftToAssign,
      essential: essential, monthsCovered: monthsCovered, buckets: buckets
    };
  }

  /* ---------------- Storage ---------------- */

  var LS_KEY = 'sibp-plans-v1';

  function loadPlans() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function savePlans(p) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) { /* storage full or blocked; keep going */ }
  }
  function getPlan(month) { return loadPlans()[month] || null; }
  function setPlan(month, plan) { var p = loadPlans(); p[month] = plan; savePlans(p); }
  function deletePlan(month) { var p = loadPlans(); delete p[month]; savePlans(p); }

  function currentMonthStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function nextMonthStr(m) {
    var y = parseInt(m.slice(0, 4), 10), mo = parseInt(m.slice(5, 7), 10);
    mo += 1; if (mo > 12) { mo = 1; y += 1; }
    return y + '-' + String(mo).padStart(2, '0');
  }

  /* ---------------- Rendering ---------------- */

  function freqOptions(selected) {
    return FREQS.map(function (f) {
      return '<option value="' + f.v + '"' + (f.v === selected ? ' selected' : '') + '>' + f.label + '</option>';
    }).join('');
  }

  function renderPlanner(container, state) {
    var plan = state.plan;
    var t = computePlan(plan);
    var guide = GUIDES[plan.guide] || GUIDES['50/30/20'];
    var gNeeds = plan.guide === 'custom' ? num(plan.customGuide.needs) : guide.needs;
    var gWants = plan.guide === 'custom' ? num(plan.customGuide.wants) : guide.wants;
    var gSavings = plan.guide === 'custom' ? num(plan.customGuide.savings) : guide.savings;
    var gSum = gNeeds + gWants + gSavings;

    var h = '';
    h += '<h2>Your monthly budget</h2>';
    h += '<p class="p-intro">Free, no signup. Your numbers are saved only in this browser.</p>';

    /* Month + presets */
    h += '<div class="p-bar">';
    h += '<label>Month <input type="month" data-field="month" value="' + esc(state.month) + '"></label>';
    h += '<button type="button" data-action="copy-next">Copy plan to next month</button>';
    h += '</div>';
    h += '<div class="p-presets"><span>Load an example:</span> ';
    Object.keys(PRESETS).filter(function (k) { return k !== 'freelancer-single'; }).forEach(function (k) {
      h += '<button type="button" data-action="load-preset" data-preset="' + k + '">' + esc(PRESETS[k].label) + '</button> ';
    });
    h += '<button type="button" data-action="clear-plan" class="p-danger">Clear and start mine</button></div>';

    /* Income */
    h += '<h3>Income — monthly take-home pay</h3>';
    h += '<div class="p-rows">';
    plan.income.forEach(function (r) {
      h += '<div class="p-row"><input type="text" data-income="name" data-id="' + r.id + '" value="' + esc(r.name) + '" placeholder="Paycheck" aria-label="Income name">'
        + '<input type="number" min="0" step="0.01" inputmode="decimal" data-income="amount" data-id="' + r.id + '" value="' + esc(r.amount) + '" placeholder="0" aria-label="Amount per pay period">'
        + '<select data-income="freq" data-id="' + r.id + '" aria-label="Pay frequency">' + freqOptions(r.freq) + '</select>'
        + '<button type="button" data-action="del-income" data-id="' + r.id + '" aria-label="Delete income line">×</button></div>';
    });
    h += '</div>';
    h += '<button type="button" data-action="add-income">+ Add a paycheck</button>';

    h += '<div class="p-irregular"><p><strong>Irregular pay?</strong> Use one of these instead of guessing a single number.</p>'
      + '<label><input type="radio" name="irregular-mode" data-field="irregular-mode" value="average"' + (plan.irregular.mode !== 'base-variable' ? ' checked' : '') + '> Average of the last 3 months</label> '
      + '<label><input type="radio" name="irregular-mode" data-field="irregular-mode" value="base-variable"' + (plan.irregular.mode === 'base-variable' ? ' checked' : '') + '> Base + variable</label>';
    if (plan.irregular.mode === 'base-variable') {
      h += '<div class="p-row"><label>Base pay / month <input type="number" min="0" step="0.01" inputmode="decimal" data-field="irregular-base" value="' + esc(plan.irregular.base) + '"></label>'
        + '<label>Average variable / month <input type="number" min="0" step="0.01" inputmode="decimal" data-field="irregular-variable" value="' + esc(plan.irregular.variable) + '"></label></div>';
    } else {
      h += '<div class="p-row"><label>Average monthly pay (last 3 months) <input type="number" min="0" step="0.01" inputmode="decimal" data-field="irregular-average" value="' + esc(plan.irregular.average) + '"></label></div>';
    }
    h += '</div>';
    h += '<p class="p-total">Total monthly income: <strong>' + fmt(t.income) + '</strong></p>';

    /* Expenses */
    h += '<h3>Planned vs. actual spending</h3>';
    h += '<p class="p-hint">Planned is what you intend to spend. Actual is what you really spent. Tick “paid” when a bill is done.</p>';
    CATEGORIES.forEach(function (c) {
      var rows = plan.expenses[c.id] || [];
      h += '<div class="p-cat"><h4>' + esc(c.name) + ' — planned ' + fmt(t.byCat[c.id].planned) + '</h4>';
      rows.forEach(function (r) {
        h += '<div class="p-row p-expense"><input type="text" data-exp="name" data-cat="' + c.id + '" data-id="' + r.id + '" value="' + esc(r.name) + '" placeholder="Item" aria-label="Item name">'
          + '<label>Planned <input type="number" min="0" step="0.01" inputmode="decimal" data-exp="planned" data-cat="' + c.id + '" data-id="' + r.id + '" value="' + esc(r.planned) + '"></label>'
          + '<label>Actual <input type="number" min="0" step="0.01" inputmode="decimal" data-exp="actual" data-cat="' + c.id + '" data-id="' + r.id + '" value="' + esc(r.actual) + '"></label>'
          + '<label>Due day <input type="number" min="1" max="31" inputmode="numeric" data-exp="due" data-cat="' + c.id + '" data-id="' + r.id + '" value="' + esc(r.due) + '" placeholder="—"></label>'
          + '<label class="p-paid"><input type="checkbox" data-exp="paid" data-cat="' + c.id + '" data-id="' + r.id + '"' + (r.paid ? ' checked' : '') + '> Paid</label>'
          + '<button type="button" data-action="del-expense" data-cat="' + c.id + '" data-id="' + r.id + '" aria-label="Delete row">×</button></div>';
      });
      h += '<button type="button" data-action="add-expense" data-cat="' + c.id + '">+ Add a ' + esc(c.name.toLowerCase()) + ' row</button></div>';
    });

    /* Sinking funds */
    h += '<h3>Sinking funds</h3>';
    h += '<p class="p-hint">Annual or twice-yearly costs, split into a monthly set-aside so they never surprise you.</p>';
    plan.sinking.forEach(function (s) {
      var monthly = s.freq === 'twice-yearly' ? num(s.amount) * 2 / 12 : num(s.amount) / 12;
      h += '<div class="p-row"><input type="text" data-sink="name" data-id="' + s.id + '" value="' + esc(s.name) + '" placeholder="e.g. Car insurance" aria-label="Sinking fund name">'
        + '<label>Amount <input type="number" min="0" step="0.01" inputmode="decimal" data-sink="amount" data-id="' + s.id + '" value="' + esc(s.amount) + '"></label>'
        + '<select data-sink="freq" data-id="' + s.id + '" aria-label="How often"><option value="annual"' + (s.freq !== 'twice-yearly' ? ' selected' : '') + '>Once a year</option><option value="twice-yearly"' + (s.freq === 'twice-yearly' ? ' selected' : '') + '>Twice a year</option></select>'
        + '<span class="p-monthly">' + fmt(monthly) + ' / month</span>'
        + '<button type="button" data-action="del-sinking" data-id="' + s.id + '" aria-label="Delete sinking fund">×</button></div>';
    });
    h += '<button type="button" data-action="add-sinking">+ Add a sinking fund</button>';
    h += '<p class="p-total">Monthly set-aside: <strong>' + fmt(t.sinkingMonthly) + '</strong></p>';

    /* Emergency fund */
    h += '<h3>Emergency fund</h3>';
    h += '<label>Emergency savings balance <input type="number" min="0" step="0.01" inputmode="decimal" data-field="emergency" value="' + esc(plan.emergencySavings) + '"></label>';
    if (t.essential > 0) {
      h += '<p>Essential spending this month: ' + fmt(t.essential) + '. Your emergency fund covers about <strong>' + (Math.round(t.monthsCovered * 10) / 10) + ' months</strong> of essentials.</p>';
    } else {
      h += '<p>Add planned amounts to essential categories (housing, utilities, food, transport, childcare, debt, insurance) to see how many months your emergency fund covers.</p>';
    }

    /* Summary */
    var leftClass = t.leftToAssign < 0 ? 'p-negative' : 'p-positive';
    var leftNote = t.leftToAssign === 0 ? 'On target — every dollar has a job.'
      : t.leftToAssign > 0 ? 'Unassigned money. Give it a job: savings, extra debt, or a sinking fund.'
      : 'Over budget. Planned spending is higher than income — trim a category or move money from savings.';
    h += '<h3>Summary</h3><div class="p-summary">';
    h += '<p>Total monthly income: <strong>' + fmt(t.income) + '</strong></p>';
    h += '<p>Total planned spending: <strong>' + fmt(t.plannedTotal) + '</strong> (+ ' + fmt(t.sinkingMonthly) + ' sinking funds)</p>';
    h += '<p>Total actual spending so far: <strong>' + fmt(t.actualTotal) + '</strong></p>';
    h += '<p class="p-left ' + leftClass + '">Left to assign: <strong>' + fmt(t.leftToAssign) + '</strong></p>';
    h += '<p>' + leftNote + '</p></div>';

    /* Category share bars */
    h += '<h3>Where the money goes (planned share of income)</h3><div class="p-bars">';
    CATEGORIES.forEach(function (c) {
      var share = t.income > 0 ? t.byCat[c.id].planned / t.income * 100 : 0;
      var w = Math.min(100, Math.max(0, share));
      h += '<div class="p-bar-row"><span class="p-bar-label">' + esc(c.name) + '</span>'
        + '<span class="p-bar-track"><span class="p-bar-fill" style="width:' + w.toFixed(1) + '%"></span></span>'
        + '<span class="p-bar-value">' + fmt(t.byCat[c.id].planned) + ' · ' + share.toFixed(0) + '%</span></div>';
    });
    h += '</div>';

    /* Split guide */
    h += '<h3>Split guide</h3>';
    h += '<label>Guide <select data-field="guide">'
      + Object.keys(GUIDES).map(function (k) {
          return '<option value="' + k + '"' + (plan.guide === k ? ' selected' : '') + '>' + esc(GUIDES[k].label) + '</option>';
        }).join('')
      + '</select></label>';
    h += '<p class="p-hint">' + esc(guide.note) + '</p>';
    if (plan.guide === 'custom') {
      h += '<div class="p-row"><label>Needs % <input type="number" min="0" max="100" data-field="custom-needs" value="' + esc(plan.customGuide.needs) + '"></label>'
        + '<label>Wants % <input type="number" min="0" max="100" data-field="custom-wants" value="' + esc(plan.customGuide.wants) + '"></label>'
        + '<label>Savings % <input type="number" min="0" max="100" data-field="custom-savings" value="' + esc(plan.customGuide.savings) + '"></label></div>';
      if (gSum !== 100) h += '<p class="p-warn">Your custom split adds to ' + gSum + '%. It should add to 100%.</p>';
    }
    var pct = function (v) { return t.income > 0 ? (v / t.income * 100) : 0; };
    h += '<table class="p-table"><thead><tr><th>Bucket</th><th>Guide</th><th>Your plan</th><th>Comparison</th></tr></thead><tbody>'
      + '<tr><td>Needs (housing, utilities, food, transport, childcare, insurance, debt)</td><td>' + gNeeds + '%</td><td>' + fmt(t.buckets.needs) + ' · ' + pct(t.buckets.needs).toFixed(0) + '%</td><td>Your needs are ' + pct(t.buckets.needs).toFixed(0) + '% vs the ' + gNeeds + '% guide.</td></tr>'
      + '<tr><td>Wants (personal)</td><td>' + gWants + '%</td><td>' + fmt(t.buckets.wants) + ' · ' + pct(t.buckets.wants).toFixed(0) + '%</td><td>Your wants are ' + pct(t.buckets.wants).toFixed(0) + '% vs the ' + gWants + '% guide.</td></tr>'
      + '<tr><td>Savings (savings + sinking funds)</td><td>' + gSavings + '%</td><td>' + fmt(t.buckets.savings) + ' · ' + pct(t.buckets.savings).toFixed(0) + '%</td><td>Your savings are ' + pct(t.buckets.savings).toFixed(0) + '% vs the ' + gSavings + '% guide.</td></tr>'
      + '</tbody></table>';
    h += '<p class="p-hint">These are comparisons, not targets you must hit. A single income with high rent can sit above the needs guide and still be a workable plan.</p>';

    /* Backup / export / print */
    h += '<h3>Save, export, print</h3><div class="p-actions">';
    h += '<button type="button" data-action="download-json">Download backup (JSON)</button> ';
    h += '<label class="p-file">Restore backup (JSON) <input type="file" accept=".json,application/json" data-field="restore-file"></label> ';
    h += '<button type="button" data-action="export-csv">Export CSV</button> ';
    h += '<button type="button" data-action="print">Print my budget</button>';
    h += '</div>';

    h += '<p class="p-disclaimer">Your budget numbers stay in this browser. This is a planning tool, not financial advice. If debt feels unmanageable, consider a nonprofit credit counselor.</p>';

    container.innerHTML = h;
  }

  /* ---------------- Export helpers ---------------- */

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function toCSV(plan, t, month) {
    var lines = [['Month', 'Type', 'Category', 'Item', 'Planned', 'Actual', 'Due day', 'Paid']];
    plan.income.forEach(function (r) {
      lines.push([month, 'Income', '', r.name, freqToMonthly(r.amount, r.freq).toFixed(2), '', '', '']);
    });
    if (plan.irregular.mode === 'base-variable') {
      lines.push([month, 'Income', '', 'Irregular base', num(plan.irregular.base).toFixed(2), '', '', '']);
      lines.push([month, 'Income', '', 'Irregular variable (avg)', num(plan.irregular.variable).toFixed(2), '', '', '']);
    } else if (num(plan.irregular.average) > 0) {
      lines.push([month, 'Income', '', 'Irregular average (3 months)', num(plan.irregular.average).toFixed(2), '', '', '']);
    }
    CATEGORIES.forEach(function (c) {
      (plan.expenses[c.id] || []).forEach(function (r) {
        lines.push([month, 'Expense', c.name, r.name, num(r.planned).toFixed(2), num(r.actual).toFixed(2), r.due || '', r.paid ? 'yes' : 'no']);
      });
    });
    plan.sinking.forEach(function (s) {
      var m = s.freq === 'twice-yearly' ? num(s.amount) * 2 / 12 : num(s.amount) / 12;
      lines.push([month, 'Sinking fund', '', s.name + ' (' + s.freq + ')', m.toFixed(2), '', '', '']);
    });
    lines.push([month, 'Summary', '', 'Total monthly income', t.income.toFixed(2), '', '', '']);
    lines.push([month, 'Summary', '', 'Total planned', t.plannedTotal.toFixed(2), '', '', '']);
    lines.push([month, 'Summary', '', 'Total actual', t.actualTotal.toFixed(2), '', '', '']);
    lines.push([month, 'Summary', '', 'Left to assign', t.leftToAssign.toFixed(2), '', '', '']);
    return lines.map(function (row) {
      return row.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
  }

  /* ---------------- Events ---------------- */

  function findRow(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  function bindEvents(container, state) {
    var preset = container.getAttribute('data-preset') || '';

    function save() { setPlan(state.month, state.plan); state.hasSaved = true; }

    container.addEventListener('change', function (ev) {
      var el = ev.target;
      var plan = state.plan;

      if (el.getAttribute('data-field') === 'month') {
        state.month = el.value || currentMonthStr();
        var saved = getPlan(state.month);
        state.plan = saved ? clone(saved) : (preset && PRESETS[preset] ? clone(PRESETS[preset].plan) : blankPlan());
        state.hasSaved = !!saved;
        if (saved) { /* keep saved plan */ } else if (preset && PRESETS[preset]) { save(); }
        renderPlanner(container, state);
        return;
      }
      if (el.getAttribute('data-field') === 'irregular-mode') {
        plan.irregular.mode = el.value;
        save(); renderPlanner(container, state); return;
      }
      if (el.getAttribute('data-field') === 'irregular-average') { plan.irregular.average = num(el.value); save(); renderPlanner(container, state); return; }
      if (el.getAttribute('data-field') === 'irregular-base') { plan.irregular.base = num(el.value); save(); renderPlanner(container, state); return; }
      if (el.getAttribute('data-field') === 'irregular-variable') { plan.irregular.variable = num(el.value); save(); renderPlanner(container, state); return; }
      if (el.getAttribute('data-field') === 'emergency') { plan.emergencySavings = num(el.value); save(); renderPlanner(container, state); return; }
      if (el.getAttribute('data-field') === 'guide') { plan.guide = el.value; save(); renderPlanner(container, state); return; }
      if (el.getAttribute('data-field') === 'custom-needs') { plan.customGuide.needs = num(el.value); save(); renderPlanner(container, state); return; }
      if (el.getAttribute('data-field') === 'custom-wants') { plan.customGuide.wants = num(el.value); save(); renderPlanner(container, state); return; }
      if (el.getAttribute('data-field') === 'custom-savings') { plan.customGuide.savings = num(el.value); save(); renderPlanner(container, state); return; }
      if (el.getAttribute('data-field') === 'restore-file') {
        var file = el.files && el.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(reader.result);
            if (!data || typeof data !== 'object' || !data.income || !data.expenses) throw new Error('bad file');
            if (window.confirm('Replace the plan for ' + state.month + ' with this backup file?')) {
              state.plan = data;
              save();
              renderPlanner(container, state);
            }
          } catch (e) {
            window.alert('That file does not look like a planner backup.');
          }
          el.value = '';
        };
        reader.readAsText(file);
        return;
      }

      var kind = el.getAttribute('data-income');
      if (kind) {
        var ir = findRow(plan.income, el.getAttribute('data-id'));
        if (ir) {
          if (kind === 'name') ir.name = el.value;
          if (kind === 'amount') ir.amount = num(el.value);
          if (kind === 'freq') ir.freq = el.value;
          save(); renderPlanner(container, state);
        }
        return;
      }
      var ek = el.getAttribute('data-exp');
      if (ek) {
        var cat = el.getAttribute('data-cat');
        var er = findRow(plan.expenses[cat] || [], el.getAttribute('data-id'));
        if (er) {
          if (ek === 'name') er.name = el.value;
          if (ek === 'planned') er.planned = num(el.value);
          if (ek === 'actual') er.actual = num(el.value);
          if (ek === 'due') er.due = el.value;
          if (ek === 'paid') er.paid = el.checked;
          save(); renderPlanner(container, state);
        }
        return;
      }
      var sk = el.getAttribute('data-sink');
      if (sk) {
        var sr = findRow(plan.sinking, el.getAttribute('data-id'));
        if (sr) {
          if (sk === 'name') sr.name = el.value;
          if (sk === 'amount') sr.amount = num(el.value);
          if (sk === 'freq') sr.freq = el.value;
          save(); renderPlanner(container, state);
        }
      }
    });

    container.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var plan = state.plan;

      if (action === 'add-income') {
        plan.income.push({ id: uid(), name: '', amount: 0, freq: 'monthly' });
        save(); renderPlanner(container, state);
      } else if (action === 'del-income') {
        plan.income = plan.income.filter(function (r) { return r.id !== btn.getAttribute('data-id'); });
        save(); renderPlanner(container, state);
      } else if (action === 'add-expense') {
        var cat = btn.getAttribute('data-cat');
        plan.expenses[cat].push(row('', 0, 0, '', false));
        save(); renderPlanner(container, state);
      } else if (action === 'del-expense') {
        var c2 = btn.getAttribute('data-cat');
        plan.expenses[c2] = plan.expenses[c2].filter(function (r) { return r.id !== btn.getAttribute('data-id'); });
        save(); renderPlanner(container, state);
      } else if (action === 'add-sinking') {
        plan.sinking.push({ id: uid(), name: '', amount: 0, freq: 'annual' });
        save(); renderPlanner(container, state);
      } else if (action === 'del-sinking') {
        plan.sinking = plan.sinking.filter(function (r) { return r.id !== btn.getAttribute('data-id'); });
        save(); renderPlanner(container, state);
      } else if (action === 'load-preset') {
        var key = btn.getAttribute('data-preset');
        if (!PRESETS[key]) return;
        if (getPlan(state.month) && !window.confirm('You already have a saved plan for ' + state.month + '. Replace it with the ' + PRESETS[key].label + ' example?')) return;
        state.plan = clone(PRESETS[key].plan);
        save(); renderPlanner(container, state);
      } else if (action === 'clear-plan') {
        if (!window.confirm('Clear this month\u2019s plan and start blank?')) return;
        state.plan = blankPlan();
        save(); renderPlanner(container, state);
      } else if (action === 'copy-next') {
        var next = nextMonthStr(state.month);
        if (getPlan(next) && !window.confirm('A plan already exists for ' + next + '. Overwrite it with this month\u2019s plan?')) return;
        setPlan(next, clone(state.plan));
        state.month = next;
        state.hasSaved = true;
        renderPlanner(container, state);
      } else if (action === 'download-json') {
        download('single-income-budget-backup-' + state.month + '.json', JSON.stringify(state.plan, null, 2), 'application/json');
      } else if (action === 'export-csv') {
        var t = computePlan(state.plan);
        download('single-income-budget-' + state.month + '.csv', toCSV(state.plan, t, state.month), 'text/csv');
      } else if (action === 'print') {
        window.print();
      }
    });
  }

  /* ---------------- Init ---------------- */

  function initPlanner(container) {
    var preset = container.getAttribute('data-preset') || '';
    var month = currentMonthStr();
    var saved = getPlan(month);
    var state = { month: month, hasSaved: !!saved, plan: null };
    if (saved) {
      state.plan = clone(saved);
    } else if (preset && PRESETS[preset]) {
      state.plan = clone(PRESETS[preset].plan);
      setPlan(month, state.plan);
      state.hasSaved = true;
    } else {
      state.plan = blankPlan();
    }
    renderPlanner(container, state);
    bindEvents(container, state);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.planner'), initPlanner);
      });
    } else {
      Array.prototype.forEach.call(document.querySelectorAll('.planner'), initPlanner);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      freqToMonthly: freqToMonthly, computePlan: computePlan, blankPlan: blankPlan,
      PRESETS: PRESETS, CATEGORIES: CATEGORIES, fmt: fmt
    };
  }
})();
