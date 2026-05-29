const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

cloudinary.config(); // reads CLOUDINARY_URL env var automatically

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
  filename:     String,   // Cloudinary public_id (used for deletion)
  videoUrl:     String,   // Cloudinary secure URL for playback
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed.'));
  }
});

function formatDuration(seconds) {
  const secs = Math.round(parseFloat(seconds));
  if (isNaN(secs)) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
      return res.render('upload', { error: 'Title is required.' });
    }

    if (!req.file) {
      return res.render('upload', { error: 'Please select a video file.' });
    }

    let cloudResult;
    try {
      cloudResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'video', folder: 'mahivids/videos', public_id: uuidv4() },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(req.file.buffer);
      });
    } catch (uploadErr) {
      return res.render('upload', { error: 'Video upload failed: ' + uploadErr.message });
    }

    const thumbnail = cloudinary.url(cloudResult.public_id, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [{ width: 640, height: 360, crop: 'fill', quality: 'auto' }]
    });

    const id = uuidv4();
    await Video.create({
      id,
      title:        title.trim(),
      description:  (description || '').trim(),
      filename:     cloudResult.public_id,
      videoUrl:     cloudResult.secure_url,
      originalName: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
      uploadedAt:   new Date().toISOString(),
      tags: (req.body.tags || '').split(',')
        .map(t => t.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 30))
        .filter(t => t.length > 0)
        .slice(0, 10),
      thumbnail,
      duration: cloudResult.duration ? formatDuration(cloudResult.duration) : null,
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

  if (video.filename) {
    try {
      await cloudinary.uploader.destroy(video.filename, { resource_type: 'video' });
    } catch { /* best-effort */ }
  }

  res.json({ success: true });
});

module.exports = router;
