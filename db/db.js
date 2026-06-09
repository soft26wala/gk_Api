import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });  // server live db link

// const pool = new Pool({  // localhost db
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASS,
//   port: process.env.DB_PORT,
//   max: 10,                    // Reduced from 20 to avoid lock contention
//   min: 2,                     // Keep minimum connections ready
//   idleTimeoutMillis: 10000,   // Reduced from 30s to close idle connections faster
//   connectionTimeoutMillis: 3000, // Reduced to 3s for faster failure detection
//   statement_timeout: 10000,   // Reduced to 10s to prevent long-running queries
//   query_timeout: 10000,       // Additional query timeout layer
// });


// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASS,
//   port: process.env.DB_PORT,
//   max: 10,                    // Reduced from 20 to avoid lock contention
//   min: 2,                     // Keep minimum connections ready
//   idleTimeoutMillis: 10000,   // Reduced from 30s to close idle connections faster
//   connectionTimeoutMillis: 3000, // Reduced to 3s for faster failure detection
//   statement_timeout: 10000,   // Reduced to 10s to prevent long-running queries
//   query_timeout: 10000,       // Additional query timeout layer
// });

// Handle pool errors
pool.on("error", (err, client) => {
  console.error("❌ Unexpected error on idle client:", err);
  isConnected = false;
});

pool.on("connect", () => {
  console.log("✅ New pool connection established");
});

pool.on("remove", () => {
  console.log("ℹ️ Connection removed from pool");
});

// Global flag
let isConnected = false;

// Retry logic for deadlock errors
export async function executeQuery(query, params = [], retries = 3) {
  const isDDL = /^\s*(CREATE|ALTER|DROP|TRUNCATE|COMMENT)\s+/i.test(query.trim());

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await pool.query(query, params);
    } catch (err) {
      // Code 40P01 = deadlock detected
      if (err.code === "40P01" && attempt < retries - 1) {
        const delay = isDDL
          ? Math.pow(2, attempt) * 200  // Longer delay for DDL operations (200ms, 400ms, 800ms)
          : Math.pow(2, attempt) * 100; // Shorter delay for DML operations (100ms, 200ms, 400ms)
        console.warn(`⚠️ Deadlock detected in ${isDDL ? 'DDL' : 'DML'} operation. Retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

export async function connectDB() {
  if (isConnected) {
    console.log("ℹ️ Database already connected, returning existing pool");
    return createPoolWrapper();
  }

  // Prevent concurrent initialization
  if (global.dbInitializing) {
    console.log("ℹ️ Database initialization in progress, waiting...");
    while (global.dbInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return createPoolWrapper();
  }

  global.dbInitializing = true;

  try {
    console.log("🚀 Initializing Database...");

    // First, test the connection
    await pool.query("SELECT 1");
    console.log("✅ Database connection established");

    const files = [
      "user.sql",                // Create users first (no dependencies)
      "templates.sql",           // Create templates (no dependencies)
      // "buy_course.sql",          // Then create buy_course
      // "callback.sql",            // Independent
      // "student.sql",             // Independent
      // "event.sql",               // Independent
      // "payments.sql",            // After other tables are created       // Independent
      // "clients.sql",             // Independent
      // "builder.sql",             // Independent
    ];

    for (const file of files) {
      const filePath = path.join(__dirname, file);

      if (fs.existsSync(filePath)) {
        const schema = fs.readFileSync(filePath, "utf8");

        try {
          await pool.query(schema);
          console.log(`📑 Executed ${file}`);
        } catch (err) {
          // Code 42P07 = table already exists
          // Code 23505 = unique constraint violation
          // Code 42701 = column already exists
          // Code 42P16 = invalid table definition (duplicate constraint)
          // Code 42710 = duplicate object (index, trigger, etc.)
          // Code 40P01 = deadlock detected
          if (err.code === "42P07" || err.code === "23505" || err.code === "42701" ||
              err.code === "42P16" || err.code === "42710" || err.code === "40P01") {
            console.log(`ℹ️ Skipped ${file} (already exists or conflict)`);
          } else {
            console.error(`❌ Error in ${file}:`, err.message);
            throw err;
          }
        }
      }

      // Small delay between file executions to prevent DDL conflicts
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    isConnected = true;
    console.log("✅ Database Ready!");

    return createPoolWrapper();
  } catch (err) {
    isConnected = false;  // Reset on error to allow retry
    console.error("❌ DB Error:", err.message);
    throw err;
  } finally {
    global.dbInitializing = false;
  }
}

// Wrapper to add automatic deadlock retry logic
function createPoolWrapper() {
  return {
    query: async (query, params) => {
      return executeQuery(query, params);
    },
    // Pass through other pool methods
    end: () => pool.end(),
    connect: () => pool.connect(),
  };
}