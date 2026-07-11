require('dotenv').config();
const { generateAgenticWebsite } = require('./services/websiteGenerator');

(async () => {
  try {
    const business = { name: 'Test Business', location: { city: 'Test City' }, categories: ['Test Category'] };
    const survey = { color: '#000000' };
    const brandContext = { theme: 'Modern' };
    
    // Stub callLlm so it doesn't actually call the API, just to check for syntax errors
    const aiService = require('./services/aiService');
    const res = await generateAgenticWebsite(business, survey, brandContext, (prog) => console.log(prog));
    console.log('Success!', Object.keys(res));
  } catch (err) {
    console.error('Error during generation:', err);
  }
})();
