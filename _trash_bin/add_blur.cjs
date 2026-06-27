const fs = require('fs');
const path = require('path');

const css = `
        .swal2-container {
            backdrop-filter: blur(4px) !important;
            -webkit-backdrop-filter: blur(4px) !important;
            background: rgba(15, 23, 42, 0.4) !important; /* Tailwind slate-900/40 */
        }
        
        .swal2-popup {
            border-radius: 1.5rem !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
        }
`;

const dir = 'd:/laragon/www/Motekar_ERP_TS/frontend';
fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        
        if (!content.includes('.swal2-container')) {
            content = content.replace('</style>', css + '    </style>');
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log('Added to ' + file);
        } else {
            console.log('Already in ' + file);
        }
    }
});
