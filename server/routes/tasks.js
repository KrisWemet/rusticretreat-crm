const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get all tasks
router.get('/', authenticateToken, (req, res) => {
  const { completed, priority } = req.query;
  let query = `
    SELECT t.*, c.partner1_name, c.partner2_name
    FROM tasks t
    LEFT JOIN couples c ON t.couple_id = c.id
  `;
  const params = [];
  const conditions = [];

  if (completed !== undefined) {
    conditions.push('t.completed = ?');
    params.push(completed === 'true' ? 1 : 0);
  }

  if (priority) {
    conditions.push('t.priority = ?');
    params.push(priority);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY t.due_date ASC, t.priority DESC, t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// Get task by id
router.get('/:id', authenticateToken, (req, res) => {
  const task = db.prepare(`
    SELECT t.*, c.partner1_name, c.partner2_name
    FROM tasks t
    LEFT JOIN couples c ON t.couple_id = c.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Create task
router.post('/', authenticateToken, (req, res) => {
  const { title, description, assigned_to, couple_id, due_date, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const result = db.prepare(`
    INSERT INTO tasks (title, description, assigned_to, couple_id, due_date, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, description || null, assigned_to || null, couple_id || null,
    due_date || null, priority || 'medium');

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

// Update task
router.put('/:id', authenticateToken, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, assigned_to, couple_id, due_date, priority, completed } = req.body;
  const isCompleted = completed !== undefined ? (completed ? 1 : 0) : task.completed;

  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, assigned_to = ?, couple_id = ?,
      due_date = ?, priority = ?, completed = ?,
      completed_at = CASE WHEN ? = 1 AND completed = 0 THEN CURRENT_TIMESTAMP
                         WHEN ? = 0 THEN NULL
                         ELSE completed_at END
    WHERE id = ?
  `).run(
    title || task.title,
    description !== undefined ? description : task.description,
    assigned_to !== undefined ? assigned_to : task.assigned_to,
    couple_id !== undefined ? couple_id : task.couple_id,
    due_date !== undefined ? due_date : task.due_date,
    priority || task.priority,
    isCompleted,
    isCompleted,
    isCompleted,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT t.*, c.partner1_name, c.partner2_name
    FROM tasks t
    LEFT JOIN couples c ON t.couple_id = c.id
    WHERE t.id = ?
  `).get(req.params.id);
  res.json(updated);
});

// Delete task
router.delete('/:id', authenticateToken, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

module.exports = router;
