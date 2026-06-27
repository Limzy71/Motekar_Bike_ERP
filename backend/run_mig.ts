import { up } from './src/migrations/add_inventory_procurement_fields.js';
up().then(() => process.exit(0)).catch(console.error);
