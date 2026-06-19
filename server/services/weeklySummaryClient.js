const BANNED_WORDS = ['guilty', 'shame', 'bad', 'terrible', 'destroying', 'ruining', 'crisis', 'disaster', 'catastrophe', 'alarm', 'fail'];

async function generateWeeklySummary(userName, currentEmissions, prevEmissions, categoryBreakdown, deltaPercentage) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  // Deterministic local template fallback helper
  const getFallbackText = () => {
    const isSaved = deltaPercentage < 0;
    const diff = Math.abs(deltaPercentage);
    if (isSaved) {
      return `Great job, ${userName}! You reduced your emissions by ${diff.toFixed(1)}% compared to last week. Keep up the amazing work!`;
    } else if (deltaPercentage > 0) {
      return `Welcome back, ${userName}. Your emissions increased by ${diff.toFixed(1)}% this week. Consider trying a new commute swap or food option next week to stay on track.`;
    } else {
      return `Welcome back, ${userName}! Your weekly emissions remained steady. Try setting a new carbon challenge next week to start lowering your footprint.`;
    }
  };

  if (!apiKey) {
    console.log('No GEMINI_API_KEY found. Using rule-based fallback weekly summary.');
    return getFallbackText();
  }

  const systemPrompt = "You are EcoTrace, a supportive carbon reduction coach. Write a brief, encouraging, and friendly summary of the user's weekly carbon footprint performance in 2-3 sentences. Focus on positive reinforcement. If they saved emissions (negative delta), praise them. If they increased emissions or had no change, give a gentle nudge to try a challenge next week. Avoid invoking shaming words or guilt. Use the stats directly. Do not return markdown, list, or JSON; return ONLY a raw text paragraph.";

  const payload = {
    userName,
    currentEmissions,
    prevEmissions,
    deltaPercentage,
    categoryBreakdown
  };

  const prompt = `${systemPrompt}\n\nInput Context:\n${JSON.stringify(payload, null, 2)}`;

  try {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Weekly Summary Request Timeout')), 8000);
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
          }]
        })
      }),
      timeoutPromise
    ]).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) {
      throw new Error('Weekly summary empty response');
    }

    rawText = rawText.trim();

    // Check for shaming words
    const containsBannedWord = BANNED_WORDS.some(word => 
      rawText.toLowerCase().includes(word)
    );
    if (containsBannedWord) {
      console.warn('Safety Filter Triggered: Weekly summary contained banned shaming words. Falling back.');
      return getFallbackText();
    }

    return rawText;
  } catch (error) {
    console.error('Weekly summary generation failed:', error.message);
    return getFallbackText();
  }
}

module.exports = {
  generateWeeklySummary
};
