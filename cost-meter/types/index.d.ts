export type CostMeterTotals = {
  session: number | null;
  total: number;
  turnBase: number;
  last: number | null;
  turns: number;
  priciest: number;
  warned: boolean;
};

declare module "claude-code" {
  interface PluginState {
    "cost-meter": { meter: CostMeterTotals };
  }
}
