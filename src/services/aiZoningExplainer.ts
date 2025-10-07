import { RegridZoningData } from '../types/zoning';

interface ZoningExplanation {
  summary: string;
  keyPoints: string[];
  restrictions: string[];
  opportunities: string[];
  recommendations: string[];
  plainLanguage: string;
  confidence: number;
}

interface ZoningViolation {
  type: 'setback' | 'coverage' | 'density' | 'height' | 'parking' | 'use';
  severity: 'critical' | 'major' | 'minor' | 'warning';
  description: string;
  currentValue: number;
  allowedValue: number;
  fix: string;
  impact: string;
}

export class AIZoningExplainer {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.VITE_OPENAI_API_KEY || '';
  }

  /**
   * Generate plain-language zoning explanation
   */
  async explainZoning(zoningData: RegridZoningData): Promise<ZoningExplanation> {
    if (!this.apiKey) {
      return this.generateFallbackExplanation(zoningData);
    }

    try {
      const prompt = this.buildZoningPrompt(zoningData);
      const response = await this.callOpenAI(prompt);
      return this.parseAIResponse(response);
    } catch (error) {
      console.warn('AI explanation failed, using fallback:', error);
      return this.generateFallbackExplanation(zoningData);
    }
  }

  /**
   * Analyze zoning violations and provide fixes
   */
  analyzeViolations(
    zoningData: RegridZoningData, 
    currentPlan: any
  ): ZoningViolation[] {
    const violations: ZoningViolation[] = [];

    // Check setbacks
    if (currentPlan.frontSetback && zoningData.min_front_setback_ft) {
      if (currentPlan.frontSetback < zoningData.min_front_setback_ft) {
        violations.push({
          type: 'setback',
          severity: 'critical',
          description: 'Front setback violation',
          currentValue: currentPlan.frontSetback,
          allowedValue: zoningData.min_front_setback_ft,
          fix: `Move building back ${zoningData.min_front_setback_ft - currentPlan.frontSetback} feet from front property line`,
          impact: 'Required for permit approval'
        });
      }
    }

    // Check coverage
    if (currentPlan.coverage && zoningData.max_impervious_coverage_pct) {
      const coveragePercent = (currentPlan.coverage / currentPlan.lotSize) * 100;
      if (coveragePercent > zoningData.max_impervious_coverage_pct) {
        violations.push({
          type: 'coverage',
          severity: 'major',
          description: 'Impervious coverage exceeded',
          currentValue: coveragePercent,
          allowedValue: zoningData.max_impervious_coverage_pct,
          fix: `Reduce impervious surfaces by ${coveragePercent - zoningData.max_impervious_coverage_pct}%`,
          impact: 'May require stormwater management'
        });
      }
    }

    // Check density
    if (currentPlan.units && zoningData.max_density_du_per_acre) {
      const density = currentPlan.units / (currentPlan.lotSize / 43560); // Convert to acres
      if (density > zoningData.max_density_du_per_acre) {
        violations.push({
          type: 'density',
          severity: 'critical',
          description: 'Density limit exceeded',
          currentValue: density,
          allowedValue: zoningData.max_density_du_per_acre,
          fix: `Reduce units to ${Math.floor(zoningData.max_density_du_per_acre * (currentPlan.lotSize / 43560))} or less`,
          impact: 'Required for zoning compliance'
        });
      }
    }

    return violations;
  }

  /**
   * Generate optimization suggestions
   */
  generateOptimizationSuggestions(
    zoningData: RegridZoningData,
    currentPlan: any
  ): string[] {
    const suggestions: string[] = [];

    // FAR optimization
    if (zoningData.max_far && currentPlan.far) {
      const utilization = (currentPlan.far / zoningData.max_far) * 100;
      if (utilization < 80) {
        suggestions.push(`Consider increasing building size - currently using only ${utilization.toFixed(1)}% of allowed FAR`);
      }
    }

    // Density optimization
    if (zoningData.max_density_du_per_acre && currentPlan.units) {
      const density = currentPlan.units / (currentPlan.lotSize / 43560);
      const utilization = (density / zoningData.max_density_du_per_acre) * 100;
      if (utilization < 70) {
        suggestions.push(`Consider adding more units - currently using only ${utilization.toFixed(1)}% of allowed density`);
      }
    }

    // Coverage optimization
    if (zoningData.max_impervious_coverage_pct && currentPlan.coverage) {
      const coveragePercent = (currentPlan.coverage / currentPlan.lotSize) * 100;
      const utilization = (coveragePercent / zoningData.max_impervious_coverage_pct) * 100;
      if (utilization < 60) {
        suggestions.push(`Consider expanding building footprint - currently using only ${utilization.toFixed(1)}% of allowed coverage`);
      }
    }

    return suggestions;
  }

  private buildZoningPrompt(zoningData: RegridZoningData): string {
    return `
Explain this zoning regulation in plain language for a real estate developer:

Zoning: ${zoningData.zoning || 'Unknown'}
Max FAR: ${zoningData.max_far || 'Not specified'}
Max Density: ${zoningData.max_density_du_per_acre || 'Not specified'} units per acre
Max Coverage: ${zoningData.max_impervious_coverage_pct || 'Not specified'}%
Front Setback: ${zoningData.min_front_setback_ft || 'Not specified'} feet
Side Setback: ${zoningData.min_side_setback_ft || 'Not specified'} feet
Rear Setback: ${zoningData.min_rear_setback_ft || 'Not specified'} feet

Provide:
1. A simple summary of what this zoning allows
2. Key development opportunities
3. Main restrictions to be aware of
4. Practical recommendations for developers
5. Plain language explanation that a non-technical person can understand

Format as JSON with fields: summary, keyPoints, restrictions, opportunities, recommendations, plainLanguage, confidence
    `.trim();
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a real estate zoning expert. Explain zoning regulations in clear, practical language for developers.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private parseAIResponse(response: string): ZoningExplanation {
    try {
      const parsed = JSON.parse(response);
      return {
        summary: parsed.summary || 'Zoning analysis complete',
        keyPoints: parsed.keyPoints || [],
        restrictions: parsed.restrictions || [],
        opportunities: parsed.opportunities || [],
        recommendations: parsed.recommendations || [],
        plainLanguage: parsed.plainLanguage || 'Zoning allows various development options',
        confidence: parsed.confidence || 0.8
      };
    } catch (error) {
      console.warn('Failed to parse AI response:', error);
      return this.generateFallbackExplanation({} as RegridZoningData);
    }
  }

  private generateFallbackExplanation(zoningData: RegridZoningData): ZoningExplanation {
    return {
      summary: `This ${zoningData.zoning || 'zoning district'} allows various development options with specific requirements.`,
      keyPoints: [
        `Maximum density: ${zoningData.max_density_du_per_acre || 'Not specified'} units per acre`,
        `Maximum coverage: ${zoningData.max_impervious_coverage_pct || 'Not specified'}% of lot`,
        `Required setbacks: Front ${zoningData.min_front_setback_ft || 'Not specified'}ft, Side ${zoningData.min_side_setback_ft || 'Not specified'}ft`
      ],
      restrictions: [
        'Must comply with setback requirements',
        'Cannot exceed maximum coverage',
        'Density limits must be respected'
      ],
      opportunities: [
        'Optimize building placement for maximum FAR',
        'Consider mixed-use development if allowed',
        'Explore density bonuses for affordable housing'
      ],
      recommendations: [
        'Consult with local planning department',
        'Consider pre-application meeting',
        'Review recent approvals in the area'
      ],
      plainLanguage: 'This zoning allows development with specific rules about building size, placement, and density. Follow the setback requirements and don\'t exceed the maximum coverage or density limits.',
      confidence: 0.6
    };
  }
}
