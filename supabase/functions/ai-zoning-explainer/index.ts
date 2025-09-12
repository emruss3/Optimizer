const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ZoningExplanation {
  summary: string;
  allowedUses: string[];
  restrictions: string[];
  recommendations: string[];
  violationFixes: string[];
  plainLanguage: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { zoning, violations = [], context = 'Nashville, TN' } = await req.json()
    
    if (!zoning) {
      throw new Error('Zoning code is required')
    }

    // For demo purposes, we'll return structured explanations
    // In production, this would call OpenAI API
    const explanation = generateZoningExplanation(zoning, violations, context);

    return new Response(
      JSON.stringify({ 
        success: true, 
        explanation,
        zoning,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('AI explanation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

function generateZoningExplanation(zoning: string, violations: any[], context: string): ZoningExplanation {
  // Nashville-specific zoning explanations
  const zoningData: Record<string, any> = {
    'RM15': {
      summary: 'Residential Mixed-Use allowing up to 15 units per acre',
      allowedUses: [
        'Multi-family residential buildings',
        'Townhomes and condominiums', 
        'Small-scale retail on ground floor',
        'Community facilities',
        'Parks and open space'
      ],
      restrictions: [
        'Maximum 4.0 FAR (Floor Area Ratio)',
        'Maximum 90 feet building height',
        'Minimum 10 foot front setback',
        'Minimum 15 foot rear setback',
        'Minimum 5 foot side setbacks',
        'Maximum 70% site coverage'
      ],
      recommendations: [
        'Consider mixed-use development with retail on ground floor',
        'Maximize FAR while maintaining required open space',
        'Use structured parking to increase density',
        'Include amenity spaces for residents',
        'Design for pedestrian connectivity'
      ],
      plainLanguage: 'This zoning allows for medium-density residential development with some mixed-use potential. You can build up to 15 homes per acre, with buildings up to 90 feet tall. Ground floor retail is encouraged to create walkable neighborhoods.'
    },
    'R6': {
      summary: 'Multi-family residential allowing up to 6 units per acre',
      allowedUses: [
        'Apartments and condominiums',
        'Townhomes',
        'Single-family homes',
        'Duplexes and triplexes',
        'Community gardens'
      ],
      restrictions: [
        'Maximum 1.5 FAR',
        'Maximum 45 feet building height', 
        'Minimum 25 foot front setback',
        'Minimum 20 foot rear setback',
        'Minimum 10 foot side setbacks',
        'Maximum 40% site coverage'
      ],
      recommendations: [
        'Focus on 3-4 story buildings for optimal density',
        'Include adequate parking (1.5 spaces per unit)',
        'Design compatible with neighborhood character',
        'Provide private outdoor space for units',
        'Consider sustainable design features'
      ],
      plainLanguage: 'This is a moderate-density residential zone perfect for apartments or townhomes. You can fit about 6 homes per acre with buildings up to 45 feet tall. Great for creating affordable housing options while maintaining neighborhood character.'
    },
    'CS': {
      summary: 'Commercial Services district for neighborhood-scale retail',
      allowedUses: [
        'Retail stores and shops',
        'Restaurants and cafes',
        'Professional offices',
        'Personal services',
        'Mixed-use with residential above'
      ],
      restrictions: [
        'Maximum 3.0 FAR',
        'Maximum 75 feet building height',
        'Minimum 10 foot front setback',
        'Minimum 10 foot rear setback', 
        'Minimum 5 foot side setbacks',
        'Maximum 75% site coverage'
      ],
      recommendations: [
        'Design for pedestrian-friendly streetscape',
        'Include mixed-use with residential upper floors',
        'Provide adequate customer parking',
        'Consider drive-through restrictions',
        'Design for flexible tenant spaces'
      ],
      plainLanguage: 'This commercial zone is designed for neighborhood shopping and services. You can build retail, restaurants, and offices up to 75 feet tall, with residential units above. Perfect for creating walkable, mixed-use developments.'
    }
  };

  const data = zoningData[zoning] || {
    summary: `${zoning} zoning district`,
    allowedUses: ['Contact planning department for specific uses'],
    restrictions: ['Review zoning ordinance for specific requirements'],
    recommendations: ['Consult with planning staff for development guidance'],
    plainLanguage: `${zoning} is a specialized zoning district. Contact the planning department for detailed requirements and development guidelines.`
  };

  // Generate violation-specific fixes
  const violationFixes: string[] = [];
  violations.forEach(violation => {
    switch (violation.category) {
      case 'height':
        violationFixes.push(`Reduce building height to ${violation.requiredValue}ft or less by removing ${Math.ceil((violation.currentValue - violation.requiredValue) / 12)} floor(s)`);
        break;
      case 'coverage':
        violationFixes.push(`Reduce building footprint by ${Math.ceil(violation.currentValue - violation.requiredValue)}% to meet ${violation.requiredValue}% coverage limit`);
        break;
      case 'far':
        violationFixes.push(`Reduce total building area to achieve ${violation.requiredValue} FAR or less`);
        break;
      case 'setback':
        violationFixes.push(`Increase ${violation.ruleName.toLowerCase()} to ${violation.requiredValue}ft minimum`);
        break;
      case 'parking':
        violationFixes.push(`Add ${Math.ceil(violation.requiredValue - violation.currentValue)} additional parking spaces`);
        break;
    }
  });

  return {
    ...data,
    violationFixes
  };
}