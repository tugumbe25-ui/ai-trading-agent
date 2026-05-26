import Anthropic from "@anthropic-ai/sdk";

interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: Date;
  exitTime?: Date;
  pnl?: number;
  pnlPercent?: number;
  reasoning: string;
  confidence: number;
  setup: string;
  timeframe: string;
  status: "open" | "closed";
}

interface MarketData {
  symbol: string;
  currentPrice: number;
  dailyChange: number;
  dailyChangePercent: number;
  volume: number;
  high: number;
  low: number;
  rsi: number;
  macd: number;
  vwap: number;
  ma20: number;
  ma50: number;
  ma200: number;
  trend: "up" | "down" | "sideways";
  volatility: "low" | "medium" | "high";
}

interface AgentState {
  portfolio: {
    cash: number;
    equity: number;
    totalValue: number;
    dayPnl: number;
    dayPnlPercent: number;
  };
  positions: Map<string, { quantity: number; avgPrice: number }>;
  trades: Trade[];
  conversationHistory: Anthropic.MessageParam[];
}

export class AdvancedTradingAgent {
  private client: Anthropic;
  private state: AgentState;
  private systemPrompt: string;

  constructor(initialCapital: number = 10000) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.state = {
      portfolio: {
        cash: initialCapital,
        equity: initialCapital,
        totalValue: initialCapital,
        dayPnl: 0,
        dayPnlPercent: 0,
      },
      positions: new Map(),
      trades: [],
      conversationHistory: [],
    };

    this.systemPrompt = `You are an elite algorithmic trading agent optimized for consistent daily income. Your goals:
1. Target 0.5-1.5% daily returns ($50-150 on $10k)
2. Preserve capital above all else
3. Use multi-timeframe confluence for high-probability entries
4. Scale in/out of positions to smooth P&L
5. Avoid low-probability trades

Key rules:
- Maximum position size: 5% of portfolio per trade
- Risk-reward minimum: 2:1
- Never average down on losing positions
- Use trailing stops at 1.5% below entry
- Avoid trading 30min before market close
- Scale in 1/3 size on first signal, add on confirmation
- Close 50% on first target, trail stops on remainder

Current portfolio status will be provided before each decision.
Respond with structured JSON containing: decision (BUY/SELL/HOLD), symbol, quantity, confidence (0-1), reasoning, setup_type, risk_reward_ratio`;
  }

  async analyzeMarket(
    symbols: string[],
    marketData: Map<string, MarketData>
  ): Promise<void> {
    for (const symbol of symbols) {
      const data = marketData.get(symbol);
      if (!data) continue;

      const analysis = this.prepareMarketAnalysis(symbol, data);

      // Build multi-turn conversation
      this.state.conversationHistory.push({
        role: "user",
        content: analysis,
      });

      try {
        const response = await this.client.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          system: this.systemPrompt,
          messages: this.state.conversationHistory,
        });

        const assistantMessage = response.content[0];
        if (assistantMessage.type === "text") {
          this.state.conversationHistory.push({
            role: "assistant",
            content: assistantMessage.text,
          });

          const decision = this.parseDecision(assistantMessage.text);
          if (decision) {
            await this.executeTrade(decision);
          }
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }
    }
  }

  private prepareMarketAnalysis(symbol: string, data: MarketData): string {
    const position = this.state.positions.get(symbol);
    const unrealizedPnl = position
      ? (data.currentPrice - (position.avgPrice || 0)) * position.quantity
      : 0;

    return `MARKET ANALYSIS FOR ${symbol}:

Current Price: $${data.currentPrice}
Daily Change: ${data.dailyChangePercent.toFixed(2)}%
Volume: ${(data.volume / 1000000).toFixed(1)}M

Technical Indicators:
- RSI(14): ${data.rsi.toFixed(1)}
- MACD: ${data.macd.toFixed(3)}
- VWAP: $${data.vwap.toFixed(2)}
- MA20: $${data.ma20.toFixed(2)}
- MA50: $${data.ma50.toFixed(2)}
- MA200: $${data.ma200.toFixed(2)}
- Trend: ${data.trend}
- Volatility: ${data.volatility}

Portfolio Status:
- Cash: $${this.state.portfolio.cash.toFixed(2)}
- Total Value: $${this.state.portfolio.totalValue.toFixed(2)}
- Today's P&L: $${this.state.portfolio.dayPnl.toFixed(2)} (${this.state.portfolio.dayPnlPercent.toFixed(2)}%)
- Current Position: ${position ? `${position.quantity} shares @ $${position.avgPrice.toFixed(2)}` : "None"}
- Unrealized P&L: $${unrealizedPnl.toFixed(2)}

Session Time: ${this.getSessionTime()}

Make a decision: BUY (initiate or scale in), SELL (take profit or cut loss), or HOLD.
Explain your setup type and confidence level.`;
  }

  private parseDecision(responseText: string): any {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error("Error parsing decision:", error);
    }
    return null;
  }

  private async executeTrade(decision: any): Promise<void> {
    if (decision.decision === "HOLD") {
      return;
    }

    const symbol = decision.symbol || decision.ticker;
    const quantity = Math.floor(decision.quantity || 1);
    const confidence = decision.confidence || 0.5;

    if (quantity <= 0) {
      return;
    }

    const trade: Trade = {
      id: `${Date.now()}-${symbol}`,
      symbol,
      side: decision.decision === "BUY" ? "BUY" : "SELL",
      quantity,
      entryPrice: decision.price || 0,
      entryTime: new Date(),
      reasoning: decision.reasoning || "",
      confidence,
      setup: decision.setup_type || "unknown",
      timeframe: decision.timeframe || "multi-frame",
      status: "open",
    };

    this.state.trades.push(trade);

    // Update position
    if (trade.side === "BUY") {
      const existing = this.state.positions.get(symbol) || {
        quantity: 0,
        avgPrice: 0,
      };
      existing.quantity += quantity;
      existing.avgPrice =
        (existing.avgPrice * (existing.quantity - quantity) +
          trade.entryPrice * quantity) /
        existing.quantity;
      this.state.positions.set(symbol, existing);
      this.state.portfolio.cash -= trade.entryPrice * quantity;
    } else {
      const position = this.state.positions.get(symbol);
      if (position) {
        const pnl = (trade.entryPrice - position.avgPrice) * quantity;
        trade.pnl = pnl;
        trade.pnlPercent = (pnl / (position.avgPrice * quantity)) * 100;

        position.quantity -= quantity;
        if (position.quantity <= 0) {
          this.state.positions.delete(symbol);
        }
        this.state.portfolio.cash += trade.entryPrice * quantity;
        this.state.portfolio.dayPnl += pnl;
      }
    }

    this.updatePortfolioValue();
  }

  private updatePortfolioValue(): void {
    let positionsValue = 0;
    // In real scenario, recalculate based on current prices
    this.state.portfolio.equity = this.state.portfolio.cash + positionsValue;
    this.state.portfolio.totalValue = this.state.portfolio.equity;
    this.state.portfolio.dayPnlPercent =
      (this.state.portfolio.dayPnl / 10000) * 100; // Assuming $10k starting capital
  }

  private getSessionTime(): string {
    const hour = new Date().getHours();
    if (hour < 9.5) return "Pre-market";
    if (hour < 10.5) return "Market Open";
    if (hour < 15.5) return "Mid-day";
    if (hour < 16) return "Power Hour";
    return "After Hours";
  }

  getState(): AgentState {
    return this.state;
  }

  getPerformanceMetrics() {
    const closedTrades = this.state.trades.filter((t) => t.status === "closed");
    const wins = closedTrades.filter((t) => (t.pnl || 0) > 0);
    const losses = closedTrades.filter((t) => (t.pnl || 0) <= 0);

    return {
      totalTrades: closedTrades.length,
      winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
      totalPnl: closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0),
      avgWin: wins.length > 0 ? wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? losses.reduce((sum, t) => sum + (t.pnl || 0), 0) / losses.length : 0,
      profitFactor: losses.length > 0
        ? Math.abs(wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / losses.reduce((sum, t) => sum + (t.pnl || 0), 0))
        : 0,
    };
  }
}
