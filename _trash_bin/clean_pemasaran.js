const fs = require('fs');

let ts = fs.readFileSync('frontend/src/pages/pemasaran.ts', 'utf-8');

// 1. Remove Klaim interface
ts = ts.replace(/interface Klaim \{[\s\S]*?\}/, '');

// 2. Remove loadKlaim function
ts = ts.replace(/const loadKlaim = async \(\) => \{[\s\S]*?\}\s*catch \{[\s\S]*?\}\s*\};/, '');

// 3. Remove klaim rendering function (renderKlaimTable)
ts = ts.replace(/const renderKlaimTable = \(data: Klaim\[\]\) => \{[\s\S]*?\};\n/, '');

// 4. Remove all klaim modal handlers and initializers
ts = ts.replace(/const modalKlaim = document\.getElementById\('modal-klaim'\);[\s\S]*?id_campaign: c\.id_campaign/g, 'id_campaign: c.id_campaign');

// 5. Replace switchTab
ts = ts.replace(/const switchTab = \(tabName: 'pipeline' \| 'campaigns' \| 'klaim'\) => \{[\s\S]*?\}\s*else if \(tabName === 'klaim'\) \{[\s\S]*?\}\s*\};/, `const switchTab = (tabName: 'pipeline' | 'campaigns') => {
        const reset = () => {
            [tabPipeline, tabCampaigns].forEach(t => {
                if(t) t.className = "pb-3 px-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors";
            });
            [viewPipeline, viewCampaigns].forEach(v => {
                if(v) {
                    v.style.display = 'none';
                    v.classList.remove('animate-fade-in');
                }
            });
        };
        reset();
        localStorage.setItem('pemasaranLastTab', tabName);
        if (tabName === 'pipeline') {
            if(tabPipeline) tabPipeline.className = "pb-3 px-2 text-sm font-bold text-primary border-b-2 border-primary transition-colors";
            if(viewPipeline) { viewPipeline.style.display = 'block'; viewPipeline.classList.add('animate-fade-in'); }
        } else if (tabName === 'campaigns') {
            if(tabCampaigns) tabCampaigns.className = "pb-3 px-2 text-sm font-bold text-primary border-b-2 border-primary transition-colors";
            if(viewCampaigns) { viewCampaigns.style.display = 'block'; viewCampaigns.classList.add('animate-fade-in'); }
        }
    };`);

// 6. Fix tab init
ts = ts.replace(/tabKlaim\?\.addEventListener\('click', \(\) => switchTab\('klaim'\)\);[\s\S]*?else if \(lastTab === 'klaim'\) \{[\s\S]*?\}\s*else \{/g, `
    const lastTab = localStorage.getItem('pemasaranLastTab');
    if (lastTab === 'campaigns') {
        switchTab('campaigns');
    } else {
`);

// 7. Remove loadKlaim() call inside DOMContentLoaded
ts = ts.replace(/\s*await loadKlaim\(\);/g, '');

// 8. Remove element selectors
ts = ts.replace(/const tabKlaim = document\.getElementById\('tab-klaim'\);/, '');
ts = ts.replace(/const viewKlaim = document\.getElementById\('view-klaim'\);/, '');

// 9. Remove klaim from anti-flicker array
ts = ts.replace(/else if \(tab === 'klaim'\) \{[\s\S]*?\}\s*\}\)/, '})');

fs.writeFileSync('frontend/src/pages/pemasaran.ts', ts, 'utf-8');
console.log('pemasaran.ts cleaned');
