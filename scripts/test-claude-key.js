import 'dotenv/config';

const apiKey = process.argv[2] || process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error('❌ No API key provided');
  console.error('Usage: node scripts/test-claude-key.js [API_KEY]');
  console.error('Or set ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

console.log('Testing Anthropic API key...\n');

try {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: 'Say "API key works!" in exactly 3 words or less.',
        },
      ],
    }),
  });

  const data = await response.json();

  if (response.ok) {
    console.log('✅ API key is valid!\n');
    console.log('Response from Claude:', data.content[0].text);

    // If key was provided as argument, show instruction to save it
    if (process.argv[2]) {
      console.log('\n📋 To use this key permanently, add to your .env file:');
      console.log(`ANTHROPIC_API_KEY=${apiKey}`);
    }
  } else {
    console.error('❌ API key validation failed');
    console.error('Error:', data.error?.message || data);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error testing API key:', error.message);
  process.exit(1);
}
