export interface Trade {
  id: string;
  url: string;
  date: string | null;
  day: string[];
  time: string;
  tookTrade: string[];
  indices: string[];
  longShort: string[];
  news: string[];
  reversalContinuation: string[];
  drawInLiquidity: string[];
  poi: string[];
  lowerTimeEntry: string[];
  rulesFeelings: string[];
  trend: string[];
  biasForTheDay: string[];
  rateTrade: string[];
  winLose: string[];
  pnl: number | null;
  notes: string;
  tradeIdeaLink: string | null;
  oneMTradeLink: string | null;
  images: { url: string; label: string }[];
}

export interface GroupStat {
  label: string;
  wins: number;
  losses: number;
  breakevens: number;
  total: number;
  winRate: number;
  totalPnl: number;
}

export interface PnlPoint {
  date: string;
  pnl: number;
  cumulative: number;
}

export interface DashboardStats {
  totalDays: number;
  tradedDays: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
}
