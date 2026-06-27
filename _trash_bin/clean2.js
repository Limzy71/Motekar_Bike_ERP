const fs = require('fs');

let ts = fs.readFileSync('frontend/src/pages/pemasaran.ts', 'utf-8');

// 1. Remove masterKlaim variable
ts = ts.replace(/let masterKlaim: Klaim\[\] = \[\];/, '');
ts = ts.replace(/let masterKlaim: any\[\] = \[\];/, ''); // Just in case it changed

// 2. Remove async function loadKlaim()
ts = ts.replace(/async function loadKlaim\(\): Promise<void> \{[\s\S]*?\}\s*catch \{[\s\S]*?\}\s*\}/, '');

// 3. Remove function renderKlaim()
ts = ts.replace(/function renderKlaim\(\) \{[\s\S]*?\}\s*\n\s*\}/, '');

// 4. Remove leftover tab/view references
ts = ts.replace(/\[tabPipeline, tabCampaigns, tabKlaim\]/g, '[tabPipeline, tabCampaigns]');
ts = ts.replace(/\[viewPipeline, viewCampaigns, viewKlaim\]/g, '[viewPipeline, viewCampaigns]');

ts = ts.replace(/if\(tabKlaim\) tabKlaim\.className =[\s\S]*?if\(viewKlaim\) \{ viewKlaim\.style\.display[\s\S]*?\}/g, '');

fs.writeFileSync('frontend/src/pages/pemasaran.ts', ts, 'utf-8');
console.log('Cleaned further.');
