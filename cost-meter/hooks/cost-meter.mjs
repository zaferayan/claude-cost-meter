// Cost Meter: what this session has cost so far, drawn above the prompt.
//
// The figure is the one /cost shows ($.session.usage().cost.usd): every priced
// API response this session, subagents included. On a Pro or Max plan it is
// what the same usage would have cost on the API.

// Held by the host, so the totals survive a hot reload of this file.
const meter = { plugin: "cost-meter", key: "meter" };
// VS Code draws no band above the prompt, so there the meter lives in this pane.
const PANE = "cost-meter";
const EMPTY = { session: null, total: 0, turnBase: 0, last: null, turns: 0, priciest: 0, warned: false };

export function register(on, options) {
  const budget = options.budget ?? 0;

  // Fires whenever the status line's figures move, mid-turn too, so the band keeps up live.
  on("session.measure", async ($, e, next) => {
    const result = await next(e);
    if (e.changed.includes("cost") && e.cost) {
      await $.state.set(meter, await spend($, await load($, e.startedAt), e.cost.usd, budget));
    }
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    const { startedAt, cost } = await $.session.usage();
    if (!e.agentId && cost) {
      const m = await spend($, await load($, startedAt), cost.usd, budget);
      const last = m.total - m.turnBase;
      await $.state.set(meter, { ...m, turnBase: m.total, last, turns: m.turns + 1, priciest: Math.max(m.priciest, last) });
    }
    return result;
  });

  on("session.start", async ($, e, next) => {
    const result = await next(e);
    await $.state.set(meter, await load($, (await $.session.usage()).startedAt)); // a new session starts from zero
    await $.command.register({ name: "spend", description: "Show what this session has cost, turn by turn" });
    return result;
  });

  on("session.attach", { surface: "vscode" }, async ($, e, next) => {
    const result = await next(e);
    void $.ui.open({ id: PANE, title: "Cost" });
    return result;
  });

  on("command.run", { command: "spend" }, async ($) => {
    const { value = EMPTY } = await $.state.get(meter);
    if ((await $.session.surfaces()).includes("vscode")) {
      await $.ui.open({ id: PANE, title: "Cost" }); // asked for, so it is placed at any width
    }
    return { text: report(value, budget) };
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const { value: m = EMPTY } = await $.state.get(meter);
    if (e.props.hasSurvey || m.total === 0) {
      return next(e);
    }
    const { Box, Text } = $.ui.resolve(e);
    return band(Box, Text, m, budget, e.props.bodyColumns);
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { value: m = EMPTY } = await $.state.get(meter);
    const { Box, Text } = $.ui.resolve(e);
    if (m.total === 0) {
      return Text({ dimColor: true, children: "Nothing spent yet this session." });
    }
    return band(Box, Text, m, budget, e.props.bodyColumns);
  });
}

// The stored totals, or empty ones if they belong to an earlier session.
async function load($, startedAt) {
  const { value = EMPTY } = await $.state.get(meter);
  return value.session === startedAt ? value : { ...EMPTY, session: startedAt };
}

// The totals with the session's cost now at `usd`, warning once when it passes the budget.
async function spend($, m, usd, budget) {
  const next = { ...m, total: usd, turnBase: Math.min(m.turnBase, usd) };
  if (budget > 0 && usd >= budget && !m.warned) {
    next.warned = true;
    await $.ui.toast(`Cost Meter: this session passed your ${money(budget)} budget`);
  }
  return next;
}

function band(Box, Text, m, budget, columns) {
  const used = budget > 0 ? m.total / budget : 0;
  const color = budget === 0 ? undefined : used < 0.5 ? "green" : used < 1 ? "yellow" : "red";
  const parts = [Text({ color, bold: true, children: money(m.total) })];
  if (budget > 0) {
    parts.push(Text({ dimColor: true, children: ` / ${money(budget)} budget` }));
  }
  if (columns >= 60 && m.last !== null) {
    parts.push(Text({ dimColor: true, children: `   last turn ${money(m.last)} · ${m.turns} ${m.turns === 1 ? "turn" : "turns"}` }));
  }
  return Box({ flexDirection: "row", paddingX: 1, children: parts });
}

function report(m, budget) {
  if (m.total === 0) return "Nothing spent yet this session.";
  const lines = [`This session: ${money(m.total)}`];
  if (m.turns > 0) {
    lines.push(`  Turns         ${m.turns}`);
    lines.push(`  Per turn      ${money(m.total / m.turns)} on average`);
    lines.push(`  Priciest turn ${money(m.priciest)}`);
  }
  if (budget > 0) {
    lines.push(`  Budget        ${money(budget)} (${Math.round((m.total / budget) * 100)}% used)`);
  }
  return lines.join("\n");
}

function money(usd) {
  return `$${usd.toFixed(2)}`;
}
