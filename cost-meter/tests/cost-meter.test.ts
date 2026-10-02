import { describe, expect, test } from "claude-code/testing";

describe("cost-meter", () => {
  test("the band shows the session's cost and the last turn's share", async ($, on) => {
    // Hooks registered here run after the mod and stub what Claude Code would answer.
    let usd = 0.12;
    on("session.start", ($, e) => ({ cwd: e.cwd }));
    on("session.usage", () => ({
      value: { startedAt: 0, rateLimits: [], context: { tokens: 1, window: 1_000_000, percent: 0 }, cost: { usd } },
    }));
    on("turn.complete", () => ({ text: "" }));
    on("command.register", () => ({ value: undefined }));
    on("ui.render", ($, e) => $.ui.resolve(e).Box({ children: [] }));

    await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" } as any);
    const ui = await $.ui.mount({
      plugin: "cost-meter",
      surface: "terminal",
      component: "AbovePrompt",
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
    } as any);

    await $.turn.complete({ reason: "answer", answer: "ok", durationMs: 1 } as any);
    expect(await ui.find({ type: "Text", text: /\$0\.12/ })).toBeDefined();

    usd = 0.42;
    await $.turn.complete({ reason: "answer", answer: "ok", durationMs: 1 } as any);
    expect(await ui.find({ type: "Text", text: /\$0\.42/ })).toBeDefined();
    expect(await ui.find({ type: "Text", text: /last turn \$0\.30 · 2 turns/ })).toBeDefined();
    await ui.unmount();
  });

  test("on VS Code, which has no band, the meter opens in a pane", async ($, on) => {
    const opened: string[] = [];
    on("session.start", ($, e) => ({ cwd: e.cwd }));
    on("session.usage", () => ({
      value: { startedAt: 0, rateLimits: [], context: { tokens: 1, window: 1_000_000, percent: 0 }, cost: { usd: 0.42 } },
    }));
    on("session.attach", ($, e) => ({ clientId: e.clientId }));
    on("session.surfaces", () => ({ value: ["vscode"] }));
    on("turn.complete", () => ({ text: "" }));
    on("command.register", () => ({ value: undefined }));
    on("ui.open", ($, e) => {
      opened.push(e.id);
      return { value: { isPlaced: true } };
    });
    on("ui.render", ($, e) => $.ui.resolve(e).Box({ children: [] }));

    await $.session.start({ surface: null, isInteractive: true, cwd: "/work" } as any);
    await $.session.attach({ surface: "vscode", clientId: "vscode:default" });
    expect(opened).toEqual(["cost-meter"]);

    const pane = await $.ui.mount({
      plugin: "cost-meter",
      surface: "vscode",
      component: "Pane",
      requestId: "cost-meter",
      props: { title: "Cost", isFocused: false, bodyColumns: 80, placement: "dock" },
    } as any);
    expect(await pane.find({ type: "Text", text: /Nothing spent yet/ })).toBeDefined();

    await $.turn.complete({ reason: "answer", answer: "ok", durationMs: 1 } as any);
    expect(await pane.find({ type: "Text", text: /\$0\.42/ })).toBeDefined();

    const run = await $.command.run({ command: "spend" });
    expect(run.text).toContain("This session: $0.42");
    expect(opened).toEqual(["cost-meter", "cost-meter"]);
    await pane.unmount();
  });
});
