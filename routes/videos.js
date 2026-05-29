const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const UPLOADS_DIR    = path.join(__dirname, '..', 'uploads');
const THUMBS_DIR     = path.join(__dirname, '..', 'thumbnails');
const DATA_DIR       = path.join(__dirname, '..', 'data');
const DATA_FILE      = path.join(DATA_DIR, 'videos.json');

[UPLOADS_DIR, THUMBS_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

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

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
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

function readVideos() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeVideos(videos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(videos, null, 2));
}

router.get('/', (req, res) => {
  const videos = readVideos().reverse();
  res.render('index', { videos });
});

router.get('/upload', (req, res) => {
  res.render('upload', { error: null });
});

router.post('/upload', (req, res) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      return res.render('upload', { error: err.message });
    }

    const { title, description } = req.body;

    if (!title || !title.trim()) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.render('upload', { error: 'Title is required.' });
    }

    if (!req.file) {
      return res.render('upload', { error: 'Please select a video file.' });
    }

    const video = {
      id: uuidv4(),
      title: title.trim(),
      description: (description || '').trim(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      tags: (req.body.tags || '').split(',')
        .map(t => t.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 30))
        .filter(t => t.length > 0)
        .slice(0, 10),
      thumbnail: null,
      duration: null,
      views: 0,
      likes: 0,
      comments: []
    };

    // Generate thumbnail + extract duration via FFmpeg
    const thumbPath = path.join(THUMBS_DIR, `${video.id}.jpg`);
    if (generateThumbnail(req.file.path, thumbPath)) {
      video.thumbnail = `/thumbnails/${video.id}.jpg`;
    }
    video.duration = getVideoDuration(req.file.path);

    const videos = readVideos();
    videos.push(video);
    writeVideos(videos);

    res.redirect(`/watch/${video.id}`);
  });
});

router.get('/watch/:id', (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.id === req.params.id);

  if (!video) {
    return res.status(404).render('404', { message: 'Video not found.' });
  }

  video.views = (video.views || 0) + 1;
  writeVideos(videos);

  const related = videos.filter(v => v.id !== video.id).reverse().slice(0, 8);
  res.render('watch', { video, related });
});

router.post('/video/:id/comment', (req, res) => {
  const { name, text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Comment text is required.' });
  }

  const videos = readVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found.' });

  const comment = {
    id: uuidv4(),
    name: (name || '').trim() || 'Anonymous',
    text: text.trim().slice(0, 1000),
    createdAt: new Date().toISOString()
  };

  if (!video.comments) video.comments = [];
  video.comments.push(comment);
  writeVideos(videos);

  res.json({ comment });
});

router.post('/video/:id/like', (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found.' });
  video.likes = (video.likes || 0) + 1;
  writeVideos(videos);
  res.json({ likes: video.likes });
});

router.delete('/video/:id', (req, res) => {
  const videos = readVideos();
  const idx = videos.findIndex(v => v.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: 'Video not found.' });

  const [video] = videos.splice(idx, 1);
  const filePath = path.join(UPLOADS_DIR, video.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  const thumbPath = path.join(THUMBS_DIR, `${video.id}.jpg`);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

  writeVideos(videos);
  res.json({ success: true });
});

module.exports = router;
