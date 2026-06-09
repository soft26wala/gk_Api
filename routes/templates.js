import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import cloudinary from '../cloudinaryConfig.js'

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Store db reference (will be set by server.js)
let db = null;

// Export function to set db connection
export function setTemplatesDB(database) {
  db = database;
}
// GET all students

router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, description, image_url AS image, category, url FROM templates WHERE is_active = true ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});router.get("/templates", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, description, image_url AS image, category, url FROM templates WHERE is_active = true ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

router.post("/", upload.single('image'), async (req, res) => {
    try {
        const { name, description, category, url } = req.body;
        let imageUrl = null;

        // --- Lógica de Cloudinary ---
        if (req.file) {
            let fileBuffer;
            if (req.file.buffer) {
                fileBuffer = req.file.buffer;
            } else if (req.file.path) {
                fileBuffer = fs.readFileSync(req.file.path);
            } else {
                throw new Error('Uploaded file has no buffer or path');
            }

            const b64 = fileBuffer.toString("base64");
            const dataURI = "data:" + (req.file.mimetype || 'application/octet-stream') + ";base64," + b64;

            const resultimg = await cloudinary.uploader.upload(dataURI, {
                folder: "templates_photos",
                resource_type: "auto"
            });

            imageUrl = resultimg.secure_url;

            // Borrar archivo temporal del servidor si usas diskStorage
            if (req.file.path) fs.unlinkSync(req.file.path);
        }

        // --- Guardar en PostgreSQL ---
        const query = `
            INSERT INTO templates (name, description, image_url, category, url)
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const values = [name, description, imageUrl, category, url];
        
        const newTemplate = await db.query(query, values);

        res.status(201).json({
            message: "Template created successfully",
            data: newTemplate.rows[0]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error", details: err.message });
    }
});


router.get("/all", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM templates ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});


// GET: Fetch Single Template by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params; // URL se ID nikalne ke liye

        // Postgres query: ID ke base par product dhundna
        const query = "SELECT * FROM templates WHERE id = $1";
        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Template nahi mila!" });
        }

        // Single product object return karna
        res.json(result.rows[0]);

    } catch (err) {
        console.error("Backend Error:", err);
        res.status(500).json({ error: "Server Error", details: err.message });
    }
});



// router.get("/all", async (req, res) => {
//   try {
//     const result = await db.query("SELECT * FROM users ORDER BY id DESC");
//     res.json(result.rows);
//   } catch (err) {
//     res.status(500).send(err);
//   }
// });




// PUT: Edit existing template by ID
router.put("/:id", upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category, url } = req.body;

        // Fetch existing template to get current image URL
        const existingTemplate = await db.query(
            "SELECT image_url FROM templates WHERE id = $1",
            [id]
        );

        if (existingTemplate.rows.length === 0) {
            return res.status(404).json({ error: "Template not found" });
        }

        let imageUrl = existingTemplate.rows[0].image_url; // Use existing image by default

        // Agar naya file upload kiya hai
        if (req.file) {
            const fileBuffer = req.file.buffer || fs.readFileSync(req.file.path);
            const b64 = fileBuffer.toString("base64");
            const dataURI = `data:${req.file.mimetype};base64,${b64}`;

            const result = await cloudinary.uploader.upload(dataURI, {
                folder: "templates_photos",
            });
            imageUrl = result.secure_url;

            if (req.file.path) fs.unlinkSync(req.file.path);
        }

        const query = `
            UPDATE templates 
            SET name = $1, description = $2, image_url = $3, category = $4, url = $5
            WHERE id = $6 RETURNING *;
        `;
        const values = [name, description, imageUrl, category, url, id];
        const updatedTemplate = await db.query(query, values);

        if (updatedTemplate.rows.length === 0) {
            return res.status(404).json({ error: "Template nahi mila" });
        }

        res.json({ message: "Updated successfully", data: updatedTemplate.rows[0] });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});





export default router;
