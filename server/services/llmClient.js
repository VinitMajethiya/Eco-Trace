const { SYSTEM_PROMPT } = require('../engine/prompts');
const { generateFallbackRecommendation } = require('../engine/recommend');

// Banned words list to filter out shaming/guilt-based language
const BANNED_WORDS = ['guilty', 'shame', 'bad', 'terrible', 'destroying', 'ruining', 'crisis', 'disaster', 'catastrophe', 'alarm', 'fail'];

/**
 * Clean LLM JSON response to handle potential markdown formatting wrappers
 */
function cleanJSONString(str) {
  let cleaned = str.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/```$/, '');
  }
  return cleaned.trim();
}

/**
 * Generate a personalized carbon reduction recommendation using LLM with deterministic fallbacks.
 * 
 * @param {string} userFirstName 
 * @param {object} statsContext 
 * @returns {Promise<object>}
 */
async function generateRecommendation(userFirstName, statsContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  const isKeyConfigured = apiKey && apiKey !== 'your-gemini-api-key-here';
  
  if (!isKeyConfigured) {
    console.log('No GEMINI_API_KEY found. Using rule-based fallback recommendation.');
    return generateFallbackRecommendation(statsContext);
  }

  const payload = {
    userFirstName,
    topCategory: statsContext.topCategory,
    topCategorySharePct: statsContext.topCategorySharePct,
    topSubType: statsContext.topSubType,
    whatIfOptions: statsContext.whatIfOptions
  };

  const prompt = `${SYSTEM_PROMPT}\n\nInput Context:\n${JSON.stringify(payload, null, 2)}`;

  try {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('LLM Request Timeout')), 8000);
    });

    const response = await Promise.race([
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }),
      timeoutPromise
    ]).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API returned status ${response.status} - Details: ${errText}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) {
      throw new Error('LLM returned an empty response');
    }

    const cleanedText = cleanJSONString(rawText);
    const parsed = JSON.parse(cleanedText);

    // Validate and enforce safety constraints
    // L1: Validate structure
    if (!parsed.summary || !Array.isArray(parsed.actions)) {
      throw new Error('LLM response structure is invalid');
    }

    // L4: Summary text length cap & shaming filter
    if (parsed.summary.length > 500) {
      parsed.summary = parsed.summary.substring(0, 497) + '...';
    }
    
    const containsBannedWord = BANNED_WORDS.some(word => 
      parsed.summary.toLowerCase().includes(word)
    );
    if (containsBannedWord) {
      console.warn('Safety Filter Triggered: LLM summary contained shaming language. Replacing with fallback summary.');
      const fallback = generateFallbackRecommendation(statsContext);
      parsed.summary = fallback.summary;
    }

    // L2 & L3: Re-verify savings against pre-calculated numbers using optionId, and cap to 3 items
    const verifiedActions = [];
    const usedOptionIds = new Set();

    if (Array.isArray(parsed.actions)) {
      parsed.actions.forEach((action) => {
        const optionId = action.optionId;
        if (usedOptionIds.has(optionId)) {
          console.warn(`Safety/Validation Warning: LLM returned duplicate optionId '${optionId}'`);
          return;
        }
        const matchedOpt = statsContext.whatIfOptions.find(opt => opt.id === optionId);
        if (matchedOpt) {
          verifiedActions.push({
            action_text: action.text || `Try: ${matchedOpt.description}`,
            estimated_saving_kg: matchedOpt.estimatedSavingKgPerMonth,
            target_category: matchedOpt.targetCategory || statsContext.topCategory,
            optionId: optionId
          });
          usedOptionIds.add(optionId);
        } else {
          console.warn(`Safety/Validation Warning: LLM returned unrecognized optionId '${optionId}'`);
        }
      });
    }


    // Backfill if we have fewer actions than options
    statsContext.whatIfOptions.forEach((opt) => {
      if (verifiedActions.length < 3 && !usedOptionIds.has(opt.id)) {
        verifiedActions.push({
          action_text: `Try: ${opt.description}`,
          estimated_saving_kg: opt.estimatedSavingKgPerMonth,
          target_category: opt.targetCategory || statsContext.topCategory,
          optionId: opt.id
        });
        usedOptionIds.add(opt.id);
      }
    });

    const finalActions = verifiedActions.slice(0, 3).map((act, index) => ({
      rank: index + 1,
      action_text: act.action_text,
      estimated_saving_kg: act.estimated_saving_kg,
      target_category: act.target_category
    }));

    return {
      summary: parsed.summary,
      actions: finalActions,
      source: 'llm'
    };

  } catch (error) {
    console.error('LLM API error:', error.message, '- falling back to deterministic template.');
    return generateFallbackRecommendation(statsContext);
  }
}

module.exports = {
  generateRecommendation
};
