const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`) });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { sequelize } = require('../src/db');

/**
 * Reset Database Script
 * Drops all tables and recreates them
 * ⚠️ WARNING: This will DELETE ALL DATA!
 */

async function resetDatabase() {
  try {
    console.log('⚠️  WARNING: This will DROP ALL TABLES and DELETE ALL DATA!\n');
    console.log('Waiting 3 seconds... Press Ctrl+C to cancel\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🔄 Starting database reset...\n');

    // Test connection
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    // Drop all tables
    console.log('Dropping all tables...');
    /**
     * `cascade` is doing two jobs, and the options object itself is doing a
     * third.
     *
     * Dropping with no argument crashes: Sequelize's Postgres `dropTable`
     * guards `!options` when it builds the enum name and then writes
     * `options.supportsSearchPath = false` on the next line, so the first model
     * carrying an ENUM column throws "Cannot set properties of undefined".
     * `ExternalApp` is that model, which is why this started failing only once
     * external apps were added. Passing any options object avoids it.
     *
     * `cascade` then removes the need to drop in dependency order, which a
     * schema with this many foreign keys would otherwise require.
     */
    await sequelize.drop({ cascade: true });
    console.log('✓ All tables dropped\n');

    // Recreate all tables
    console.log('Creating tables...');
    await sequelize.sync({ force: true });
    console.log('✓ All tables recreated\n');

    console.log('✅ Database reset completed successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error resetting database:', error);
    process.exit(1);
  }
}

resetDatabase();
