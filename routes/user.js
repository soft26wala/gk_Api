import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import cloudinary from '../cloudinaryConfig.js'


const router = express.Router();

// Store db reference (will be set by server.js)
let db = null;

// Export function to set db connection
export function setUserDB(database) {
  db = database;
}

// Middleware to check if db is initialized
const checkDB = (req, res, next) => {
  if (!db) {
    return res.status(503).json({ error: "Database not initialized. Please try again in a moment." });
  }
  next();
};

// Validate numeric id parameters
const validateId = (id) => {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0;
};

// Apply checkDB middleware to all routes
router.use(checkDB);

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ==============================
// CREATE User (POSTGRES)
// ==============================





// POST: /api/auth/social-login
router.post("/social-login", async (req, res) => {
  try {
    const { name, email, photo, provider } = req.body; // photo yahan direct URL hoga

    // Check if user exists
    const userExist = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    let user;
    if (userExist.rows.length > 0) {
      // Agar user pehle se hai, toh sirf data update karein ya wahi user le lein
      user = userExist.rows[0];
    } else {
      // Agar naya user hai (Social Signup), toh insert karein
      // Password yahan NULL jayega
      const result = await db.query(
        "INSERT INTO users (name, email, photo, provider, password) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role",
        [name, email, photo, provider, null] 
      );
      user = result.rows[0];
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(200).json({ message: "Social Login Success", token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get("/users", async (req, res) => {
    try {
        // Maan lete hain aapki table ka naam 'users' hai
        const allUsers = await db.query("SELECT id, name, email, created_at FROM users ORDER BY created_at DESC");
        res.json(allUsers.rows);
    } catch (err) {
        res.status(500).json({ error: "Users fetch nahi ho paye" });
    }
});


// POST: /api/auth/signup-manual
router.post("/signup-manual", async (req, res) => {
  console.log("req aa rahi hai ");
  
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password required",
      });
    }

    // Check existing user
    const userExist = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userExist.rows.length > 0) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert User
    const result = await db.query(
      `INSERT INTO users 
      (name, email, password, provider) 
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role`,
      [name, email, hashedPassword, "manual"]
    );

    // JWT Token
    const token = jwt.sign(
      { id: result.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      message: "Signup Success",
      token,
      user: result.rows[0],
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});


router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    // Find User
    const result = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    // Compare Password
    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password",
      });
    }

    // JWT Token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role || "user",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // Success
    res.status(200).json({
      message: "Login Success",
      token,
      role: user.role || "user",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
});

// ==============================
// GET ALL Users
// ==============================
router.get("/all", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM users ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});

// ==============================
// GET Single User
// ==============================
router.get("/:id", async (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const userId = parseInt(req.params.id, 10);
    const result = await db.query("SELECT * FROM users WHERE id=$1", [userId]);
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).send(err);
  }
});

// ==============================
// UPDATE User (with photo)
// ==============================
router.put("/:id", upload.single("photo"), async (req, res) => {
  try {
    const { name, phone, age, email, gender } = req.body;
    const photo = req.file ? req.file.filename : null;

    if (!validateId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const userId = parseInt(req.params.id, 10);
    if (photo) {
      const sql = `
        UPDATE users
        SET name=$1, phone=$2, age=$3, email=$4, gender=$5, photo=$6
        WHERE id=$7
      `;
      await db.query(sql, [name, phone, age, email, gender, photo, userId]);
    } else {
      const sql = `
        UPDATE users
        SET name=$1, phone=$2, age=$3, email=$4, gender=$5
        WHERE id=$6
      `;
      await db.query(sql, [name, phone, age, email, gender, userId]);
    }

    res.json({
      message: "User updated",
      photo_url: photo ? `/uploads/${photo}` : null
    });

  } catch (err) {
    res.status(500).send(err);
  }
});

// ==============================
// DELETE User
// ==============================
router.delete("/:id", async (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const userId = parseInt(req.params.id, 10);
    await db.query("DELETE FROM users WHERE id=$1", [userId]);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).send(err);
  }
});


router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Database se user ko email ke zariye dhundein
    const userQuery = "SELECT * FROM users WHERE email = $1";
    const result = await db.query(userQuery, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid Email Please try again." });
    }

    const user = result.rows[0];

    // 2. Check karein ki user ne Google se sign up kiya tha ya password se
    if (!user.password && (user.provider === 'google' || user.provider === 'github')) {
      return res.status(400).json({ 
        message: "Is account ne Social Login use kiya hai. Please Sign in with Google/GitHub." 
      });
    }

    // 3. Password compare karein (bcrypt.compare)
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Wrong Password" });
    }

    // 4. JWT Token generate karein
    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' } // Token 7 din tak valid rahega
    );

    // 5. Success Response
    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        photo: user.photo
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});


export default router;
