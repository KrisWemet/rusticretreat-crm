const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple } = require('../middleware/auth');
const email = require('../services/email');

// Get all conversations (grouped by couple) - admin view
router.get('/', authenticateToken, (req, res) => {
  const conversations = db.prepare(`
    SELECT
      c.id as couple_id,
      c.partner1_name, c.partner2_name, c.email,
      COUNT(m.id) as message_count,
      MAX(m.created_at) as last_message_at,
      SUM(CASE WHEN m.read_at IS NULL AND m.sender_type = 'couple' THEN 1 ELSE 0 END) as unread_count,
      (SELECT content FROM messages WHERE couple_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM couples c
    LEFT JOIN messages m ON c.id = m.couple_id
    GROUP BY c.id
    HAVING message_count > 0
    ORDER BY last_message_at DESC
  `).all();
  res.json(conversations);
});

// Get ALL messages (used by dashboard for recent messages + unread count)
router.get('/all', authenticateToken, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, c.partner1_name, c.partner2_name
    FROM messages m JOIN couples c ON m.couple_id = c.id
    ORDER BY m.created_at ASC
  `).all();
  res.json(messages);
});

// Get unread count (must be registered before /:coupleId)
router.get('/unread/count', authenticateToken, (req, res) => {
  const count = db.prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE sender_type = 'couple' AND read_at IS NULL
  `).get();
  res.json(count);
});

// Get messages for a couple
router.get('/:coupleId', authenticateToken, (req, res) => {
  const messages = db.prepare(`
    SELECT * FROM messages WHERE couple_id = ? ORDER BY created_at ASC
  `).all(req.params.coupleId);

  // Mark couple messages as read
  db.prepare(`
    UPDATE messages SET read_at = CURRENT_TIMESTAMP
    WHERE couple_id = ? AND sender_type = 'couple' AND read_at IS NULL
  `).run(req.params.coupleId);

  res.json(messages);
});

// Send message (admin/staff)
router.post('/:coupleId', authenticateToken, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Message content required' });

  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  const result = db.prepare(`
    INSERT INTO messages (couple_id, sender_type, sender_name, content)
    VALUES (?, 'staff', ?, ?)
  `).run(req.params.coupleId, req.user.name, content);

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

  // Notify couple by email
  const preview = content.length > 200 ? content.slice(0, 197) + '...' : content;
  email.sendNewMessageCouple({
    to: couple.email,
    coupleNames: `${couple.partner1_name} & ${couple.partner2_name}`,
    senderName: req.user.name,
    preview,
  });

  res.status(201).json(message);
});

// Couple portal: get messages
router.get('/portal/:coupleId', authenticateCouple, (req, res) => {
  if (req.couple.coupleId !== parseInt(req.params.coupleId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const messages = db.prepare(`
    SELECT * FROM messages WHERE couple_id = ? ORDER BY created_at ASC
  `).all(req.params.coupleId);

  // Mark staff messages as read
  db.prepare(`
    UPDATE messages SET read_at = CURRENT_TIMESTAMP
    WHERE couple_id = ? AND sender_type = 'staff' AND read_at IS NULL
  `).run(req.params.coupleId);

  res.json(messages);
});

// Couple portal: send message
router.post('/portal/:coupleId', authenticateCouple, (req, res) => {
  if (req.couple.coupleId !== parseInt(req.params.coupleId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Message content required' });

  const senderName = `${req.couple.partner1_name} & ${req.couple.partner2_name}`;

  const result = db.prepare(`
    INSERT INTO messages (couple_id, sender_type, sender_name, content)
    VALUES (?, 'couple', ?, ?)
  `).run(req.params.coupleId, senderName, content);

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(message);
});

module.exports = router;
