const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const THUMBS_DIR  = path.join(__dirname, '..', 'thumbnails');

[UPLOADS_DIR, THUMBS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const commentSchema = new mongoose.Schema({
  id:        { type: String, default: () => uuidv4() },
  name:      String,
  text:      String,
  createdAt: String
}, { _id: false });

const videoSchema = new mongoose.Schema({
  id:           { type: String, required: true, unique: true },
  title:        String,
  description:  String,
  filename:     String,
  originalName: String,
  mimetype:     String,
  size:         Number,
  uploadedAt:   String,
  tags:         [String],
  thumbnail:    String,
  duration:     String,
  views:        { type: Number, default: 0 },
  likes:        { type: Number, default: 0 },
  comments:     [commentSchema]
});

const Video = mongoose.models.Video || mongoose.model('Video', videoSchema);

function generateThumbnail(videoPath, thumbPath) {
  try {
    execSync(
      `ffmpeg -y -i "${videoPath}" -ss 00:00:01 -vframes 1 ` +
      `-vf "scale=640:360:force_original_aspect_ratio=decrease,` +
      `pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black" ` +
      `"${thumbPath}"`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

function getVideoDuration(videoPath) {
  try {
    const raw = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { stdio: 'pipe' }
    ).toString().trim();
    const secs = Math.round(parseFloat(raw));
    if (isNaN(secs)) return null;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed.'));
    }
  }
});

router.get('/', async (req, res) => {
  const videos = await Video.find().sort({ uploadedAt: -1 }).lean();
  res.render('index', { videos });
});

router.get('/upload', (req, res) => {
  res.render('upload', { error: null });
});

router.post('/upload', (req, res) => {
  upload.single('video')(req, res, async (err) => {
    if (err) return res.render('upload', { error: err.message });

    const { title, description } = req.body;

    if (!title || !title.trim()) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.render('upload', { error: 'Title is required.' });
    }

    if (!req.file) {
      return res.render('upload', { error: 'Please select a video file.' });
    }

    const id = uuidv4();
    const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);
    const thumbnail = generateThumbnail(req.file.path, thumbPath)
      ? `/thumbnails/${id}.jpg`
      : null;

    await Video.create({
      id,
      title:        title.trim(),
      description:  (description || '').trim(),
      filename:     req.file.filename,
      originalName: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
      uploadedAt:   new Date().toISOString(),
      tags: (req.body.tags || '').split(',')
        .map(t => t.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 30))
        .filter(t => t.length > 0)
        .slice(0, 10),
      thumbnail,
      duration: getVideoDuration(req.file.path),
    });

    res.redirect(`/watch/${id}`);
  });
});

router.get('/watch/:id', async (req, res) => {
  const video = await Video.findOneAndUpdate(
    { id: req.params.id },
    { $inc: { views: 1 } },
    { new: true }
  ).lean();

  if (!video) return res.status(404).render('404', { message: 'Video not found.' });

  const related = await Video.find({ id: { $ne: video.id } })
    .sort({ uploadedAt: -1 })
    .limit(8)
    .lean();

  res.render('watch', { video, related });
});

router.post('/video/:id/comment', async (req, res) => {
  const { name, text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Comment text is required.' });
  }

  const comment = {
    id:        uuidv4(),
    name:      (name || '').trim() || 'Anonymous',
    text:      text.trim().slice(0, 1000),
    createdAt: new Date().toISOString()
  };

  const video = await Video.findOneAndUpdate(
    { id: req.params.id },
    { $push: { comments: comment } },
    { new: true }
  );
  if (!video) return res.status(404).json({ error: 'Video not found.' });

  res.json({ comment });
});

router.post('/video/:id/like', async (req, res) => {
  const video = await Video.findOneAndUpdate(
    { id: req.params.id },
    { $inc: { likes: 1 } },
    { new: true }
  );
  if (!video) return res.status(404).json({ error: 'Video not found.' });
  res.json({ likes: video.likes });
});

router.delete('/video/:id', async (req, res) => {
  const video = await Video.findOneAndDelete({ id: req.params.id });
  if (!video) return res.status(404).json({ error: 'Video not found.' });

  const filePath = path.join(UPLOADS_DIR, video.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  const thumbPath = path.join(THUMBS_DIR, `${video.id}.jpg`);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

  res.json({ success: true });
});

module.exports = router;
