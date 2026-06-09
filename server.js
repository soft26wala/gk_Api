import express from "express";
import { connectDB } from "./db/db.js";
import user, { setUserDB } from "./routes/user.js";
import callback, { setCallbackDB } from "./routes/callback.js";
import temRoute, { setTemplatesDB } from "./routes/templates.js";
import cors from "cors";

import { configDotenv } from "dotenv";

configDotenv();

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  cors({
    origin: [
      process.env.clientUrl,
      "http://127.0.0.1:5500",
      "http://127.0.0.1:5501",
      "http://127.0.0.1:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use("/uploads", express.static("uploads"));

let db;

const startServer = async () => {
  try {
    db = await connectDB(); // database auto create
    console.log("✅ Database connected successfully!");

    // Pass db to user routes
    setUserDB(db);

    app.use((req, res, next) => {
      console.log("👉 HIT:", req.method, req.url);
      next();
    });

  
    setCallbackDB(db);
    setTemplatesDB(db);
   app.get("/", (req, res) => {
      res.send("Welcome to GK Enterprise API");
    } );
   
    app.use("/templates", temRoute);
    app.use("/user", user);

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => console.log("🚀 Server running on port:", PORT));
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
};

startServer();
