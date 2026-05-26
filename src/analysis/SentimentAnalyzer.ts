import axios from "axios";

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  sentiment: "bullish" | "bearish" | "neutral";
  impact: "high" | "medium" | "low";
  publishedAt: Date;
}

export interface NewsContext {
  symbol: string;
  recentArticles: NewsArticle[];
  sentimentScore: number; // -1 (bearish) to +1 (bullish)
  hasEarnings: boolean;
  hasFDAApproval: boolean;
  hasAnalystChange: boolean;
}

export class SentimentAnalyzer {
  private newsApiKey: string;
  private newsApiUrl = "https://newsapi.org/v2";

  constructor(newsApiKey?: string) {
    this.newsApiKey = newsApiKey || process.env.NEWS_API_KEY || "";
  }

  async analyzeNewsForSymbol(symbol: string): Promise<NewsContext> {
    const context: NewsContext = {
      symbol,
      recentArticles: [],
      sentimentScore: 0,
      hasEarnings: false,
      hasFDAApproval: false,
      hasAnalystChange: false,
    };

    if (!this.newsApiKey) {
      console.warn("No NEWS_API_KEY provided, using Claude knowledge only");
      return context;
    }

    try {
      const response = await axios.get(`${this.newsApiUrl}/everything`, {
        params: {
          q: symbol,
          sortBy: "publishedAt",
          pageSize: 10,
          apiKey: this.newsApiKey,
        },
      });

      const articles = response.data.articles || [];

      for (const article of articles) {
        const sentiment = this.classifySentiment(
          article.title + " " + article.description
        );
        const impact = this.assessImpact(article.title, symbol);

        // Detect special events
        if (
          article.title.toLowerCase().includes("earnings") ||
          article.title.toLowerCase().includes("q") + "[0-4]"
        ) {
          context.hasEarnings = true;
        }
        if (
          article.title.toLowerCase().includes("fda") ||
          article.title.toLowerCase().includes("approval")
        ) {
          context.hasFDAApproval = true;
        }
        if (
          article.title.toLowerCase().includes("analyst") ||
          article.title.toLowerCase().includes("upgrade") ||
          article.title.toLowerCase().includes("downgrade")
        ) {
          context.hasAnalystChange = true;
        }

        context.recentArticles.push({
          title: article.title,
          description: article.description,
          url: article.url,
          source: article.source.name,
          sentiment,
          impact,
          publishedAt: new Date(article.publishedAt),
        });

        // Update sentiment score
        const sentimentValue =
          sentiment === "bullish" ? 1 : sentiment === "bearish" ? -1 : 0;
        context.sentimentScore +=
          sentimentValue * (impact === "high" ? 0.5 : impact === "medium" ? 0.3 : 0.1);
      }

      // Normalize sentiment score to -1 to +1
      context.sentimentScore = Math.max(
        -1,
        Math.min(1, context.sentimentScore / 10)
      );
    } catch (error) {
      console.error(`Error fetching news for ${symbol}:`, error);
    }

    return context;
  }

  private classifySentiment(text: string): "bullish" | "bearish" | "neutral" {
    const bullishKeywords = [
      "surge",
      "rally",
      "spike",
      "soars",
      "beats",
      "upgrades",
      "gains",
      "strong",
      "bullish",
      "profit",
      "deal",
      "partnership",
    ];
    const bearishKeywords = [
      "plunge",
      "crash",
      "drops",
      "miss",
      "downgrades",
      "losses",
      "weak",
      "bearish",
      "bankruptcy",
      "recall",
      "decline",
    ];

    const lowerText = text.toLowerCase();
    let bullishCount = bullishKeywords.filter((k) =>
      lowerText.includes(k)
    ).length;
    let bearishCount = bearishKeywords.filter((k) =>
      lowerText.includes(k)
    ).length;

    if (bullishCount > bearishCount) return "bullish";
    if (bearishCount > bullishCount) return "bearish";
    return "neutral";
  }

  private assessImpact(title: string, symbol: string): "high" | "medium" | "low" {
    const lowerTitle = title.toLowerCase();
    const lowerSymbol = symbol.toLowerCase();

    // High impact events
    if (
      lowerTitle.includes("earnings") ||
      lowerTitle.includes("fda") ||
      lowerTitle.includes("bankrupt") ||
      lowerTitle.includes("scandal") ||
      lowerTitle.includes("acquisition")
    ) {
      return "high";
    }

    // Medium impact
    if (
      lowerTitle.includes("upgrade") ||
      lowerTitle.includes("downgrade") ||
      lowerTitle.includes("analyst") ||
      lowerTitle.includes("rally") ||
      lowerTitle.includes("crash")
    ) {
      return "medium";
    }

    return "low";
  }

  buildNewsPrompt(contexts: NewsContext[]): string {
    let prompt = "MARKET NEWS CONTEXT:\n\n";

    for (const context of contexts) {
      prompt += `${context.symbol}:\n`;
      prompt += `  Sentiment Score: ${context.sentimentScore.toFixed(2)} (-1=bearish, +1=bullish)\n`;

      if (context.hasEarnings) prompt += `  ⚠️ EARNINGS REPORT EXPECTED\n`;
      if (context.hasFDAApproval) prompt += `  📋 FDA APPROVAL STATUS\n`;
      if (context.hasAnalystChange)
        prompt += `  👥 ANALYST RECOMMENDATION CHANGE\n`;

      if (context.recentArticles.length > 0) {
        prompt += `  Recent Headlines:\n`;
        context.recentArticles.slice(0, 3).forEach((article) => {
          prompt += `    - [${article.sentiment.toUpperCase()}] ${article.title}\n`;
        });
      }

      prompt += "\n";
    }

    return prompt;
  }
}
