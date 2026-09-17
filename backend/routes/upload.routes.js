const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');
const authenticate = require('../middleware/auth.middleware');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB cap

// Upload a file to a room
router.post('/:roomCode', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { roomCode } = req.params;
    await pool.query(
      `INSERT INTO room_files (room_code, uploaded_by, original_name, stored_name)
       VALUES ($1, $2, $3, $4)`,
      [roomCode, req.user.id, req.file.originalname, req.file.filename]
    );

    res.status(201).json({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      url: `/uploads/${req.file.filename}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// List files shared in a room
router.get('/:roomCode', authenticate, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const result = await pool.query(
      'SELECT original_name, stored_name, created_at FROM room_files WHERE room_code = $1 ORDER BY created_at DESC',
      [roomCode]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch files' });
  }
});

module.exports = router;
